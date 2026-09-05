import { paymentKeyHashesForSigning } from './addresses';
import { getUtxos } from './chain-reads';
import { signTx, signTxHW, submitTx } from './signing';
import { getNetwork } from './storage';
import { ERROR } from '../../config/config';
import { cacheKey, withCache } from '../cache';
import Loader from '../loader';
import {
  buildProtocolParametersSnapshot,
  fetchKoiosTipSlot,
  latestEpochParamsRow,
} from '../tx/protocol-params';
import {
  applyRewardWithdrawal,
  assembleCertTx,
  buildUnsignedSendAllTx,
  buildUnsignedSimpleTx,
  summarizeSendAllTx,
  type RewardWithdrawal,
} from '../tx/csl-unsigned-tx';
import {
  createStakeDelegationCertificate,
  createStakeRegistrationCertificate,
} from '../tx/staking-certificates';
import type {
  Csl,
  KoiosEpochParamsRow,
  KoiosRequestEnhanced,
  ProtocolParametersSnapshot,
} from '../types';
import { koiosRequestEnhanced as koiosRequestEnhancedUntyped } from '../util';
import {
  canWithdrawRewards,
  REWARD_WITHDRAWAL_NEEDS_DREP,
} from '../staking';
import { DREP_NOT_REGISTERED } from '../governance';

const koiosRequestEnhanced = koiosRequestEnhancedUntyped as KoiosRequestEnhanced;

type WalletAccount = {
  paymentAddr: string;
  rewardAddr?: string;
  stakeKeyHash: string;
  paymentKeyHash?: string;
  index?: number | string;
};

type DelegationState = {
  registered?: boolean;
  active?: boolean;
  rewards?: string | number;
  delegatedDrep?: string;
};

const utxosOrEmpty = async () => (await getUtxos()) || [];

const txToHex = (tx: { to_bytes: () => Uint8Array }) =>
  Buffer.from(tx.to_bytes()).toString('hex');

const rewardLovelace = (delegation: DelegationState) =>
  Number(delegation.rewards ?? 0);

const rewardLovelaceString = (delegation?: DelegationState | null) => {
  try {
    const n = BigInt(String(delegation?.rewards ?? '0'));
    return n > 0n ? n.toString() : '0';
  } catch {
    return '0';
  }
};

/** Full reward withdrawal only when Conway allows it (vote-delegated). */
const rewardWithdrawalIfAllowed = (
  account?: WalletAccount | null,
  delegation?: DelegationState | null
): RewardWithdrawal | undefined => {
  const rewards = rewardLovelaceString(delegation);
  if (rewards === '0' || !account?.rewardAddr) return undefined;
  if (!canWithdrawRewards(delegation)) return undefined;
  return {
    rewardAddressBech32: account.rewardAddr,
    amountLovelace: rewards,
  };
};

const uniqueKeyHashes = (hashes: Array<string | undefined | null>) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hashes) {
    if (!h || seen.has(h)) continue;
    seen.add(h);
    out.push(h);
  }
  return out;
};

/** Payment (+ enabled extras) and stake; DRep when voting. Used only to size dummy vkeys. */
const certRequiredVkeyHashes = async (
  account: WalletAccount,
  extra: Array<string | undefined | null> = []
) => {
  const paymentHashes = (await paymentKeyHashesForSigning(account)).filter(
    (h: unknown): h is string => typeof h === 'string' && h.length > 0
  );
  const payment =
    paymentHashes.length > 0
      ? paymentHashes
      : [account.paymentKeyHash].filter((h): h is string => Boolean(h));
  return uniqueKeyHashes([...payment, account.stakeKeyHash, ...extra]);
};

/** True when CSL/coin-selection failed because ADA (not tokens) could not cover the send. */
export const isInsufficientAdaError = (error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error || '');
  if (/Not enough of the selected token/i.test(msg)) return false;
  return /UTxO Balance Insufficient|Not enough ADA|leftover|Insufficient input/i.test(
    msg
  );
};

