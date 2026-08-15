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
  assembleCertTx,
  buildUnsignedSendAllTx,
  buildUnsignedSimpleTx,
  summarizeSendAllTx,
} from '../tx/csl-unsigned-tx';
import {
  createStakeDelegationCertificate,
  createStakeRegistrationCertificate,
} from '../tx/staking-certificates';
import { koiosRequestEnhanced } from '../util';

function assertDelegationBuildInputs(account, protocolParameters, poolKeyHash) {
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
export const assembleSignedTransaction = async (unsignedTx, witnessSet) => {
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
export const initTx = async ({ force = false } = {}) => {
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
    const row = latestEpochParamsRow(p);
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
 * Build unsigned payment transaction (CSL via `src/api/tx/csl-unsigned-tx.js`).
 * Refreshes chain tip slot so TTL stays valid when UI skips `initTx()`.
 */
export const buildTx = async (
  account,
  utxos,
  outputs,
  protocolParameters,
  auxiliaryData = null
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

    const paymentHashes = await paymentKeyHashesForSigning(account);
    const requiredVkeyHashesHex =
      paymentHashes.length > 0
        ? paymentHashes
        : [account.paymentKeyHash].filter(Boolean);
    if (requiredVkeyHashesHex.length === 0) {
      throw new Error(
        'Account missing payment key hash for fee estimation'
      );
    }

    return buildUnsignedSimpleTx({
      Cardano: Loader.Cardano,
      protocolParameters: params,
      utxos,
      outputs,
      changeAddressBech32: account.paymentAddr,
      requiredVkeyHashesHex,
      auxiliaryData,
    });
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
  utxos,
  recipientAddress,
  protocolParameters,
  auxiliaryData = null
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

    return buildUnsignedSendAllTx({
      Cardano: Loader.Cardano,
      protocolParameters: params,
      utxos,
      recipientAddressBech32: recipientAddress,
      auxiliaryData,
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
export const summarizeSendAll = (finalTx) =>
  summarizeSendAllTx(Loader.Cardano, finalTx);

export const signAndSubmit = async (
  tx,
  { keyHashes, accountIndex },
  password
) => {
  await Loader.load();
  const witnessSet = await signTx(
    Buffer.from(tx.to_bytes(), 'hex').toString('hex'),
    keyHashes,
    password,
    accountIndex
  );
  const transaction = await assembleSignedTransaction(tx, witnessSet);

  const txHash = await submitTx(
    Buffer.from(transaction.to_bytes(), 'hex').toString('hex')
  );
  return txHash;
};

export const signAndSubmitHW = async (
  tx,
  { keyHashes, account, hw, partialSign }
) => {
  await Loader.load();

  const witnessSet = await signTxHW(
    Buffer.from(tx.to_bytes(), 'hex').toString('hex'),
    keyHashes,
    account,
    hw,
    partialSign
  );

  const transaction = await assembleSignedTransaction(tx, witnessSet);

  try {
    const txHash = await submitTx(
      Buffer.from(transaction.to_bytes(), 'hex').toString('hex')
    );
    return txHash;
  } catch (e) {
    throw wrapSubmitError(e);
  }
};

/** Preserve the provider message while keeping `code: ERROR.submit` for UI checks. */
export const wrapSubmitError = (error) => {
  const message =
    error && error !== ERROR.submit && error.message
      ? error.message
      : 'Transaction submission failed';
  const wrapped = new Error(message);
  wrapped.code = ERROR.submit;
  if (error && error !== ERROR.submit) {
    wrapped.cause = error;
  }
  return wrapped;
};

export const delegationTx = async (
  account,
  delegation,
  protocolParameters,
  poolKeyHash
) => {
  await Loader.load();
  assertDelegationBuildInputs(account, protocolParameters, poolKeyHash);

  return assembleCertTx({
    Cardano: Loader.Cardano,
    protocolParameters,
    changeAddressBech32: account.paymentAddr,
    getUtxos,
    emptyUtxosMessage: 'No UTxOs available to pay delegation deposit and fee',
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
  account,
  delegation,
  protocolParameters,
  drepIdType, // 'always_abstain', 'always_no_confidence', or 'key_hash'
  drepHashHex // optional, if drepIdType is 'key_hash'
) => {
  await Loader.load();

  return assembleCertTx({
    Cardano: Loader.Cardano,
    protocolParameters,
    changeAddressBech32: account.paymentAddr,
    getUtxos,
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
export const voteTx = async (account, protocolParameters, vote) => {
  await Loader.load();

  const { drepKeyHashHex, proposalTxHash, proposalIndex, voteKind } = vote || {};
  if (!drepKeyHashHex) throw new Error('Missing DRep key hash for vote');
  if (!proposalTxHash || proposalIndex === null || proposalIndex === undefined) {
    throw new Error('This proposal is missing a governance action id and cannot be voted on');
  }

  const voteKindEnum = {
    yes: Loader.Cardano.VoteKind.Yes,
    no: Loader.Cardano.VoteKind.No,
    abstain: Loader.Cardano.VoteKind.Abstain,
  }[voteKind];
  if (voteKindEnum === undefined) throw new Error(`Unknown vote kind: ${voteKind}`);

  return assembleCertTx({
    Cardano: Loader.Cardano,
    protocolParameters,
    changeAddressBech32: account.paymentAddr,
    getUtxos,
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

export const withdrawalTx = async (account, delegation, protocolParameters, utxos) => {
  await Loader.load();

  return assembleCertTx({
    Cardano: Loader.Cardano,
    protocolParameters,
    changeAddressBech32: account.paymentAddr,
    getUtxos: async () => utxos,
    emptyUtxosMessage:
      'No inputs found on wallet. Withdrawal transaction needs to have at least one input.',
    label: 'Withdrawal transaction',
    configure: (txBuilder, Cardano) => {
      if (delegation.rewards > 0) {
        const withdrawalsBuilder = Cardano.WithdrawalsBuilder.new();
        withdrawalsBuilder.add(
          Cardano.RewardAddress.from_address(
            Cardano.Address.from_bech32(account.rewardAddr)
          ),
          Cardano.BigNum.from_str(delegation.rewards.toString())
        );
        txBuilder.set_withdrawals_builder(withdrawalsBuilder);
      }
    },
  });
};

export const undelegateTx = async (account, delegation, protocolParameters) => {
  await Loader.load();

  return assembleCertTx({
    Cardano: Loader.Cardano,
    protocolParameters,
    changeAddressBech32: account.paymentAddr,
    getUtxos,
    emptyUtxosMessage: 'No UTxOs available to pay undelegation fee',
    label: 'Undelegation transaction',
    configure: (txBuilder, Cardano) => {
      if (delegation.rewards > 0) {
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
