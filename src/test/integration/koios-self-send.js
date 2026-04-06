/**
 * Minimal Koios + CSL path to build, sign, and submit a small ADA self-transfer
 * on preview / preprod (for integration tests). No extension storage.
 */

const Cardano = require('@emurgo/cardano-serialization-lib-nodejs');
const { mnemonicToEntropy, validateMnemonic } = require('bip39');

const HARDEN = 0x80000000;
const harden = (n) => HARDEN + n;

const TX = { invalid_hereafter: 3600 * 6 };

function authHeaders(apiKey) {
  const h = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (apiKey && apiKey !== 'your-koios-api-key-here' && apiKey !== 'DUMMY_PREVIEW') {
    h.Authorization = `Bearer ${apiKey}`;
  }
  return h;
}

async function koiosGet(base, path, apiKey) {
  const r = await fetch(`${base}${path}`, { headers: authHeaders(apiKey) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Koios GET ${path} ${r.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function koiosPost(base, path, body, apiKey) {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Koios POST ${path} non-JSON ${r.status}: ${text.slice(0, 500)}`);
  }
  if (!r.ok) {
    throw new Error(`Koios POST ${path} ${r.status}: ${text.slice(0, 800)}`);
  }
  return json;
}

/** Koios v1: POST /submittx with application/cbor body (not /tx/submit JSON). */
async function koiosSubmitTx(base, txHex, apiKey) {
  const h = { ...authHeaders(apiKey), 'Content-Type': 'application/cbor' };
  const r = await fetch(`${base}/submittx`, {
    method: 'POST',
    headers: h,
    body: Buffer.from(txHex, 'hex'),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`Koios POST /submittx ${r.status}: ${text.slice(0, 800)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Match `convertKoiosResponse` for preview/preprod list endpoints */
function latestBlockFromKoios(blocksPayload) {
  if (Array.isArray(blocksPayload) && blocksPayload.length > 0) {
    const b = blocksPayload[0];
    return { ...b, slot: b.abs_slot ?? b.slot };
  }
  return { ...blocksPayload, slot: blocksPayload.absolute_slot ?? blocksPayload.slot };
}

function latestEpochParamsFromKoios(paramsPayload) {
  if (Array.isArray(paramsPayload) && paramsPayload.length > 0) {
    return paramsPayload[0];
  }
  return paramsPayload;
}

async function fetchProtocolSlot(base, apiKey) {
  const raw = await koiosGet(base, '/blocks', apiKey);
  const b = latestBlockFromKoios(raw);
  if (b.slot == null) throw new Error('Koios blocks: missing slot');
  return parseInt(String(b.slot), 10);
}

async function fetchProtocolParams(base, apiKey) {
  const raw = await koiosGet(base, '/epoch_params', apiKey);
  const p = latestEpochParamsFromKoios(raw);
  if (!p.min_fee_a || !p.min_fee_b) {
    throw new Error('Koios epoch_params: missing fee fields');
  }
  const latest_block_slot = await fetchProtocolSlot(base, apiKey);
  return {
    linearFee: {
      minFeeA: p.min_fee_a.toString(),
      minFeeB: p.min_fee_b.toString(),
    },
    minUtxo: '1000000',
    poolDeposit: p.pool_deposit.toString(),
    keyDeposit: p.key_deposit.toString(),
    coinsPerUtxoWord: p.coins_per_utxo_size.toString(),
    maxValSize: p.max_val_size,
    priceMem: p.price_mem,
    priceStep: p.price_step,
    minFeeRefScriptCostPerByte: p.min_fee_ref_script_cost_per_byte || 0,
    maxTxSize: parseInt(p.max_tx_size, 10),
    slot: latest_block_slot,
    collateralPercentage: parseInt(p.collateral_percent, 10),
    maxCollateralInputs: parseInt(p.max_collateral_inputs, 10),
  };
}

/**
 * Derive account 0 base address (CIP-1852) for preview/preprod (network id 0).
 */
function deriveAccount0Address(mnemonicPhrase) {
  if (!validateMnemonic(mnemonicPhrase)) {
    throw new Error('Invalid BIP-39 mnemonic');
  }
  const entropy = mnemonicToEntropy(mnemonicPhrase);
  const root = Cardano.Bip32PrivateKey.from_bip39_entropy(
    Buffer.from(entropy, 'hex'),
    Buffer.from('')
  );
  const accountKey = root
    .derive(harden(1852))
    .derive(harden(1815))
    .derive(harden(0));
  const paymentKey = accountKey.derive(0).derive(0).to_raw_key();
  const stakeKey = accountKey.derive(2).derive(0).to_raw_key();
  const networkId = 0;
  const baseAddr = Cardano.BaseAddress.new(
    networkId,
    Cardano.Credential.from_keyhash(paymentKey.to_public().hash()),
    Cardano.Credential.from_keyhash(stakeKey.to_public().hash())
  );
  const address = baseAddr.to_address();
  return {
    address,
    bech32: address.to_bech32(),
    paymentKey,
    stakeKey,
  };
}

async function fetchUtxosForAddress(base, bech32, apiKey) {
  const rows = await koiosPost(base, '/address_info', { _addresses: [bech32] }, apiKey);
  if (!rows || rows.error || !rows[0]) {
    return [];
  }
  const utxoSet = rows[0].utxo_set || [];
  return utxoSet.map((utxo) => ({
    tx_hash: utxo.tx_hash,
    output_index: utxo.output_index,
    amount: [
      { unit: 'lovelace', quantity: utxo.value || '0' },
      ...(utxo.asset_list || []).map((a) => ({
        unit: a.policy_id + a.asset_name,
        quantity: a.quantity || '0',
      })),
    ],
  }));
}

function utxoToCsl(output, bech32) {
  const addr = Cardano.Address.from_bech32(bech32);
  const ix = output.output_index ?? 0;
  const lovelace = output.amount.find((a) => a.unit === 'lovelace');
  const coin = Cardano.BigNum.from_str(lovelace ? String(lovelace.quantity) : '0');
  const value = Cardano.Value.new(coin);
  return Cardano.TransactionUnspentOutput.new(
    Cardano.TransactionInput.new(
      Cardano.TransactionHash.from_bytes(Buffer.from(output.tx_hash, 'hex')),
      Cardano.BigNum.from_str(String(ix))
    ),
    Cardano.TransactionOutput.new(addr, value)
  );
}

/**
 * Build, sign, submit transfer of `sendLovelace` to the same address (exercise round-trip).
 *
 * @param {{ baseUrl: string, apiKey: string | undefined, mnemonic: string, sendLovelace: string }} opts
 * @returns {Promise<string>} submitted tx hash / id from Koios
 */
async function buildSignSubmitSelfTransfer(opts) {
  const { baseUrl, apiKey, mnemonic, sendLovelace } = opts;
  const { address, bech32, paymentKey } = deriveAccount0Address(mnemonic.trim());

  const protocolParameters = await fetchProtocolParams(baseUrl, apiKey);
  const utxoJson = await fetchUtxosForAddress(baseUrl, bech32, apiKey);
  if (utxoJson.length === 0) {
    throw new Error(`No UTxOs at ${bech32} — fund this address with test ADA first.`);
  }

  const adaOnly = utxoJson.filter(
    (u) => !(u.amount || []).some((a) => a.unit !== 'lovelace')
  );
  if (adaOnly.length === 0) {
    throw new Error(
      `No ADA-only UTxOs at ${bech32} — consolidate or use an address with plain tADA (no tokens on outputs).`
    );
  }

  const utxos = adaOnly.map((u) => utxoToCsl(u, bech32));
  const utxoCollection = Cardano.TransactionUnspentOutputs.new();
  for (const u of utxos) utxoCollection.add(u);

  const txBuilder = Cardano.TransactionBuilder.new(
    Cardano.TransactionBuilderConfigBuilder.new()
      .fee_algo(
        Cardano.LinearFee.new(
          Cardano.BigNum.from_str(protocolParameters.linearFee.minFeeA),
          Cardano.BigNum.from_str(protocolParameters.linearFee.minFeeB)
        )
      )
      .pool_deposit(Cardano.BigNum.from_str(protocolParameters.poolDeposit))
      .key_deposit(Cardano.BigNum.from_str(protocolParameters.keyDeposit))
      .coins_per_utxo_byte(Cardano.BigNum.from_str(protocolParameters.coinsPerUtxoWord))
      .max_value_size(parseInt(protocolParameters.maxValSize, 10))
      .max_tx_size(parseInt(protocolParameters.maxTxSize, 10))
      .prefer_pure_change(true)
      .build()
  );

  txBuilder.add_inputs_from(utxoCollection);

  const outputs = Cardano.TransactionOutputs.new();
  outputs.add(
    Cardano.TransactionOutput.new(
      address,
      Cardano.Value.new(Cardano.BigNum.from_str(String(sendLovelace)))
    )
  );

  for (let i = 0; i < outputs.len(); i += 1) {
    txBuilder.add_output(outputs.get(i));
  }

  txBuilder.add_change_if_needed(address);

  const slot = Cardano.BigNum.from_str(protocolParameters.slot.toString());
  const invalidHereafter = Cardano.BigNum.from_str(
    (parseInt(protocolParameters.slot, 10) + TX.invalid_hereafter).toString()
  );
  txBuilder.set_validity_start_interval(slot);
  txBuilder.set_ttl(invalidHereafter);

  const txBody = txBuilder.build();
  const emptyWitness = Cardano.TransactionWitnessSet.new();
  const unsigned = Cardano.Transaction.new(txBody, emptyWitness, undefined);

  const txHash = Cardano.hash_transaction(unsigned.body());
  const vkeys = Cardano.VkeywitnessList.new();
  vkeys.add(Cardano.make_vkey_witness(txHash, paymentKey));
  const witnessSet = Cardano.TransactionWitnessSet.new();
  witnessSet.set_vkeywitnesses(vkeys);

  const signed = Cardano.Transaction.new(
    unsigned.body(),
    witnessSet,
    unsigned.auxiliary_data()
  );
  signed.set_is_valid(unsigned.is_valid());

  const txHex = Buffer.from(signed.to_bytes()).toString('hex');
  const submitRes = await koiosSubmitTx(baseUrl, txHex, apiKey);
  if (typeof submitRes === 'string') return submitRes;
  if (submitRes && typeof submitRes === 'object' && submitRes.tx_hash) {
    return submitRes.tx_hash;
  }
  return JSON.stringify(submitRes);
}

module.exports = {
  buildSignSubmitSelfTransfer,
  deriveAccount0Address,
  fetchProtocolParams,
};