export const rewardWithdrawalLovelaceFromTx = (tx: any): string => {
  try {
    const withdrawals = tx?.body?.()?.withdrawals?.();
    if (!withdrawals || withdrawals.len() === 0) return '0';
    let sum = 0n;
    const keys = withdrawals.keys();
    for (let i = 0; i < keys.len(); i += 1) {
      sum += BigInt(withdrawals.get(keys.get(i)).to_str());
    }
    return sum.toString();
  } catch {
    return '0';
  }
};

/** Payment hashes, plus the stake key when the body withdraws rewards. */
export const keyHashesForTx = (
  tx: any,
  paymentHashes: string[],
  stakeKeyHash?: string | null
) => {
  const hashes = uniqueKeyHashes(paymentHashes || []);
  if (
    rewardWithdrawalLovelaceFromTx(tx) !== '0' &&
    stakeKeyHash &&
    !hashes.includes(stakeKeyHash)
  ) {
    hashes.push(stakeKeyHash);
  }
  return hashes;
};

type SubmitError = Error & { code: string; cause?: unknown };

function assertDelegationBuildInputs(
  account: WalletAccount,
  protocolParameters: ProtocolParametersSnapshot,
  poolKeyHash: string
) {
  if (!account?.paymentAddr) {
    throw new Error('Payment address is required to build delegation transaction');
  }
  if (!account?.stakeKeyHash || !/^[0-9a-fA-F]{56}$/.test(account.stakeKeyHash)) {
    throw new Error('Stake key hash is missing or invalid');
  }
  if (!poolKeyHash || !/^[0-9a-fA-F]{56}$/.test(poolKeyHash)) {
    throw new Error('Stake pool id is missing or invalid');
  }
  if (!protocolParameters?.keyDeposit || !protocolParameters?.linearFee) {
    throw new Error('Protocol parameters are incomplete');
  }
}

/**
 * Assemble a signed transaction from an unsigned tx and a witness set.
 * CSL v15 only supports Transaction.new(body, witness_set, auxiliary_data?).
 * The old 4-argument form (…, true, auxiliary_data) passes boolean `true` as
 * auxiliary_data and throws "expected instance of AuxiliaryData".
 */
export const assembleSignedTransaction = async (
  unsignedTx: any,
  witnessSet: any
) => {
  await Loader.load();
  const signed = Loader.Cardano.Transaction.new(
    unsignedTx.body(),
    witnessSet,
    unsignedTx.auxiliary_data()
  );
  signed.set_is_valid(unsignedTx.is_valid());
  return signed;
};

/**
 * Protocol-parameter snapshot for fee estimation and display.
 *
 * Cached per network (shared TTL) so repeated screen visits (wallet balance,
 * staking preview) don't refetch epoch params + tip each time. This is
 * build-safe: `buildTx` re-fetches the tip slot at construction time, and the
 * certificate txs bound their TTL at `slot + 6h`, so a slightly stale cached
 * slot can never yield an already-expired invalidHereafter. Pass
 * `{ force: true }` to bypass (pull-to-refresh).
 */
export const initTx = async ({
  force = false,
}: { force?: boolean } = {}): Promise<ProtocolParametersSnapshot> => {
  const network = await getNetwork();
  return withCache(cacheKey('protocol-params', network?.id), fetchProtocolParameters, {
    force,
  });
};

const fetchProtocolParameters = async () => {
  try {
    const tipSlot = await fetchKoiosTipSlot(koiosRequestEnhanced);
    const p = await koiosRequestEnhanced('/epoch_params/latest');
    if (process.env.NODE_ENV !== 'production') {
      console.log('Protocol parameters response:', p);
    }
    const row = latestEpochParamsRow(p as KoiosEpochParamsRow);
    const protocolParams = buildProtocolParametersSnapshot(row, tipSlot);
    if (process.env.NODE_ENV !== 'production') {
      console.log('Processed protocol parameters:', protocolParams);
    }
    return protocolParams;
  } catch (error) {
    console.error('Error in initTx:', error);
    throw error;
  }
};

