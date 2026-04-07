import { getUtxos, signTx, signTxHW, submitTx } from '.';
import { ERROR, TX } from '../../config/config';
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

export const initTx = async () => {
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

    const requiredVkeyHashesHex = [
      account.paymentKeyHash,
      account.stakeKeyHash,
    ].filter(Boolean);
    if (requiredVkeyHashesHex.length === 0) {
      throw new Error(
        'Account missing payment/stake key hashes for fee estimation'
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
  try {
    await Loader.load();

    const txBuilder = Loader.Cardano.TransactionBuilder.new(
      createCslTransactionBuilderConfig(Loader.Cardano, protocolParameters)
    );

    // Add stake registration if not active
    if (!delegation.active) {
      const stakeCredential = Loader.Cardano.Credential.from_keyhash(
        Loader.Cardano.Ed25519KeyHash.from_bytes(Buffer.from(account.stakeKeyHash, 'hex'))
      );
      txBuilder.add_certificate(
        Loader.Cardano.Address.from_bech32(account.paymentAddr),
        Loader.Cardano.Certificate.new_stake_registration(
          Loader.Cardano.StakeRegistration.new(stakeCredential)
        )
      );
    }

    // Add delegation certificate
    const stakeCredential = Loader.Cardano.Credential.from_keyhash(
      Loader.Cardano.Ed25519KeyHash.from_bytes(Buffer.from(account.stakeKeyHash, 'hex'))
    );
    const poolId = Loader.Cardano.PoolId.from_bytes(Buffer.from(poolKeyHash, 'hex'));
    
    txBuilder.add_certificate(
      Loader.Cardano.Address.from_bech32(account.paymentAddr),
      Loader.Cardano.Certificate.new_stake_delegation(
        Loader.Cardano.StakeDelegation.new(stakeCredential, poolId)
      )
    );

    const invalidHereafter = Loader.Cardano.BigNum.from_str(
      String(ttlSlotBound(protocolParameters))
    );
    txBuilder.set_ttl_bignum(invalidHereafter);

    // Set change address
    txBuilder.add_change_if_needed(Loader.Cardano.Address.from_bech32(account.paymentAddr));

    // Build the transaction
    const txBody = txBuilder.build();
    const tx = Loader.Cardano.Transaction.new(
      txBody,
      Loader.Cardano.TransactionWitnessSet.new()
    );

    return toCanonicalTransactionCip21(Loader.Cardano, tx);
  } catch (e) {
    console.error('Error building delegation transaction:', e);
    throw e;
  }
};

export const withdrawalTx = async (account, delegation, protocolParameters, utxos) => {
  try {
    await Loader.load();

    const txBuilder = Loader.Cardano.TransactionBuilder.new(
      createCslTransactionBuilderConfig(Loader.Cardano, protocolParameters)
    );

    // Add withdrawal if there are rewards
    if (delegation.rewards > 0) {
      const rewardAccount = Loader.Cardano.RewardAddress.from_address(
        Loader.Cardano.Address.from_bech32(account.rewardAddr)
      );
      txBuilder.add_withdrawal(
        rewardAccount,
        Loader.Cardano.BigNum.from_str(delegation.rewards.toString())
      );
    }

    const invalidHereafter = Loader.Cardano.BigNum.from_str(
      String(ttlSlotBound(protocolParameters))
    );
    txBuilder.set_ttl_bignum(invalidHereafter);

    // Add at least one input (required for valid transaction)
    if (!utxos || utxos.length === 0) {
      throw new Error('No inputs found on wallet. Withdrawal transaction needs to have at least one input.');
    }

    // Add the first UTXO as input
    const firstUtxo = utxos[0];
    const txInput = Loader.Cardano.TransactionInput.new(
      Loader.Cardano.TransactionHash.from_bytes(Buffer.from(firstUtxo.tx_hash, 'hex')),
      firstUtxo.tx_index
    );
    txBuilder.add_input(account.paymentAddr, txInput, firstUtxo.amount);

    // Set change address
    txBuilder.add_change_if_needed(Loader.Cardano.Address.from_bech32(account.paymentAddr));

    // Build the transaction
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

  let isTxBuilt = false;
  let selectionRetries = RETRIES;

  while (!isTxBuilt && selectionRetries > 0) {
    try {
      const txBuilderConfig = Loader.Cardano.TransactionBuilderConfigBuilder.new()
        .coins_per_utxo_byte(
          BigInt(protocolParameters.coinsPerUtxoWord)
        )
        .fee_algo(
          Loader.Cardano.LinearFee.new(
            BigInt(protocolParameters.linearFee.minFeeA),
            BigInt(protocolParameters.linearFee.minFeeB),
            BigInt(protocolParameters.minFeeRefScriptCostPerByte)
          )
        )
        .key_deposit(BigInt(protocolParameters.keyDeposit))
        .pool_deposit(
          BigInt(protocolParameters.poolDeposit)
        )
        .max_tx_size(protocolParameters.maxTxSize)
        .max_value_size(protocolParameters.maxValSize)
        .ex_unit_prices(Loader.Cardano.ExUnitPrices.new(Loader.Cardano.Rational.new(0n, 1n), Loader.Cardano.Rational.new(0n, 1n)))
        .collateral_percentage(protocolParameters.collateralPercentage)
        .max_collateral_inputs(protocolParameters.maxCollateralInputs)
        .build();

      const txBuilder = Loader.Cardano.TransactionBuilder.new(txBuilderConfig);

      if (delegation.rewards > 0) {
        txBuilder.add_withdrawal(
          Loader.Cardano.SingleWithdrawalBuilder.new(
            Loader.Cardano.RewardAddress.from_address(
              Loader.Cardano.Address.from_bech32(account.rewardAddr)
            ),
            BigInt(delegation.rewards)
          ).payment_key()
        );
      }

      txBuilder.add_cert(
        Loader.Cardano.SingleCertificateBuilder.new(
          Loader.Cardano.Certificate.new_stake_deregistration(
            Loader.Cardano.Credential.from_keyhash(
              Loader.Cardano.Ed25519KeyHash.from_bytes(
                Buffer.from(account.stakeKeyHash, 'hex')
              )
            )
          )
        ).payment_key()
      );

      txBuilder.set_ttl(BigInt(ttlSlotBound(protocolParameters)));

      const utxos = await getUtxos();

      const changeAddress = Loader.Cardano.Address.from_bech32(account.paymentAddr);

      // We need to add one output for input selection to work.
      txBuilder.add_output(
        Loader.Cardano.TransactionOutput.new(
          changeAddress,
          Loader.Cardano.Value.new(
            Loader.Cardano.BigNum.from_str(String(protocolParameters.minUtxo))
          )
        )
      );

      utxos.forEach((utxo) => {
        const input = Loader.Cardano.SingleInputBuilder
          .from_transaction_unspent_output(utxo)
          .payment_key();

        txBuilder.add_utxo(input);
      });

      txBuilder.select_utxos(Loader.Cardano.CoinSelectionStrategyCIP2.RandomImproveMultiAsset);
      txBuilder.add_change_if_needed(changeAddress, false);

      return toCanonicalTransactionCip21(
        Loader.Cardano,
        txBuilder
          .build(Loader.Cardano.ChangeSelectionAlgo.Default, changeAddress)
          .build_unchecked()
      );
    }
    catch (e) {
      console.error(e);

      if (selectionRetries > 0) {
        --selectionRetries;
        continue;
      }

      throw e;
    }
  }
};
