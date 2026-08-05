import { getNetwork, getUtxos, paymentKeyHashesForSigning, signTx, signTxHW, submitTx } from '.';
import { ERROR, TX } from '../../config/config';
import { cacheKey, withCache } from '../cache';
import Loader from '../loader';
import {
  buildProtocolParametersSnapshot,
  fetchKoiosTipSlot,
  latestEpochParamsRow,
} from '../tx/protocol-params';
import {
  buildUnsignedSimpleTx,
  createCslTransactionBuilderConfig,
  toCanonicalTransactionCip21,
} from '../tx/csl-unsigned-tx';
import {
  createStakeDelegationCertificate,
  createStakeRegistrationCertificate,
} from '../tx/staking-certificates';
import { koiosRequestEnhanced } from '../util';

const RETRIES = 5;

/**
 * Absolute slot for tx invalidHereafter (TTL). Uses numeric slot only — never `slot + n`
 * when slot may be a string (JS would concatenate).
 */
function ttlSlotBound(protocolParameters) {
  const base = Math.floor(Number(protocolParameters.slot));
  if (!Number.isFinite(base) || base < 0) {
    throw new Error('Invalid chain slot in protocol parameters');
  }
  return base + TX.invalid_hereafter;
}

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

function retryOrThrow(error, retriesRemaining, label) {
  const nextRetries = retriesRemaining - 1;
  if (nextRetries <= 0) {
    throw new Error(
      `${label} failed after ${RETRIES} attempts: ${error?.message || String(error)}`
    );
  }
  return nextRetries;
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
    throw ERROR.submit;
  }
};

export const delegationTx = async (
  account,
  delegation,
  protocolParameters,
  poolKeyHash
) => {
  await Loader.load();
  assertDelegationBuildInputs(account, protocolParameters, poolKeyHash);

  let selectionRetries = RETRIES;

  while (selectionRetries > 0) {
    try {
      const txBuilderConfig = createCslTransactionBuilderConfig(
        Loader.Cardano,
        protocolParameters
      );
      const txBuilder = Loader.Cardano.TransactionBuilder.new(txBuilderConfig);

      const certsBuilder = Loader.Cardano.CertificatesBuilder.new();
      if (!delegation.registered) {
        certsBuilder.add(
          createStakeRegistrationCertificate(Loader.Cardano, account.stakeKeyHash)
        );
      }
      certsBuilder.add(
        createStakeDelegationCertificate(Loader.Cardano, account.stakeKeyHash, poolKeyHash)
      );
      txBuilder.set_certs_builder(certsBuilder);

      txBuilder.set_ttl_bignum(
        Loader.Cardano.BigNum.from_str(String(ttlSlotBound(protocolParameters)))
      );

      const utxos = await getUtxos();
      if (!utxos || utxos.length === 0) {
        throw new Error('No UTxOs available to pay delegation deposit and fee');
      }
      const changeAddress = Loader.Cardano.Address.from_bech32(account.paymentAddr);

      const utxoCollection = Loader.Cardano.TransactionUnspentOutputs.new();
      utxos.forEach((utxo) => utxoCollection.add(utxo));
      txBuilder.add_inputs_from(
        utxoCollection,
        Loader.Cardano.CoinSelectionStrategyCIP2.RandomImproveMultiAsset
      );
      txBuilder.add_change_if_needed(changeAddress);

      const txBody = txBuilder.build();
      const tx = Loader.Cardano.Transaction.new(
        txBody,
        Loader.Cardano.TransactionWitnessSet.new()
      );
      return toCanonicalTransactionCip21(Loader.Cardano, tx);
    } catch (e) {
      console.error('Error building delegation transaction:', e);
      selectionRetries = retryOrThrow(
        e,
        selectionRetries,
        'Delegation transaction'
      );
    }
  }
};