/**
 * Build unsigned payment transaction (CSL via `src/api/tx/csl-unsigned-tx.ts`).
 * Refreshes chain tip slot so TTL stays valid when UI skips `initTx()`.
 *
 * When amount + fee exceeds spendable UTxOs but unclaimed staking rewards cover
 * the gap, attaches a **full** reward withdrawal (ledger rule) so the home
 * headline of UTxO + rewards is actually spendable. Change absorbs the remainder.
 */
export const buildTx = async (
  account: WalletAccount,
  utxos: any[],
  outputs: any,
  protocolParameters: ProtocolParametersSnapshot,
  auxiliaryData: any = null,
  options?: { delegation?: DelegationState | null }
) => {
  try {
    await Loader.load();

    if (!protocolParameters) {
      throw new Error('Protocol parameters are required but not provided');
    }

    const params = {
      ...protocolParameters,
      slot: await fetchKoiosTipSlot(koiosRequestEnhanced),
    };

    const paymentHashes = (await paymentKeyHashesForSigning(account)).filter(
      (h: unknown): h is string => typeof h === 'string' && h.length > 0
    );
    const requiredVkeyHashesHex =
      paymentHashes.length > 0
        ? paymentHashes
        : [account.paymentKeyHash].filter((h): h is string => Boolean(h));
    if (requiredVkeyHashesHex.length === 0) {
      throw new Error(
        'Account missing payment key hash for fee estimation'
      );
    }

    const assemble = (withdrawal?: RewardWithdrawal | null) => {
      const hashes = uniqueKeyHashes([
        ...requiredVkeyHashesHex,
        ...(withdrawal && account.stakeKeyHash ? [account.stakeKeyHash] : []),
      ]);
      return buildUnsignedSimpleTx({
        Cardano: Loader.Cardano,
        protocolParameters: params,
        utxos,
        outputs,
        changeAddressBech32: account.paymentAddr,
        requiredVkeyHashesHex: hashes,
        auxiliaryData,
        withdrawal: withdrawal || undefined,
      });
    };

    try {
      return assemble();
    } catch (first) {
      const rewards = rewardLovelaceString(options?.delegation);
      if (
        rewards !== '0' &&
        account.rewardAddr &&
        isInsufficientAdaError(first)
      ) {
        if (!canWithdrawRewards(options?.delegation)) {
          throw new Error(
            'This send needs your staking rewards, but withdrawing them requires vote delegation. Delegate voting power in Vote, or send a smaller amount.'
          );
        }
        try {
          return assemble({
            rewardAddressBech32: account.rewardAddr,
            amountLovelace: rewards,
          });
        } catch (second) {
          if (isInsufficientAdaError(second)) {
            throw new Error(
              'Not enough ADA (including staking rewards) to cover this send and the network fee.'
            );
          }
          throw second;
        }
      }
      throw first;
    }
  } catch (e) {
    console.error('Error building transaction:', e);
    throw e;
  }
};

/**
 * Build an unsigned "send all" transaction that sweeps the entire wallet balance
 * (all lovelace + every native token, minus fee) to `recipientAddress`. Consumes
 * every UTxO — unlike `buildTx`, no coin selection runs, so nothing is stranded.
 * Refreshes the chain tip slot so TTL stays valid when the UI skips `initTx()`.
 */
