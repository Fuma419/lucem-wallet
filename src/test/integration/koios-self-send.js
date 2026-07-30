/**
 * CSL path to build, sign, and submit a small ADA transfer.
 * Prefers Blockfrost, falls back to Koios (integration tests only).
 */

const Cardano = require('@emurgo/cardano-serialization-lib-nodejs');
const { mnemonicToEntropy, validateMnemonic } = require('bip39');

const HARDEN = 0x80000000;
const harden = (n) => HARDEN + n;

const TX = { invalid_hereafter: 3600 * 6 };

const PROVIDER = {
  blockfrost: 'blockfrost',
  koios: 'koios',
};

// Mainnet endpoints. Live transaction tests must never touch these unless the
// caller explicitly opts in with LUCEM_ALLOW_MAINNET_INTEGRATION=1.
const MAINNET_ENDPOINT_RE = /(api\.koios\.rest|cardano-mainnet\.blockfrost\.io)/i;

/**
 * Guard: refuse to build/submit a live transaction against mainnet.
 * Integration transaction tests are Preview/Preprod only by policy.
 * @param {string} baseUrl   provider base URL used for submit
 * @param {string} [bech32]  derived sender address (mainnet uses addr1..., testnet addr_test1...)
 */
function assertTestnetOnly(baseUrl, bech32) {
  if (process.env.LUCEM_ALLOW_MAINNET_INTEGRATION === '1') return;
  const mainnetUrl = MAINNET_ENDPOINT_RE.test(String(baseUrl || ''));
  const mainnetAddr =
    typeof bech32 === 'string' &&
    bech32.startsWith('addr1') &&
    !bech32.startsWith('addr_test');
  if (mainnetUrl || mainnetAddr) {
    throw new Error(
      'Refusing to run a live transaction test against mainnet. ' +
        'Integration transaction tests run on Preview/Preprod only. ' +
        'Set LUCEM_ALLOW_MAINNET_INTEGRATION=1 to explicitly override.'
    );
  }
}

function authHeaders(providerType, apiKey) {
  const h = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (
    apiKey &&
    apiKey !== 'your-koios-api-key-here' &&
    apiKey !== 'your-blockfrost-project-id' &&
    apiKey !== 'DUMMY_PREVIEW'
  ) {
    if (providerType === PROVIDER.blockfrost) {
      h.project_id = apiKey;
      return h;
    }
    h.Authorization = `Bearer ${apiKey}`;
  }
  return h;
}

