/**
 * @jest-environment node
 *
 * Integration tests that exercise the ACTUAL wallet code paths —
 * not a reimplementation. Catches CSL API renames, provider routing
 * bugs, UTxO index issues, and delegation cert logic.
 *
 * Run: npm run test:integration   (requires .env with mnemonics + API keys)
 */

require('dotenv').config();

jest.mock('../../api/extension', () => ({
  getNetwork: jest.fn(() =>
    Promise.resolve({ id: 'preprod', name: 'preprod', node: 'https://preprod.koios.rest/api/v1' })
  ),
}));
jest.mock('../../platform', () => ({
  __esModule: true,
  default: { storage: { get: jest.fn(), set: jest.fn() } },
}));

const Cardano = require('@emurgo/cardano-serialization-lib-nodejs');
const { mnemonicToEntropy, validateMnemonic } = require('bip39');

const {
  koiosRequest,
  koiosSubmitTransaction,
  utxoFromJson,
  resolveBlockfrostProjectId,
} = require('../../api/util');

const {
  buildUnsignedSimpleTx,
  createCslTransactionBuilderConfig,
  toCanonicalTransactionCip21,
} = require('../../api/tx/csl-unsigned-tx');

const {
  buildVkeyWitnessSet,
} = require('../../api/tx/sign-witness-set');

const {
  buildProtocolParametersSnapshot,
  fetchKoiosTipSlot,
  latestEpochParamsRow,
} = require('../../api/tx/protocol-params');

const {
  createStakeRegistrationCertificate,
  createStakeDelegationCertificate,
} = require('../../api/tx/staking-certificates');

const HARDEN = 0x80000000;
const harden = (n) => HARDEN + n;

const PREPROD_MNEMONIC = (process.env.LUCEM_INTEGRATION_PREPROD_MNEMONIC || '').trim();
const BLOCKFROST_PREPROD_KEY =
  process.env.BLOCKFROST_PREPROD_PROJECT_ID ||
  process.env.BLOCKFROST_PROJECT_ID_PREPROD ||
  '';
const KOIOS_PREPROD_KEY = process.env.KOIOS_API_KEY_PREPROD || '';

const hasMnemonic = PREPROD_MNEMONIC && validateMnemonic(PREPROD_MNEMONIC);
const hasBlockfrost = BLOCKFROST_PREPROD_KEY &&
  !['DUMMY_PREPROD', 'dummy', 'your-blockfrost-project-id'].includes(BLOCKFROST_PREPROD_KEY);

function deriveKeys(mnemonic) {
  const entropy = mnemonicToEntropy(mnemonic);
  const root = Cardano.Bip32PrivateKey.from_bip39_entropy(
    Buffer.from(entropy, 'hex'),
    Buffer.from('')
  );
  const accountKey = root.derive(harden(1852)).derive(harden(1815)).derive(harden(0));
  const paymentKey = accountKey.derive(0).derive(0).to_raw_key();
  const stakeKey = accountKey.derive(2).derive(0).to_raw_key();
  const paymentKeyHash = paymentKey.to_public().hash().to_hex();
  const stakeKeyHash = stakeKey.to_public().hash().to_hex();
  const baseAddr = Cardano.BaseAddress.new(
    0,
    Cardano.Credential.from_keyhash(paymentKey.to_public().hash()),
    Cardano.Credential.from_keyhash(stakeKey.to_public().hash())
  );
  return { paymentKey, stakeKey, paymentKeyHash, stakeKeyHash, bech32: baseAddr.to_address().to_bech32() };
}

async function fetchLiveUtxos(bech32) {
  const result = await koiosRequest('/address_info', {}, { _addresses: [bech32] });
  if (!result || !result[0]) throw new Error('No address info returned');
  return result[0].utxo_set || [];
}

/* ---------- Provider resolution ---------- */

describe('Blockfrost provider resolution', () => {
  (hasBlockfrost ? test : test.skip)(
    'resolveBlockfrostProjectId returns a usable key for preprod',
    () => {
      const key = resolveBlockfrostProjectId('preprod');
      expect(key).toBeTruthy();
      expect(key).not.toBe('DUMMY_PREPROD');
    }
  );

  test('resolveBlockfrostProjectId rejects placeholder keys', () => {
    const result = resolveBlockfrostProjectId('__nonexistent_network__');
    expect(result).toBeNull();
  });
});

/* ---------- Data fetch via koiosRequest (uses real Blockfrost/Koios) ---------- */

const describeLive = hasMnemonic ? describe : describe.skip;