export const sendAllTx = async (
  utxos: any[],
  recipientAddress: string,
  protocolParameters: ProtocolParametersSnapshot,
  auxiliaryData: any = null,
  options?: { account?: WalletAccount; delegation?: DelegationState | null }
) => {
  try {
    await Loader.load();

    if (!protocolParameters) {
      throw new Error('Protocol parameters are required but not provided');
    }

    const params = {
      ...protocolParameters,
      slot: await fetchKoiosTipSlot(koiosRequestEnhanced),
    };

    const paymentHashes = (await paymentKeyHashesForSigning()).filter(
      (h: unknown): h is string => typeof h === 'string' && h.length > 0
    );
    const withdrawal = rewardWithdrawalIfAllowed(
      options?.account,
      options?.delegation
    );
    const requiredVkeyHashesHex = uniqueKeyHashes([
      ...paymentHashes,
      ...(withdrawal && options?.account?.stakeKeyHash
        ? [options.account.stakeKeyHash]
        : []),
    ]);

    return buildUnsignedSendAllTx({
      Cardano: Loader.Cardano,
      protocolParameters: params,
      utxos,
      recipientAddressBech32: recipientAddress,
      requiredVkeyHashesHex,
      auxiliaryData,
      withdrawal,
    });
  } catch (e) {
    console.error('Error building send all transaction:', e);
    throw e;
  }
};

/**
 * Read back the fee and the total lovelace swept by a send-all transaction
 * directly from the built CSL `Transaction`, so the UI never has to re-derive
 * these from persisted balance state.
 */
export const summarizeSendAll = (finalTx: any) =>
  summarizeSendAllTx(Loader.Cardano as Csl, finalTx);

export const signAndSubmit = async (
  tx: any,
  { keyHashes, accountIndex }: { keyHashes: string[]; accountIndex: number | string },
  password: string
) => {
  await Loader.load();
  const witnessSet = await signTx(
    txToHex(tx),
    keyHashes,
    password,
    accountIndex
  );
  const transaction = await assembleSignedTransaction(tx, witnessSet);

  try {
    const txHash = await submitTx(txToHex(transaction));
    return txHash;
  } catch (e) {
    throw wrapSubmitError(e);
  }
};

export const signAndSubmitHW = async (
  tx: any,
  {
    keyHashes,
    account,
    hw,
    partialSign,
  }: {
    keyHashes: string[];
    account: WalletAccount;
    hw: unknown;
    partialSign?: boolean;
  }
) => {
  await Loader.load();

  const witnessSet = await signTxHW(
    txToHex(tx),
    keyHashes,
    account,
    hw,
    partialSign
  );

  const transaction = await assembleSignedTransaction(tx, witnessSet);

  try {
    const txHash = await submitTx(txToHex(transaction));
    return txHash;
  } catch (e) {
    throw wrapSubmitError(e);
  }
};

/** Preserve the provider message while keeping `code: ERROR.submit` for UI checks. */
export const wrapSubmitError = (error: unknown): SubmitError => {
  const raw =
    error &&
    error !== ERROR.submit &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as Error).message
      : 'Transaction submission failed';
  const message = /FeeTooSmallUTxO/i.test(raw)
    ? 'The network rejected this transaction because the fee was too small. Try sending again.'
    : /ConwayWdrlNotDelegatedToDRep/i.test(raw)
      ? REWARD_WITHDRAWAL_NEEDS_DREP
      : /DelegateeDRepNotRegisteredDELEG/i.test(raw)
        ? DREP_NOT_REGISTERED
        : raw;
  const wrapped = new Error(message) as SubmitError;
  wrapped.code = ERROR.submit;
  if (error && error !== ERROR.submit) {
    wrapped.cause = error;
  }
  return wrapped;
};

export const delegationTx = async (
  account: WalletAccount,
  delegation: DelegationState,
  protocolParameters: ProtocolParametersSnapshot,
  poolKeyHash: string
) => {
  await Loader.load();
  assertDelegationBuildInputs(account, protocolParameters, poolKeyHash);

  return assembleCertTx({
    Cardano: Loader.Cardano,
    protocolParameters,
    changeAddressBech32: account.paymentAddr,
    getUtxos: utxosOrEmpty,
    requiredVkeyHashesHex: await certRequiredVkeyHashes(account),
    emptyUtxosMessage:
      'No spendable ADA in this account. Delegating needs ADA to cover the stake deposit and the network fee.',
    label: 'Delegation transaction',
    configure: (txBuilder, Cardano) => {
      const certsBuilder = Cardano.CertificatesBuilder.new();
      if (!delegation.registered) {
        certsBuilder.add(
          createStakeRegistrationCertificate(Cardano, account.stakeKeyHash)
        );
      }
      certsBuilder.add(
        createStakeDelegationCertificate(Cardano, account.stakeKeyHash, poolKeyHash)
      );
      txBuilder.set_certs_builder(certsBuilder);
    },
  });
};

