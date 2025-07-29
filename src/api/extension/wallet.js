import { getUtxos, signTx, signTxHW, submitTx } from '.';
import { ERROR, TX } from '../../config/config';
import Loader from '../loader';
import { koiosRequestEnhanced } from '../util';
import { decodeTx, encodeTx, transformTx } from 'cardano-hw-interop-lib';
import {
  TransactionOutput,
  AuxiliaryData,
  Address,
  Credential,
  PoolId,
  RewardAccount,
  TransactionUnspentOutput,
} from '@blaze-cardano/core';

const RETRIES = 5;

export const initTx = async () => {
  // Get latest block from Koios
  const latest_block = await koiosRequestEnhanced('/blocks/latest');
  
  // Get protocol parameters from Koios
  const p = await koiosRequestEnhanced('/epoch_params/latest');

  return {
    linearFee: {
      minFeeA: p.min_fee_a.toString(),
      minFeeB: p.min_fee_b.toString(),
    },
    minUtxo: '1000000', // minUTxOValue protocol parameter has been removed since Alonzo HF
    poolDeposit: p.pool_deposit,
    keyDeposit: p.key_deposit,
    coinsPerUtxoWord: p.coins_per_utxo_size.toString(),
    maxValSize: p.max_val_size,
    priceMem: p.price_mem,
    priceStep: p.price_step,
    // might not be available for pre-conway networks; set to 0 in that case
    minFeeRefScriptCostPerByte: p.min_fee_ref_script_cost_per_byte || 0,
    maxTxSize: parseInt(p.max_tx_size),
    slot: parseInt(latest_block.slot), // Now using converted slot
    collateralPercentage: parseInt(p.collateral_percent),
    maxCollateralInputs: parseInt(p.max_collateral_inputs),
  };
};

/**
 * Makes sure the transaction is CIP-0021 compliant.
 *
 * @param tx The transaction to transform to canonical form (if needed).
 *
 * @return {Transaction} the new canonical transaction
 */
const toCanonicalTx = (tx) => {
  const canonicalCbor = encodeTx(transformTx(decodeTx(tx.to_cbor_bytes())));
  return Loader.Cardano.Transaction.from_cbor_bytes(canonicalCbor);
}