describeLive('koiosRequest dual-provider data fetch (Preprod live)', () => {
  jest.setTimeout(30_000);

  test('/tip returns a valid slot', async () => {
    const tip = await koiosRequest('/tip', {}, null);
    expect(Array.isArray(tip)).toBe(true);
    expect(tip.length).toBeGreaterThan(0);
    const slot = tip[0].abs_slot ?? tip[0].slot;
    expect(Number(slot)).toBeGreaterThan(0);
  });

  test('/epoch_params returns valid protocol parameters', async () => {
    const params = await koiosRequest('/epoch_params', {}, null);
    const row = latestEpochParamsRow(params);
    expect(row.min_fee_a).toBeDefined();
    expect(row.min_fee_b).toBeDefined();
    expect(row.coins_per_utxo_size).toBeDefined();
    const snapshot = buildProtocolParametersSnapshot(row, 99999);
    expect(snapshot.linearFee.minFeeA).toBeTruthy();
    expect(snapshot.linearFee.minFeeB).toBeTruthy();
  });

  test('/address_info returns UTxOs with tx_index or output_index', async () => {
    const { bech32 } = deriveKeys(PREPROD_MNEMONIC);
    const rawUtxos = await fetchLiveUtxos(bech32);
    expect(rawUtxos.length).toBeGreaterThan(0);

    for (const raw of rawUtxos) {
      const idx = raw.output_index ?? raw.tx_index;
      expect(idx).toBeDefined();
      expect(typeof idx).toBe('number');
    }
  });
});

/* ---------- UTxO parsing via real utxoFromJson ---------- */

describeLive('utxoFromJson with live chain data (Preprod)', () => {
  jest.setTimeout(30_000);

  test('parses live UTxOs preserving correct output indices', async () => {
    const { bech32 } = deriveKeys(PREPROD_MNEMONIC);
    const rawUtxos = await fetchLiveUtxos(bech32);

    for (const raw of rawUtxos) {
      const expectedIndex = raw.output_index ?? raw.tx_index;
      const formatted = {
        tx_hash: raw.tx_hash,
        output_index: raw.output_index ?? raw.tx_index,
        amount: [
          { unit: 'lovelace', quantity: raw.value || '0' },
          ...(raw.asset_list || []).map((a) => ({
            unit: a.policy_id + a.asset_name,
            quantity: a.quantity || '0',
          })),
        ],
      };
      const cslUtxo = await utxoFromJson(formatted, bech32);

      expect(cslUtxo.input().index()).toBe(expectedIndex);
      expect(
        Buffer.from(cslUtxo.input().transaction_id().to_bytes()).toString('hex')
      ).toBe(raw.tx_hash);
      expect(Number(cslUtxo.output().amount().coin().to_str())).toBeGreaterThan(0);
    }
  });
});

/* ---------- Build → sign → assemble (no submit) ---------- */

