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
  try {
    // Get latest block from Koios
    const latest_block = await koiosRequestEnhanced('/blocks/latest');
    console.log('Latest block response:', latest_block);
    
    // Get protocol parameters from Koios
    const p = await koiosRequestEnhanced('/epoch_params/latest');
    console.log('Protocol parameters response:', p);

    // Validate required fields
    if (!p.min_fee_a || !p.min_fee_b) {
      throw new Error('Missing required protocol parameters: min_fee_a or min_fee_b');
    }

    if (!p.pool_deposit || !p.key_deposit || !p.coins_per_utxo_size) {
      throw new Error('Missing required protocol parameters: pool_deposit, key_deposit, or coins_per_utxo_size');
    }

    if (!p.max_val_size || !p.max_tx_size) {
      throw new Error('Missing required protocol parameters: max_val_size or max_tx_size');
    }

    if (!latest_block.slot) {
      throw new Error('Missing required block information: slot');
    }

    const protocolParams = {
    linearFee: {
      minFeeA: p.min_fee_a.toString(),
      minFeeB: p.min_fee_b.toString(),
    },
      minUtxo: '1000000', // minUTxOValue protocol parameter has been removed since Alonzo HF
      poolDeposit: p.pool_deposit.toString(),
      keyDeposit: p.key_deposit.toString(),
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

    console.log('Processed protocol parameters:', protocolParams);
    return protocolParams;
  } catch (error) {
    console.error('Error in initTx:', error);
    throw error;
  }
};

/**
 * Makes sure the transaction is CIP-0021 compliant.
 *
 * @param tx The transaction to transform to canonical form (if needed).
 *
 * @return {Transaction} the new canonical transaction
 */