export const voteDelegationTx = async (
  account,
  delegation,
  protocolParameters,
  drepIdType, // 'always_abstain', 'always_no_confidence', or 'key_hash'
  drepHashHex // optional, if drepIdType is 'key_hash'
) => {
  await Loader.load();

  let selectionRetries = RETRIES;

  while (selectionRetries > 0) {
    try {
      const txBuilderConfig = createCslTransactionBuilderConfig(
        Loader.Cardano,
        protocolParameters
      );
      const txBuilder = Loader.Cardano.TransactionBuilder.new(txBuilderConfig);

      const certsBuilder = Loader.Cardano.CertificatesBuilder.new();
      if (!delegation.registered) {
        certsBuilder.add(
          createStakeRegistrationCertificate(Loader.Cardano, account.stakeKeyHash)
        );
      }

      const stakeCredential = Loader.Cardano.Credential.from_keyhash(
        Loader.Cardano.Ed25519KeyHash.from_bytes(Buffer.from(account.stakeKeyHash, 'hex'))
      );

      let drep;
      if (drepIdType === 'always_abstain') {
        drep = Loader.Cardano.DRep.new_always_abstain();
      } else if (drepIdType === 'always_no_confidence') {
        drep = Loader.Cardano.DRep.new_always_no_confidence();
      } else {
        drep = Loader.Cardano.DRep.new_key_hash(
          Loader.Cardano.Ed25519KeyHash.from_bytes(Buffer.from(drepHashHex, 'hex'))
        );
      }

      certsBuilder.add(
        Loader.Cardano.Certificate.new_vote_delegation(
          Loader.Cardano.VoteDelegation.new(stakeCredential, drep)
        )
      );
      txBuilder.set_certs_builder(certsBuilder);

      txBuilder.set_ttl_bignum(
        Loader.Cardano.BigNum.from_str(String(ttlSlotBound(protocolParameters)))
      );

      const utxos = await getUtxos();
      if (!utxos || utxos.length === 0) {
        throw new Error('No UTxOs available to pay vote delegation fee');
      }
      const changeAddress = Loader.Cardano.Address.from_bech32(account.paymentAddr);

      const utxoCollection = Loader.Cardano.TransactionUnspentOutputs.new();
      utxos.forEach((utxo) => utxoCollection.add(utxo));
      txBuilder.add_inputs_from(
        utxoCollection,
        Loader.Cardano.CoinSelectionStrategyCIP2.RandomImproveMultiAsset
      );
      txBuilder.add_change_if_needed(changeAddress);

      const txBody = txBuilder.build();
      const tx = Loader.Cardano.Transaction.new(
        txBody,
        Loader.Cardano.TransactionWitnessSet.new()
      );
      return toCanonicalTransactionCip21(Loader.Cardano, tx);
    } catch (e) {
      console.error('Error building vote delegation transaction:', e);
      selectionRetries = retryOrThrow(
        e,
        selectionRetries,
        'Vote delegation transaction'
      );
    }
  }
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

  let selectionRetries = RETRIES;

  while (selectionRetries > 0) {
    try {
      const txBuilder = Loader.Cardano.TransactionBuilder.new(
        createCslTransactionBuilderConfig(Loader.Cardano, protocolParameters)
      );

      const drepCredential = Loader.Cardano.Credential.from_keyhash(
        Loader.Cardano.Ed25519KeyHash.from_bytes(Buffer.from(drepKeyHashHex, 'hex'))
      );
      const voter = Loader.Cardano.Voter.new_drep_credential(drepCredential);

      const governanceActionId = Loader.Cardano.GovernanceActionId.new(
        Loader.Cardano.TransactionHash.from_bytes(
          Buffer.from(proposalTxHash, 'hex')
        ),
        proposalIndex
      );

      const votingBuilder = Loader.Cardano.VotingBuilder.new();
      votingBuilder.add(
        voter,
        governanceActionId,
        Loader.Cardano.VotingProcedure.new(voteKindEnum)
      );
      txBuilder.set_voting_builder(votingBuilder);

      txBuilder.set_ttl_bignum(
        Loader.Cardano.BigNum.from_str(String(ttlSlotBound(protocolParameters)))
      );

      const utxos = await getUtxos();
      if (!utxos || utxos.length === 0) {
        throw new Error('No UTxOs available to pay voting fee');
      }
      const changeAddress = Loader.Cardano.Address.from_bech32(account.paymentAddr);

      const utxoCollection = Loader.Cardano.TransactionUnspentOutputs.new();
      utxos.forEach((utxo) => utxoCollection.add(utxo));
      txBuilder.add_inputs_from(
        utxoCollection,
        Loader.Cardano.CoinSelectionStrategyCIP2.RandomImproveMultiAsset
      );
      txBuilder.add_change_if_needed(changeAddress);

      const txBody = txBuilder.build();
      const tx = Loader.Cardano.Transaction.new(
        txBody,
        Loader.Cardano.TransactionWitnessSet.new()
      );
      return toCanonicalTransactionCip21(Loader.Cardano, tx);
    } catch (e) {
      console.error('Error building vote transaction:', e);
      selectionRetries = retryOrThrow(e, selectionRetries, 'Vote transaction');
    }
  }
};