export const voteDelegationTx = async (
  account: WalletAccount,
  delegation: DelegationState,
  protocolParameters: ProtocolParametersSnapshot,
  drepIdType: 'always_abstain' | 'always_no_confidence' | 'key_hash' | string,
  drepHashHex?: string
) => {
  await Loader.load();

  return assembleCertTx({
    Cardano: Loader.Cardano,
    protocolParameters,
    changeAddressBech32: account.paymentAddr,
    getUtxos: utxosOrEmpty,
    requiredVkeyHashesHex: await certRequiredVkeyHashes(account),
    emptyUtxosMessage: 'No UTxOs available to pay vote delegation fee',
    label: 'Vote delegation transaction',
    configure: (txBuilder, Cardano) => {
      const certsBuilder = Cardano.CertificatesBuilder.new();
      if (!delegation.registered) {
        certsBuilder.add(
          createStakeRegistrationCertificate(Cardano, account.stakeKeyHash)
        );
      }

      const stakeCredential = Cardano.Credential.from_keyhash(
        Cardano.Ed25519KeyHash.from_bytes(Buffer.from(account.stakeKeyHash, 'hex'))
      );

      let drep;
      if (drepIdType === 'always_abstain') {
        drep = Cardano.DRep.new_always_abstain();
      } else if (drepIdType === 'always_no_confidence') {
        drep = Cardano.DRep.new_always_no_confidence();
      } else {
        if (!drepHashHex) throw new Error('Missing DRep key hash');
        drep = Cardano.DRep.new_key_hash(
          Cardano.Ed25519KeyHash.from_bytes(Buffer.from(drepHashHex, 'hex'))
        );
      }

      certsBuilder.add(
        Cardano.Certificate.new_vote_delegation(
          Cardano.VoteDelegation.new(stakeCredential, drep)
        )
      );
      txBuilder.set_certs_builder(certsBuilder);
    },
  });
};

/**
 * Build a governance vote transaction. The current wallet votes as a DRep on a
 * single governance action. Must be witnessed by the DRep key (role-3) — pass
 * `[account.paymentKeyHash, drepKeyHashHex]` as keyHashes when signing.
 *
 * @param {object} account
 * @param {object} protocolParameters
 * @param {object} vote
 * @param {string} vote.drepKeyHashHex   raw 28-byte DRep key hash (hex)
 * @param {string} vote.proposalTxHash   governance action tx hash (64 hex)
 * @param {number} vote.proposalIndex    governance action cert index
 * @param {'yes'|'no'|'abstain'} vote.voteKind
 */