const toCanonicalTx = (tx) => {
  const canonicalCbor = encodeTx(transformTx(decodeTx(tx.to_bytes())));
  return Loader.Cardano.Transaction.from_bytes(canonicalCbor);
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

    // Validate protocol parameters
    if (!protocolParameters) {
      throw new Error('Protocol parameters are required but not provided');
    }

    if (!protocolParameters.linearFee || !protocolParameters.linearFee.minFeeA || !protocolParameters.linearFee.minFeeB) {
      throw new Error('Invalid protocol parameters: linearFee configuration is missing');
    }

    if (!protocolParameters.poolDeposit || !protocolParameters.keyDeposit || !protocolParameters.coinsPerUtxoWord) {
      throw new Error('Invalid protocol parameters: poolDeposit, keyDeposit, or coinsPerUtxoWord is missing');
    }

    if (!protocolParameters.maxValSize || !protocolParameters.maxTxSize) {
      throw new Error('Invalid protocol parameters: maxValSize or maxTxSize is missing');
    }

    if (!protocolParameters.slot) {
      throw new Error('Invalid protocol parameters: slot is missing');
    }

    // Debug logging for protocol parameters
    console.log('Protocol parameters received in buildTx:', protocolParameters);
    console.log('linearFee object:', protocolParameters.linearFee);
    console.log('linearFee type:', typeof protocolParameters.linearFee);
    console.log('minFeeA value:', protocolParameters.linearFee?.minFeeA);
    console.log('minFeeA type:', typeof protocolParameters.linearFee?.minFeeA);
    console.log('minFeeB value:', protocolParameters.linearFee?.minFeeB);
    console.log('minFeeB type:', typeof protocolParameters.linearFee?.minFeeB);
    console.log('poolDeposit value:', protocolParameters.poolDeposit);
    console.log('poolDeposit type:', typeof protocolParameters.poolDeposit);
    console.log('keyDeposit value:', protocolParameters.keyDeposit);
    console.log('coinsPerUtxoWord value:', protocolParameters.coinsPerUtxoWord);
    
    // Debug Cardano library loading
    console.log('Loader.Cardano:', Loader.Cardano);
    console.log('Loader.Cardano keys:', Object.keys(Loader.Cardano));
    console.log('Loader.Cardano.BigNum:', Loader.Cardano?.BigNum);
    console.log('Loader.Cardano.LinearFee:', Loader.Cardano?.LinearFee);
    console.log('Loader.Cardano.TransactionBuilder:', Loader.Cardano?.TransactionBuilder);
    
    // Search for BigNum in the keys
    const bigNumKeys = Object.keys(Loader.Cardano).filter(key => key.toLowerCase().includes('bignum'));
    console.log('Keys containing "bignum":', bigNumKeys);
    
    // Also check for common variations
    console.log('Loader.Cardano.BigInt:', Loader.Cardano?.BigInt);
    console.log('Loader.Cardano.Int:', Loader.Cardano?.Int);
    
    // Search for any class that might handle numbers
    const numberKeys = Object.keys(Loader.Cardano).filter(key => 
      key.toLowerCase().includes('num') || 
      key.toLowerCase().includes('int') || 
      key.toLowerCase().includes('coin') ||
      key.toLowerCase().includes('value')
    );
    console.log('Keys containing number-related terms:', numberKeys);
    
    // Check if Int has from_str method
    console.log('Loader.Cardano.Int.from_str:', Loader.Cardano?.Int?.from_str);
    
    // Debug the specific values being converted
    console.log('Converting minFeeA:', protocolParameters.linearFee.minFeeA, 'type:', typeof protocolParameters.linearFee.minFeeA);
    console.log('Converting minFeeB:', protocolParameters.linearFee.minFeeB, 'type:', typeof protocolParameters.linearFee.minFeeB);
    console.log('Converting poolDeposit:', protocolParameters.poolDeposit, 'type:', typeof protocolParameters.poolDeposit);
    console.log('Converting keyDeposit:', protocolParameters.keyDeposit, 'type:', typeof protocolParameters.keyDeposit);
    console.log('Converting coinsPerUtxoWord:', protocolParameters.coinsPerUtxoWord, 'type:', typeof protocolParameters.coinsPerUtxoWord);
    
    // Test Int.from_str to see what it returns
    const testInt = Loader.Cardano.Int.from_str('44');
    console.log('Test Int.from_str result:', testInt, 'type:', typeof testInt);
    console.log('Test Int.from_str constructor:', testInt.constructor.name);
    
    // Check if the Int object has methods to get its value
    console.log('Test Int methods:', Object.getOwnPropertyNames(testInt));
    console.log('Test Int prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(testInt)));
    
    // Try to get the value from the Int object
    if (testInt.to_str) {
      console.log('Test Int.to_str():', testInt.to_str());
    }
    if (testInt.toString) {
      console.log('Test Int.toString():', testInt.toString());
    }
    
    // Check LinearFee constructor
    console.log('LinearFee constructor:', Loader.Cardano.LinearFee);
    console.log('LinearFee static methods:', Object.getOwnPropertyNames(Loader.Cardano.LinearFee));
    console.log('LinearFee prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(Loader.Cardano.LinearFee)));
    
    // Check TransactionBuilder methods
    console.log('TransactionBuilder constructor:', Loader.Cardano.TransactionBuilder);
    console.log('TransactionBuilder static methods:', Object.getOwnPropertyNames(Loader.Cardano.TransactionBuilder));
    
    // Check if BigInteger is available
    console.log('BigInteger available:', Loader.Cardano.BigInteger);
    console.log('BigInteger.from_str available:', Loader.Cardano.BigInteger?.from_str);
    
    // Test BigInteger.from_str if available
    if (Loader.Cardano.BigInteger?.from_str) {
      const testBigInt = Loader.Cardano.BigInteger.from_str('44');
      console.log('Test BigInteger.from_str result:', testBigInt, 'type:', typeof testBigInt);
      console.log('Test BigInteger constructor:', testBigInt.constructor.name);
    }

    // Show the number-related keys to see what other options we have
    console.log('Number-related keys:', Object.keys(Loader.Cardano).filter(key => 
      key.toLowerCase().includes('num') || 
      key.toLowerCase().includes('int') || 
      key.toLowerCase().includes('coin') ||
      key.toLowerCase().includes('value')
    ));

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
    console.log('UTXOs type:', typeof utxos, 'length:', utxos.length);
    console.log('First UTXO:', utxos[0]);
    console.log('First UTXO type:', typeof utxos[0]);
    
    // Debug: Show total balance from UTXOs
    let totalLovelace = BigInt(0);
    for (let i = 0; i < utxos.length; i++) {
      const utxo = utxos[i];
      const output = utxo.output();
      const amount = output.amount();
      const coin = amount.coin();
      totalLovelace += BigInt(coin.to_str());
      console.log(`UTXO ${i}: ${coin.to_str()} lovelace`);
    }
    console.log('Total available lovelace:', totalLovelace.toString());
    
    // Create a TransactionUnspentOutputs collection
    const utxoCollection = Loader.Cardano.TransactionUnspentOutputs.new();
    for (const utxo of utxos) {
      utxoCollection.add(utxo);
    }
    console.log('UTXO collection created:', utxoCollection);
    
    // Try using add_inputs_from with the collection
    txBuilder.add_inputs_from(utxoCollection);
    
    // Debug: check outputs
    console.log('Outputs type:', typeof outputs);
    console.log('Outputs:', outputs);
    console.log('Outputs length:', outputs?.length);
    console.log('Is outputs iterable:', outputs && typeof outputs[Symbol.iterator] === 'function');
    
    // Add outputs using Emurgo library methods
    for (let i = 0; i < outputs.len(); i++) {
      const output = outputs.get(i);
      console.log('Processing output:', output);
      txBuilder.add_output(output);
    }

    // Set change address
    txBuilder.add_change_if_needed(Loader.Cardano.Address.from_bech32(account.paymentAddr));

    // Set validity interval
    const slot = Loader.Cardano.BigNum.from_str(protocolParameters.slot.toString());
    const invalidHereafter = Loader.Cardano.BigNum.from_str(
      (parseInt(protocolParameters.slot) + TX.invalid_hereafter).toString()
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
    Buffer.from(tx.to_bytes(), 'hex').toString('hex'),
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

  const transaction = Loader.Cardano.Transaction.new(
    tx.body(),
    witnessSet,
    true,
    tx.auxiliary_data()
  );

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
              Loader.Cardano.Ed25519KeyHash.from_bytes(
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
        Loader.Cardano.TransactionOutput.new(
          changeAddress,
          Loader.Cardano.Value.new(BigInt(protocolParameters.minUtxo), Loader.Cardano.MultiAsset.new())
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