export const withdrawalTx = async (account, delegation, protocolParameters, utxos) => {
  try {
    await Loader.load();

    const txBuilder = Loader.Cardano.TransactionBuilder.new(
      createCslTransactionBuilderConfig(Loader.Cardano, protocolParameters)
    );

    if (delegation.rewards > 0) {
      const withdrawalsBuilder = Loader.Cardano.WithdrawalsBuilder.new();
      withdrawalsBuilder.add(
        Loader.Cardano.RewardAddress.from_address(
          Loader.Cardano.Address.from_bech32(account.rewardAddr)
        ),
        Loader.Cardano.BigNum.from_str(delegation.rewards.toString())
      );
      txBuilder.set_withdrawals_builder(withdrawalsBuilder);
    }

    txBuilder.set_ttl_bignum(
      Loader.Cardano.BigNum.from_str(String(ttlSlotBound(protocolParameters)))
    );

    if (!utxos || utxos.length === 0) {
      throw new Error('No inputs found on wallet. Withdrawal transaction needs to have at least one input.');
    }

    const changeAddress = Loader.Cardano.Address.from_bech32(account.paymentAddr);
    const utxoCollection = Loader.Cardano.TransactionUnspentOutputs.new();
    utxos.forEach((utxo) => utxoCollection.add(utxo));
    txBuilder.add_inputs_from(
      utxoCollection,
      Loader.Cardano.CoinSelectionStrategyCIP2.RandomImproveMultiAsset
    );
    txBuilder.add_change_if_needed(changeAddress);

    const txBody = txBuilder.build();
    const tx = Loader.Cardano.Transaction.new(
      txBody,
      Loader.Cardano.TransactionWitnessSet.new()
    );

    return toCanonicalTransactionCip21(Loader.Cardano, tx);
  } catch (e) {
    console.error('Error building withdrawal transaction:', e);
    throw e;
  }
};

export const undelegateTx = async (account, delegation, protocolParameters) => {
  await Loader.load();

  let selectionRetries = RETRIES;

  while (selectionRetries > 0) {
    try {
      const txBuilderConfig = createCslTransactionBuilderConfig(
        Loader.Cardano,
        protocolParameters
      );
      const txBuilder = Loader.Cardano.TransactionBuilder.new(txBuilderConfig);

      if (delegation.rewards > 0) {
        const withdrawalsBuilder = Loader.Cardano.WithdrawalsBuilder.new();
        withdrawalsBuilder.add(
          Loader.Cardano.RewardAddress.from_address(
            Loader.Cardano.Address.from_bech32(account.rewardAddr)
          ),
          Loader.Cardano.BigNum.from_str(String(delegation.rewards))
        );
        txBuilder.set_withdrawals_builder(withdrawalsBuilder);
      }

      const certsBuilder = Loader.Cardano.CertificatesBuilder.new();
      certsBuilder.add(
        Loader.Cardano.Certificate.new_stake_deregistration(
          Loader.Cardano.StakeDeregistration.new(
            Loader.Cardano.Credential.from_keyhash(
              Loader.Cardano.Ed25519KeyHash.from_bytes(
                Buffer.from(account.stakeKeyHash, 'hex')
              )
            )
          )
        )
      );
      txBuilder.set_certs_builder(certsBuilder);

      txBuilder.set_ttl_bignum(
        Loader.Cardano.BigNum.from_str(String(ttlSlotBound(protocolParameters)))
      );

      const utxos = await getUtxos();
      if (!utxos || utxos.length === 0) {
        throw new Error('No UTxOs available to pay undelegation fee');
      }

      const changeAddress = Loader.Cardano.Address.from_bech32(account.paymentAddr);

      const utxoCollection = Loader.Cardano.TransactionUnspentOutputs.new();
      utxos.forEach((utxo) => utxoCollection.add(utxo));
      txBuilder.add_inputs_from(
        utxoCollection,
        Loader.Cardano.CoinSelectionStrategyCIP2.RandomImproveMultiAsset
      );
      txBuilder.add_change_if_needed(changeAddress);

      const txBody = txBuilder.build();
      const tx = Loader.Cardano.Transaction.new(
        txBody,
        Loader.Cardano.TransactionWitnessSet.new()
      );
      return toCanonicalTransactionCip21(Loader.Cardano, tx);
    }
    catch (e) {
      console.error(e);
      selectionRetries = retryOrThrow(
        e,
        selectionRetries,
        'Undelegation transaction'
      );
    }
  }
};