async function requestJson({ providerType, base, path, method = 'GET', body, apiKey }) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: authHeaders(providerType, apiKey),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`${providerType} ${method} ${path} ${r.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function submitTx(providerType, base, txHex, apiKey) {
  const path = providerType === PROVIDER.blockfrost ? '/tx/submit' : '/submittx';
  const h = { ...authHeaders(providerType, apiKey), 'Content-Type': 'application/cbor' };
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: h,
    body: Buffer.from(txHex, 'hex'),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`${providerType} POST ${path} ${r.status}: ${text.slice(0, 800)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function koiosGet(base, path, apiKey) {
  return requestJson({
    providerType: PROVIDER.koios,
    base,
    path,
    method: 'GET',
    apiKey,
  });
}

async function koiosPost(base, path, body, apiKey) {
  return requestJson({
    providerType: PROVIDER.koios,
    base,
    path,
    method: 'POST',
    body,
    apiKey,
  });
}

async function blockfrostGet(base, path, apiKey) {
  return requestJson({
    providerType: PROVIDER.blockfrost,
    base,
    path,
    method: 'GET',
    apiKey,
  });
}

function latestEpochParamsFromKoios(paramsPayload) {
  if (Array.isArray(paramsPayload) && paramsPayload.length > 0) {
    return paramsPayload[0];
  }
  return paramsPayload;
}

async function fetchProtocolSlot(base, apiKey, providerType = PROVIDER.koios) {
  if (providerType === PROVIDER.blockfrost) {
    const latest = await blockfrostGet(base, '/blocks/latest', apiKey);
    const s = latest?.slot;
    if (s == null) throw new Error('Blockfrost /blocks/latest: missing slot');
    return parseInt(String(s), 10);
  }

  const raw = await koiosGet(base, '/tip', apiKey);
  const row = Array.isArray(raw) && raw.length > 0 ? raw[0] : raw;
  const s = row?.abs_slot ?? row?.absolute_slot ?? row?.slot;
  if (s == null) throw new Error('Koios /tip: missing abs_slot');
  return parseInt(String(s), 10);
}

const toKoiosEpochParamsFromBlockfrost = (p) => ({
  min_fee_a: p.min_fee_a,
  min_fee_b: p.min_fee_b,
  pool_deposit: p.pool_deposit,
  key_deposit: p.key_deposit,
  coins_per_utxo_size: p.coins_per_utxo_size || p.coins_per_utxo_word,
  max_val_size: p.max_val_size,
  price_mem: p.price_mem,
  price_step: p.price_step,
  min_fee_ref_script_cost_per_byte: p.min_fee_ref_script_cost_per_byte || 0,
  max_tx_size: p.max_tx_size,
  collateral_percent: p.collateral_percent,
  max_collateral_inputs: p.max_collateral_inputs,
});

async function fetchProtocolParams(base, apiKey, providerType = PROVIDER.koios) {
  let p;
  if (providerType === PROVIDER.blockfrost) {
    const bf = await blockfrostGet(base, '/epochs/latest/parameters', apiKey);
    p = toKoiosEpochParamsFromBlockfrost(bf);
  } else {
    const raw = await koiosGet(base, '/epoch_params', apiKey);
    p = latestEpochParamsFromKoios(raw);
  }

  if (!p?.min_fee_a || !p?.min_fee_b) {
    throw new Error(`${providerType} epoch params: missing fee fields`);
  }
  const latest_block_slot = await fetchProtocolSlot(base, apiKey, providerType);
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

function deriveAccountAddress(mnemonicPhrase, accountIndex = 0) {
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
    .derive(harden(accountIndex));
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

/** Derive account 0 base address (CIP-1852) for preview/preprod (network id 0). */
function deriveAccount0Address(mnemonicPhrase) {
  return deriveAccountAddress(mnemonicPhrase, 0);
}

async function fetchUtxosForAddress(base, bech32, apiKey) {
  // address_info.utxo_set tracks unspent outputs for an address at query time.
  const rows = await koiosPost(
    base,
    '/address_info',
    { _addresses: [bech32] },
    apiKey
  );
  const utxoSet =
    Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0].utxo_set)
      ? rows[0].utxo_set
      : [];
  if (utxoSet.length === 0) {
    return [];
  }
  const ix = (u) =>
    u.tx_index != null ? u.tx_index : u.output_index;
  return utxoSet
    .filter((u) => (u.address == null || u.address === bech32))
    .map((utxo) => ({
      tx_hash: utxo.tx_hash,
      output_index: ix(utxo),
      amount: [
        { unit: 'lovelace', quantity: String(utxo.value ?? '0') },
        ...(utxo.asset_list || []).map((a) => ({
          unit: a.policy_id + a.asset_name,
          quantity: a.quantity || '0',
        })),
      ],
    }));
}

async function fetchUtxosForAddressBlockfrost(base, bech32, apiKey) {
  const pageSize = 100;
  let page = 1;
  const utxos = [];
  while (page <= 50) {
    const rows = await blockfrostGet(
      base,
      `/addresses/${bech32}/utxos?order=asc&count=${pageSize}&page=${page}`,
      apiKey
    );
    if (!Array.isArray(rows) || rows.length === 0) break;
    utxos.push(...rows);
    if (rows.length < pageSize) break;
    page += 1;
  }
  return utxos.map((utxo) => ({
    tx_hash: utxo.tx_hash,
    output_index: utxo.output_index,
    amount: Array.isArray(utxo.amount)
      ? utxo.amount.map((asset) => ({
          unit: asset.unit,
          quantity: String(asset.quantity || '0'),
        }))
      : [{ unit: 'lovelace', quantity: '0' }],
  }));
}

function utxoToCsl(output, bech32) {
  const addr = Cardano.Address.from_bech32(bech32);
  const ix = Number.parseInt(
    String(output.output_index ?? output.tx_index ?? 0),
    10
  );
  if (!Number.isFinite(ix) || ix < 0) {
    throw new Error(`Invalid UTxO index for ${output.tx_hash}`);
  }
  const amountList = Array.isArray(output.amount) ? output.amount : [];
  const lovelace = amountList.find((a) => a.unit === 'lovelace');
  const coin = Cardano.BigNum.from_str(lovelace ? String(lovelace.quantity) : '0');
  const multiAsset = Cardano.MultiAsset.new();
  const policyBuckets = new Map();

  for (const asset of amountList) {
    if (!asset || asset.unit === 'lovelace') continue;
    const unit = String(asset.unit || '');
    const policy = unit.slice(0, 56);
    const nameHex = unit.slice(56);
    if (!policy || !nameHex) continue;
    if (!policyBuckets.has(policy)) {
      policyBuckets.set(policy, []);
    }
    policyBuckets.get(policy).push({
      nameHex,
      quantity: String(asset.quantity || '0'),
    });
  }

  for (const [policy, assets] of policyBuckets.entries()) {
    const cslAssets = Cardano.Assets.new();
    for (const asset of assets) {
      cslAssets.insert(
        Cardano.AssetName.new(Buffer.from(asset.nameHex, 'hex')),
        Cardano.BigNum.from_str(asset.quantity)
      );
    }
    multiAsset.insert(Cardano.ScriptHash.from_hex(policy), cslAssets);
  }

  const value =
    policyBuckets.size > 0
      ? Cardano.Value.new_with_assets(coin, multiAsset)
      : Cardano.Value.new(coin);
  return Cardano.TransactionUnspentOutput.new(
    Cardano.TransactionInput.new(
      Cardano.TransactionHash.from_bytes(Buffer.from(output.tx_hash, 'hex')),
      ix
    ),
    Cardano.TransactionOutput.new(addr, value)
  );
}

/** Koios /submittx returns JSON string (tx id) or wrapped object. */
function normalizeSubmitTxHash(submitRes) {
  if (typeof submitRes === 'string') {
    return submitRes.trim().replace(/^"+|"+$/g, '');
  }
  if (submitRes && typeof submitRes === 'object') {
    if (typeof submitRes.tx_hash === 'string') return submitRes.tx_hash.trim();
    if (typeof submitRes.hash === 'string') return submitRes.hash.trim();
  }
  throw new Error(`Unexpected submit response: ${JSON.stringify(submitRes).slice(0, 200)}`);
}

/**
 * Poll Koios until tx appears in tx_status (optionally with confirmations).
 * @param {{ baseUrl: string, apiKey?: string, txHash: string, maxAttempts?: number, delayMs?: number, minConfirmations?: number }} opts
 */
async function waitForTxStatus(opts) {
  const {
    baseUrl,
    apiKey,
    txHash,
    maxAttempts = 25,
    delayMs = 2000,
    minConfirmations = 0,
  } = opts;
  const h = normalizeSubmitTxHash(txHash).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(h)) {
    throw new Error(`Invalid tx hash for polling: ${h}`);
  }
  for (let i = 0; i < maxAttempts; i += 1) {
    const rows = await koiosPost(
      baseUrl,
      '/tx_status',
      { _tx_hashes: [h] },
      apiKey
    );
    const row = Array.isArray(rows)
      ? rows.find(
          (r) => (r.tx_hash || '').toLowerCase().replace(/^"+|"+$/g, '') === h
        )
      : null;
    if (row && row.num_confirmations != null) {
      const n = Number(row.num_confirmations);
      if (n >= minConfirmations) return row;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `Tx ${h} not visible in Koios /tx_status after ${maxAttempts} attempts`
  );
}

/**
 * Build, sign, submit transfer of `sendLovelace` from account 0 to account 1.
 *
 * @param {{ baseUrl: string, apiKey: string | undefined, mnemonic: string, sendLovelace: string }} opts
 * @returns {Promise<string>} submitted tx hash / id from Koios
 */
async function buildSignSubmitAccountTransfer(opts) {
  const { baseUrl, apiKey, mnemonic, sendLovelace, providerType = PROVIDER.koios } = opts;
  const sender = deriveAccountAddress(mnemonic.trim(), 0);
  const recipient = deriveAccountAddress(mnemonic.trim(), 1);
  const { address, bech32, paymentKey } = sender;

  assertTestnetOnly(baseUrl, bech32);

  if (bech32 === recipient.bech32) {
    throw new Error('Sender and recipient must be different addresses.');
  }

  const protocolParameters = await fetchProtocolParams(baseUrl, apiKey, providerType);

  for (let submitAttempt = 0; submitAttempt < 3; submitAttempt += 1) {
    const utxoJson =
      providerType === PROVIDER.blockfrost
        ? await fetchUtxosForAddressBlockfrost(baseUrl, bech32, apiKey)
        : await fetchUtxosForAddress(baseUrl, bech32, apiKey);
    if (utxoJson.length === 0) {
      throw new Error(`No UTxOs at ${bech32} — fund this address with test ADA first.`);
    }

    const utxos = utxoJson.map((u) => utxoToCsl(u, bech32));
    const utxoCollection = Cardano.TransactionUnspentOutputs.new();
    for (const u of utxos) utxoCollection.add(u);

    const totalInputLovelace = utxoJson.reduce((sum, u) => {
      const lovelace = (u.amount || []).find((a) => a.unit === 'lovelace');
      return sum + BigInt(lovelace?.quantity || '0');
    }, 0n);
    const requestedSend = BigInt(String(sendLovelace));
    const maxSafeSend = totalInputLovelace > 600000n ? totalInputLovelace - 600000n : 0n;
    if (maxSafeSend <= 0n) {
      throw new Error(`Insufficient ADA balance at ${bech32} to build transfer transaction.`);
    }
    const effectiveSend = requestedSend > maxSafeSend ? maxSafeSend : requestedSend;

    const linearFee = Cardano.LinearFee.new(
      Cardano.BigNum.from_str(protocolParameters.linearFee.minFeeA),
      Cardano.BigNum.from_str(protocolParameters.linearFee.minFeeB)
    );

    const txConfig = Cardano.TransactionBuilderConfigBuilder.new()
      .fee_algo(linearFee)
      .pool_deposit(Cardano.BigNum.from_str(protocolParameters.poolDeposit))
      .key_deposit(Cardano.BigNum.from_str(protocolParameters.keyDeposit))
      .coins_per_utxo_byte(Cardano.BigNum.from_str(protocolParameters.coinsPerUtxoWord))
      .max_value_size(parseInt(protocolParameters.maxValSize, 10))
      .max_tx_size(parseInt(protocolParameters.maxTxSize, 10))
      .prefer_pure_change(true)
      .build();

    const outputs = Cardano.TransactionOutputs.new();
    outputs.add(
      Cardano.TransactionOutput.new(
        recipient.address,
        Cardano.Value.new(Cardano.BigNum.from_str(effectiveSend.toString()))
      )
    );

    const invalidHereafter = Cardano.BigNum.from_str(
      String(Math.floor(Number(protocolParameters.slot)) + TX.invalid_hereafter)
    );

    let explicitFee = null;
    let signed;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const txBuilder = Cardano.TransactionBuilder.new(txConfig);
      for (let i = 0; i < outputs.len(); i += 1) {
        txBuilder.add_output(outputs.get(i));
      }
      txBuilder.add_inputs_from(
        utxoCollection,
        Cardano.CoinSelectionStrategyCIP2.LargestFirst
      );
      txBuilder.add_required_signer(paymentKey.to_public().hash());
      if (explicitFee != null) {
        txBuilder.set_fee(explicitFee);
      }
      txBuilder.add_change_if_needed(address);
      txBuilder.set_ttl_bignum(invalidHereafter);

      const txBody = txBuilder.build();
      const emptyWitness = Cardano.TransactionWitnessSet.new();
      const unsigned = Cardano.Transaction.new(txBody, emptyWitness, undefined);

      const bodyBytes = unsigned.body().to_bytes();
      const fixedBody = Cardano.FixedTransactionBody.from_bytes(bodyBytes);
      const txHash = fixedBody.tx_hash();
      if (typeof fixedBody.free === 'function') fixedBody.free();

      const vkeys = Cardano.Vkeywitnesses.new();
      vkeys.add(Cardano.make_vkey_witness(txHash, paymentKey));
      const witnessSet = Cardano.TransactionWitnessSet.new();
      witnessSet.set_vkeys(vkeys);

      signed = Cardano.Transaction.new(
        unsigned.body(),
        witnessSet,
        unsigned.auxiliary_data()
      );
      signed.set_is_valid(unsigned.is_valid());

      const required = Cardano.min_fee(signed, linearFee);
      if (txBody.fee().compare(required) >= 0) {
        break;
      }
      explicitFee = required;
    }

    const txHex = Buffer.from(signed.to_bytes()).toString('hex');
    const signedBody = Cardano.FixedTransactionBody.from_bytes(signed.body().to_bytes());
    const signedTxHashHex = Buffer.from(signedBody.tx_hash().to_bytes()).toString('hex');
    if (typeof signedBody.free === 'function') signedBody.free();
    try {
      const submitRes = await submitTx(providerType, baseUrl, txHex, apiKey);
      return normalizeSubmitTxHash(submitRes);
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('already been included') || message.includes('All inputs are spent')) {
        return signedTxHashHex;
      }
      const shouldRetry =
        submitAttempt < 2 &&
        message.includes('temporarily unavailable');
      if (!shouldRetry) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Could not submit transaction after refreshing UTxOs.');
}

/**
 * Poll Koios /account_txs (via stake address) until txHash appears.
 * Validates that the history endpoint returns the submitted tx.
 */
async function waitForTxInAccountHistory(opts) {
  const {
    baseUrl,
    apiKey,
    mnemonic,
    txHash,
    maxAttempts = 30,
    delayMs = 2000,
  } = opts;
  const h = normalizeSubmitTxHash(txHash).toLowerCase();
  const { stakeKey } = deriveAccountAddress(mnemonic.trim(), 0);
  const rewardAddr = Cardano.RewardAddress.new(
    0,
    Cardano.Credential.from_keyhash(stakeKey.to_public().hash())
  ).to_address().to_bech32();

  for (let i = 0; i < maxAttempts; i += 1) {
    const rows = await koiosGet(
      baseUrl,
      `/account_txs?_stake_address=${rewardAddr}&_after_block_height=0`,
      apiKey
    );
    if (Array.isArray(rows)) {
      const match = rows.find(
        (r) => (r.tx_hash || '').toLowerCase() === h
      );
      if (match) return match;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `Tx ${h} not visible in Koios /account_txs after ${maxAttempts} attempts`
  );
}

module.exports = {
  PROVIDER,
  assertTestnetOnly,
  buildSignSubmitAccountTransfer,
  buildSignSubmitSelfTransfer: buildSignSubmitAccountTransfer,
  deriveAccountAddress,
  deriveAccount0Address,
  fetchProtocolParams,
  normalizeSubmitTxHash,
  waitForTxStatus,
  waitForTxInAccountHistory,
};