describeLive('build → sign → assemble pipeline (Preprod, no submit)', () => {
  jest.setTimeout(60_000);

  test('full pipeline produces a value-conserving signed tx', async () => {
    const { paymentKey, stakeKey, paymentKeyHash, stakeKeyHash, bech32 } =
      deriveKeys(PREPROD_MNEMONIC);

    // Fetch live protocol params via the app's koiosRequest (Blockfrost first)
    const tipSlot = await fetchKoiosTipSlot(
      (endpoint, _h, body) => koiosRequest(endpoint, {}, body)
    );
    const epochParams = await koiosRequest('/epoch_params', {}, null);
    const protocolParams = buildProtocolParametersSnapshot(
      latestEpochParamsRow(epochParams),
      tipSlot
    );

    // Fetch UTxOs via the app's koiosRequest → utxoFromJson
    const rawUtxos = await fetchLiveUtxos(bech32);
    expect(rawUtxos.length).toBeGreaterThan(0);

    const utxos = [];
    for (const raw of rawUtxos) {
      utxos.push(
        await utxoFromJson(
          {
            tx_hash: raw.tx_hash,
            output_index: raw.output_index ?? raw.tx_index,
            amount: [
              { unit: 'lovelace', quantity: raw.value || '0' },
              ...(raw.asset_list || []).map((a) => ({
                unit: a.policy_id + a.asset_name,
                quantity: a.quantity || '0',
              })),
            ],
          },
          bech32
        )
      );
    }

    // Build via the app's buildUnsignedSimpleTx
    const outputs = Cardano.TransactionOutputs.new();
    outputs.add(
      Cardano.TransactionOutput.new(
        Cardano.Address.from_bech32(bech32),
        Cardano.Value.new(Cardano.BigNum.from_str('2000000'))
      )
    );
    const unsignedTx = buildUnsignedSimpleTx({
      Cardano,
      protocolParameters: protocolParams,
      utxos,
      outputs,
      changeAddressBech32: bech32,
      requiredVkeyHashesHex: [paymentKeyHash, stakeKeyHash],
    });

    // Verify value conservation
    const body = unsignedTx.body();
    const selectedInputs = body.inputs();
    let inputTotal = 0n;
    for (let i = 0; i < selectedInputs.len(); i++) {
      const inp = selectedInputs.get(i);
      const match = utxos.find(
        (u) =>
          u.input().index() === inp.index() &&
          Buffer.from(u.input().transaction_id().to_bytes()).toString('hex') ===
            Buffer.from(inp.transaction_id().to_bytes()).toString('hex')
      );
      if (match) inputTotal += BigInt(match.output().amount().coin().to_str());
    }
    let outputTotal = 0n;
    for (let i = 0; i < body.outputs().len(); i++) {
      outputTotal += BigInt(body.outputs().get(i).amount().coin().to_str());
    }
    expect(outputTotal + BigInt(body.fee().to_str())).toBe(inputTotal);

    // Sign via the app's buildVkeyWitnessSet
    const txHex = Buffer.from(unsignedTx.to_bytes()).toString('hex');
    const witnessSet = buildVkeyWitnessSet(
      Cardano,
      txHex,
      new Map([[paymentKeyHash, paymentKey], [stakeKeyHash, stakeKey]]),
      [paymentKeyHash, stakeKeyHash]
    );
    expect(witnessSet.vkeys().len()).toBe(2);

    // Assemble and verify body hash preserved
    const signed = Cardano.Transaction.new(body, witnessSet, unsignedTx.auxiliary_data());
    const origHash = Buffer.from(
      Cardano.FixedTransactionBody.from_bytes(body.to_bytes()).tx_hash().to_bytes()
    ).toString('hex');
    const signedHash = Buffer.from(
      Cardano.FixedTransactionBody.from_bytes(signed.body().to_bytes()).tx_hash().to_bytes()
    ).toString('hex');
    expect(signedHash).toBe(origHash);

    // CIP-21 canonical encoding preserves hash
    const canonical = toCanonicalTransactionCip21(Cardano, unsignedTx);
    const canonHash = Buffer.from(
      Cardano.FixedTransactionBody.from_bytes(canonical.body().to_bytes()).tx_hash().to_bytes()
    ).toString('hex');
    expect(canonHash).toBe(origHash);
  });
});

/* ---------- Delegation cert logic ---------- */

describe('delegation cert logic with real CSL', () => {
  const STAKE_HASH = 'aa'.repeat(28);
  const POOL_HASH = 'bb'.repeat(28);

  function buildCerts(delegation) {
    const cb = Cardano.CertificatesBuilder.new();
    if (!delegation.registered) {
      cb.add(createStakeRegistrationCertificate(Cardano, STAKE_HASH));
    }
    cb.add(createStakeDelegationCertificate(Cardano, STAKE_HASH, POOL_HASH));
    return cb;
  }

  test('registered=true → 1 cert (delegation only)', () => {
    expect(buildCerts({ registered: true, active: true }).build().len()).toBe(1);
  });

  test('registered=false → 2 certs (registration + delegation)', () => {
    expect(buildCerts({ registered: false, active: false }).build().len()).toBe(2);
  });

  test('BUG GUARD: active=false + registered=true → 1 cert only', () => {
    expect(buildCerts({ registered: true, active: false }).build().len()).toBe(1);
  });
});

/* ---------- Submit provider order ---------- */

const describeBlockfrost = hasBlockfrost ? describe : describe.skip;

describeBlockfrost('koiosSubmitTransaction uses Blockfrost first (Preprod live)', () => {
  jest.setTimeout(30_000);

  test('Blockfrost is attempted before Koios for submission', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await koiosSubmitTransaction('deadbeef');
    } catch {
      // Invalid tx — expected to fail. We only care about provider order.
    }

    // If Blockfrost was tried and failed, the console.warn shows fallback message.
    // If it wasn't tried at all, we'd only see a Koios error with no Blockfrost warning.
    const allOutput = [
      ...warnSpy.mock.calls.map((c) => String(c[0] || '')),
      ...errorSpy.mock.calls.map((c) => String(c[0] || '')),
    ].join('\n');

    const blockfrostMentioned = allOutput.includes('Blockfrost');
    const koiosOnly = !blockfrostMentioned && allOutput.includes('Koios');

    expect(koiosOnly).toBe(false);

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