/**
 * Build transaction using direct Cardano serialization library and Koios
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

    // Create transaction using Cardano serialization library
    const txBuilder = Loader.Cardano.TransactionBuilder.new(
      Loader.Cardano.TransactionBuilderConfigBuilder.new()
        .fee_algo(
          Loader.Cardano.LinearFee.new(
            Loader.Cardano.BigNum.from_str(protocolParameters.linearFee.minFeeA),
            Loader.Cardano.BigNum.from_str(protocolParameters.linearFee.minFeeB)
          )
        )
        .pool_deposit(Loader.Cardano.BigNum.from_str(protocolParameters.poolDeposit))
        .key_deposit(Loader.Cardano.BigNum.from_str(protocolParameters.keyDeposit))
        .coins_per_utxo_byte(Loader.Cardano.BigNum.from_str(protocolParameters.coinsPerUtxoWord))
        .max_value_size(parseInt(protocolParameters.maxValSize))
        .max_tx_size(parseInt(protocolParameters.maxTxSize))
        .prefer_pure_change(true)
        .build()
    );

    // Add inputs from UTXOs
    for (const utxo of utxos) {
      const txInput = Loader.Cardano.TransactionInput.new(
        Loader.Cardano.TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, 'hex')),
        utxo.tx_index
      );
      txBuilder.add_input(account.paymentAddr, txInput, utxo.amount);
    }

    // Add outputs
    for (const output of outputs) {
      const txOutput = Loader.Cardano.TransactionOutput.new(
        Loader.Cardano.Address.from_bech32(output.address),
        output.amount
      );
      txBuilder.add_output(txOutput);
    }

    // Set change address
    txBuilder.add_change_if_needed(Loader.Cardano.Address.from_bech32(account.paymentAddr));

    // Set validity interval
    const slot = Loader.Cardano.BigNum.from_str(protocolParameters.slot.toString());
    const invalidHereafter = Loader.Cardano.BigNum.from_str(
      (protocolParameters.slot + TX.invalid_hereafter).toString()
    );
    txBuilder.set_validity_start_interval(slot);
    txBuilder.set_ttl(invalidHereafter);

    // Add auxiliary data if provided
    if (auxiliaryData) {
      txBuilder.set_auxiliary_data(auxiliaryData);
    }

    // Build the transaction
    const txBody = txBuilder.build();
    const tx = Loader.Cardano.Transaction.new(
      txBody,
      Loader.Cardano.TransactionWitnessSet.new(),
      auxiliaryData
    );

    return toCanonicalTx(tx);
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
    Buffer.from(tx.to_cbor_bytes(), 'hex').toString('hex'),
    keyHashes,
    password,
    accountIndex
  );
  const transaction = Loader.Cardano.Transaction.new(
    tx.body(),
    witnessSet,
    true,
    tx.auxiliary_data()
  );

  const txHash = await submitTx(
    Buffer.from(transaction.to_cbor_bytes(), 'hex').toString('hex')
  );
  return txHash;
};

export const signAndSubmitHW = async (
  tx,
  { keyHashes, account, hw, partialSign }
) => {
  await Loader.load();

  const witnessSet = await signTxHW(
    Buffer.from(tx.to_cbor_bytes(), 'hex').toString('hex'),
    keyHashes,
    account,
    hw,
    partialSign
  );

  const transaction = Loader.Cardano.Transaction.new(
    tx.body(),
    witnessSet,
    true,
    tx.auxiliary_data()
  );

  try {
    const txHash = await submitTx(
      Buffer.from(transaction.to_cbor_bytes(), 'hex').toString('hex')
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

    // Create transaction builder
    const txBuilder = Loader.Cardano.TransactionBuilder.new(
      Loader.Cardano.TransactionBuilderConfigBuilder.new()
        .fee_algo(
          Loader.Cardano.LinearFee.new(
            Loader.Cardano.BigNum.from_str(protocolParameters.linearFee.minFeeA),
            Loader.Cardano.BigNum.from_str(protocolParameters.linearFee.minFeeB)
          )
        )
        .pool_deposit(Loader.Cardano.BigNum.from_str(protocolParameters.poolDeposit))
        .key_deposit(Loader.Cardano.BigNum.from_str(protocolParameters.keyDeposit))
        .coins_per_utxo_byte(Loader.Cardano.BigNum.from_str(protocolParameters.coinsPerUtxoWord))
        .max_value_size(parseInt(protocolParameters.maxValSize))
        .max_tx_size(parseInt(protocolParameters.maxTxSize))
        .prefer_pure_change(true)
        .build()
    );

    // Add stake registration if not active
    if (!delegation.active) {
      const stakeCredential = Loader.Cardano.Credential.new_pub_key(
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
    const stakeCredential = Loader.Cardano.Credential.new_pub_key(
      Loader.Cardano.Ed25519KeyHash.from_bytes(Buffer.from(account.stakeKeyHash, 'hex'))
    );
    const poolId = Loader.Cardano.PoolId.from_bytes(Buffer.from(poolKeyHash, 'hex'));
    
    txBuilder.add_certificate(
      Loader.Cardano.Address.from_bech32(account.paymentAddr),
      Loader.Cardano.Certificate.new_stake_delegation(
        Loader.Cardano.StakeDelegation.new(stakeCredential, poolId)
      )
    );

    // Set validity interval
    const slot = Loader.Cardano.BigNum.from_str(protocolParameters.slot.toString());
    const invalidHereafter = Loader.Cardano.BigNum.from_str(
      (protocolParameters.slot + TX.invalid_hereafter).toString()
    );
    txBuilder.set_validity_start_interval(slot);
    txBuilder.set_ttl(invalidHereafter);

    // Set change address
    txBuilder.add_change_if_needed(Loader.Cardano.Address.from_bech32(account.paymentAddr));

    // Build the transaction
    const txBody = txBuilder.build();
    const tx = Loader.Cardano.Transaction.new(
      txBody,
      Loader.Cardano.TransactionWitnessSet.new()
    );

    return toCanonicalTx(tx);
  } catch (e) {
    console.error('Error building delegation transaction:', e);
    throw e;
  }
};

export const withdrawalTx = async (account, delegation, protocolParameters, utxos) => {
  try {
    await Loader.load();

    // Create transaction builder
    const txBuilder = Loader.Cardano.TransactionBuilder.new(
      Loader.Cardano.TransactionBuilderConfigBuilder.new()
        .fee_algo(
          Loader.Cardano.LinearFee.new(
            Loader.Cardano.BigNum.from_str(protocolParameters.linearFee.minFeeA),
            Loader.Cardano.BigNum.from_str(protocolParameters.linearFee.minFeeB)
          )
        )
        .pool_deposit(Loader.Cardano.BigNum.from_str(protocolParameters.poolDeposit))
        .key_deposit(Loader.Cardano.BigNum.from_str(protocolParameters.keyDeposit))
        .coins_per_utxo_byte(Loader.Cardano.BigNum.from_str(protocolParameters.coinsPerUtxoWord))
        .max_value_size(parseInt(protocolParameters.maxValSize))
        .max_tx_size(parseInt(protocolParameters.maxTxSize))
        .prefer_pure_change(true)
        .build()
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

    // Set validity interval
    const slot = Loader.Cardano.BigNum.from_str(protocolParameters.slot.toString());
    const invalidHereafter = Loader.Cardano.BigNum.from_str(
      (protocolParameters.slot + TX.invalid_hereafter).toString()
    );
    txBuilder.set_validity_start_interval(slot);
    txBuilder.set_ttl(invalidHereafter);

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

    return toCanonicalTx(tx);
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
            Loader.Cardano.Credential.new_pub_key(
              Loader.Cardano.Ed25519KeyHash.from_raw_bytes(
                Buffer.from(account.stakeKeyHash, 'hex')
              )
            )
          )
        ).payment_key()
      );

      txBuilder.set_ttl(
        BigInt(
          (protocolParameters.slot + TX.invalid_hereafter).toString()
        )
      );

      const utxos = await getUtxos();

      const changeAddress = Loader.Cardano.Address.from_bech32(account.paymentAddr);

      // We need to add one output for input selection to work.
      txBuilder.add_output(
        Loader.Cardano.TransactionOutputBuilder.new()
          .with_address(changeAddress)
          .next()
          .with_value(Loader.Cardano.Value.new(BigInt(protocolParameters.minUtxo), Loader.Cardano.MultiAsset.new()))
          .build()
      );

      utxos.forEach((utxo) => {
        const input = Loader.Cardano.SingleInputBuilder
          .from_transaction_unspent_output(utxo)
          .payment_key();

        txBuilder.add_utxo(input);
      });

      txBuilder.select_utxos(Loader.Cardano.CoinSelectionStrategyCIP2.RandomImproveMultiAsset);
      txBuilder.add_change_if_needed(changeAddress, false);

      return toCanonicalTx(
        txBuilder.build(Loader.Cardano.ChangeSelectionAlgo.Default, changeAddress).build_unchecked()
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