export const voteTx = async (
  account: WalletAccount,
  protocolParameters: ProtocolParametersSnapshot,
  vote: {
    drepKeyHashHex?: string;
    proposalTxHash?: string;
    proposalIndex?: number | null;
    voteKind?: 'yes' | 'no' | 'abstain' | string;
  }
) => {
  await Loader.load();

  const { drepKeyHashHex, proposalTxHash, proposalIndex, voteKind } = vote || {};
  if (!drepKeyHashHex) throw new Error('Missing DRep key hash for vote');
  if (!proposalTxHash || proposalIndex === null || proposalIndex === undefined) {
    throw new Error('This proposal is missing a governance action id and cannot be voted on');
  }

  const voteKinds: Record<string, unknown> = {
    yes: Loader.Cardano.VoteKind.Yes,
    no: Loader.Cardano.VoteKind.No,
    abstain: Loader.Cardano.VoteKind.Abstain,
  };
  const voteKindEnum = voteKind ? voteKinds[voteKind] : undefined;
  if (voteKindEnum === undefined) throw new Error(`Unknown vote kind: ${voteKind}`);

  return assembleCertTx({
    Cardano: Loader.Cardano,
    protocolParameters,
    changeAddressBech32: account.paymentAddr,
    getUtxos: utxosOrEmpty,
    requiredVkeyHashesHex: await certRequiredVkeyHashes(account, [
      drepKeyHashHex,
    ]),
    emptyUtxosMessage: 'No UTxOs available to pay voting fee',
    label: 'Vote transaction',
    configure: (txBuilder, Cardano) => {
      const drepCredential = Cardano.Credential.from_keyhash(
        Cardano.Ed25519KeyHash.from_bytes(Buffer.from(drepKeyHashHex, 'hex'))
      );
      const voter = Cardano.Voter.new_drep_credential(drepCredential);
      const governanceActionId = Cardano.GovernanceActionId.new(
        Cardano.TransactionHash.from_bytes(Buffer.from(proposalTxHash, 'hex')),
        proposalIndex
      );
      const votingBuilder = Cardano.VotingBuilder.new();
      votingBuilder.add(
        voter,
        governanceActionId,
        Cardano.VotingProcedure.new(voteKindEnum)
      );
      txBuilder.set_voting_builder(votingBuilder);
    },
  });
};

export const withdrawalTx = async (
  account: WalletAccount,
  delegation: DelegationState,
  protocolParameters: ProtocolParametersSnapshot,
  utxos: any[]
) => {
  await Loader.load();

  if (
    rewardLovelaceString(delegation) !== '0' &&
    !canWithdrawRewards(delegation)
  ) {
    throw new Error(REWARD_WITHDRAWAL_NEEDS_DREP);
  }

  return assembleCertTx({
    Cardano: Loader.Cardano,
    protocolParameters,
    changeAddressBech32: account.paymentAddr,
    getUtxos: async () => utxos,
    requiredVkeyHashesHex: await certRequiredVkeyHashes(account),
    emptyUtxosMessage:
      'No inputs found on wallet. Withdrawal transaction needs to have at least one input.',
    label: 'Withdrawal transaction',
    configure: (txBuilder, Cardano) => {
      applyRewardWithdrawal(
        Cardano,
        txBuilder,
        account.rewardAddr
          ? {
              rewardAddressBech32: account.rewardAddr,
              amountLovelace: rewardLovelaceString(delegation),
            }
          : null
      );
    },
  });
};

export const undelegateTx = async (
  account: WalletAccount,
  delegation: DelegationState,
  protocolParameters: ProtocolParametersSnapshot
) => {
  await Loader.load();

  return assembleCertTx({
    Cardano: Loader.Cardano,
    protocolParameters,
    changeAddressBech32: account.paymentAddr,
    getUtxos: utxosOrEmpty,
    requiredVkeyHashesHex: await certRequiredVkeyHashes(account),
    emptyUtxosMessage: 'No UTxOs available to pay undelegation fee',
    label: 'Undelegation transaction',
    configure: (txBuilder, Cardano) => {
      if (
        rewardLovelace(delegation) > 0 &&
        account.rewardAddr &&
        canWithdrawRewards(delegation)
      ) {
        const withdrawalsBuilder = Cardano.WithdrawalsBuilder.new();
        withdrawalsBuilder.add(
          Cardano.RewardAddress.from_address(
            Cardano.Address.from_bech32(account.rewardAddr)
          ),
          Cardano.BigNum.from_str(String(delegation.rewards))
        );
        txBuilder.set_withdrawals_builder(withdrawalsBuilder);
      }

      const certsBuilder = Cardano.CertificatesBuilder.new();
      certsBuilder.add(
        Cardano.Certificate.new_stake_deregistration(
          Cardano.StakeDeregistration.new(
            Cardano.Credential.from_keyhash(
              Cardano.Ed25519KeyHash.from_bytes(
                Buffer.from(account.stakeKeyHash, 'hex')
              )
            )
          )
        )
      );
      txBuilder.set_certs_builder(certsBuilder);
    },
  });
};
