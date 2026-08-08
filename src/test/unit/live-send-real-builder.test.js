/**
 * Guards for the live-send CI integration (see
 * src/test/integration/send-transaction-preview-preprod.integration.test.js).
 *
 * 1. Behavioral: the live-send helper must build with the PRODUCTION wallet
 *    builder (`buildUnsignedSimpleTx`), not a parallel reimplementation — that is
 *    the whole point of sending real testnet txs in CI, so a regression in the
 *    real tx-assembly path fails the pipeline. This test wraps the real builder
 *    with a spy and drives the helper with a mocked provider (no network), then
 *    asserts the builder ran with the right inputs and the tx was signed +
 *    submitted end to end.
 * 2. Config: the Jenkins integration stage must stay gating (it was temporarily
 *    non-gating while a Koios token was expired). This locks that back down so a
 *    failed live send blocks merges instead of silently going green.
 */

const fs = require('fs');
const path = require('path');
const { generateMnemonic } = require('bip39');

// Wrap the real builder so the destructured import inside koios-self-send.js
// resolves to a spy over the genuine implementation (not a stub).
jest.mock('../../api/tx/csl-unsigned-tx', () => {
  const actual = jest.requireActual('../../api/tx/csl-unsigned-tx');
  return {
    __esModule: true,
    ...actual,
    buildUnsignedSimpleTx: jest.fn((...args) => actual.buildUnsignedSimpleTx(...args)),
  };
});

const { buildUnsignedSimpleTx } = require('../../api/tx/csl-unsigned-tx');
const {
  buildSignSubmitAccountTransfer,
  deriveAccountAddress,
  PROVIDER,
} = require('../integration/koios-self-send');

const PREPROD_BLOCKFROST_BASE = 'https://cardano-preprod.blockfrost.io/api/v0';
const SUBMIT_HASH = 'bb'.repeat(32);

// Blockfrost /epochs/latest/parameters shape (snake_case), realistic values.
const EPOCH_PARAMS = {
  min_fee_a: 44,
  min_fee_b: 155381,
  pool_deposit: '500000000',
  key_deposit: '2000000',
  coins_per_utxo_size: '4310',
  max_val_size: '5000',
  price_mem: 0.0577,
  price_step: 0.0000721,
  min_fee_ref_script_cost_per_byte: 15,
  max_tx_size: '16384',
  collateral_percent: '150',
  max_collateral_inputs: '3',
};

describe('live send integration exercises the production wallet builder', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  const jsonResponse = (status, bodyText) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => bodyText,
  });

  test('builds via buildUnsignedSimpleTx, then signs and submits', async () => {
    const mnemonic = generateMnemonic(160); // 15-word BIP-39
    const sender = deriveAccountAddress(mnemonic, 0);

    const UTXOS = [
      {
        tx_hash: 'aa'.repeat(32),
        output_index: 0,
        amount: [{ unit: 'lovelace', quantity: '10000000' }],
      },
    ];

    global.fetch = jest.fn(async (url, options = {}) => {
      const u = String(url);
      const method = (options.method || 'GET').toUpperCase();
      if (u.includes('/epochs/latest/parameters')) {
        return jsonResponse(200, JSON.stringify(EPOCH_PARAMS));
      }
      if (u.includes('/blocks/latest')) {
        return jsonResponse(200, JSON.stringify({ slot: 60000000 }));
      }
      if (u.includes('/utxos')) {
        return jsonResponse(200, JSON.stringify(UTXOS));
      }
      if (u.endsWith('/tx/submit') && method === 'POST') {
        // Blockfrost returns the tx hash as a JSON-quoted string.
        return jsonResponse(200, JSON.stringify(SUBMIT_HASH));
      }
      throw new Error(`Unexpected fetch in test: ${method} ${u}`);
    });

    const hash = await buildSignSubmitAccountTransfer({
      providerType: PROVIDER.blockfrost,
      baseUrl: PREPROD_BLOCKFROST_BASE,
      apiKey: 'preprodTESTKEY',
      mnemonic,
      sendLovelace: '5000000',
    });

    // End-to-end wiring: the mocked submit's hash comes back, proving build →
    // sign → submit all ran.
    expect(hash).toBe(SUBMIT_HASH);

    // The production builder ran (not a parallel implementation) with wallet inputs.
    expect(buildUnsignedSimpleTx).toHaveBeenCalledTimes(1);
    const builderArg = buildUnsignedSimpleTx.mock.calls[0][0];
    expect(builderArg.changeAddressBech32).toBe(sender.bech32);
    expect(Array.isArray(builderArg.requiredVkeyHashesHex)).toBe(true);
    // 28-byte Ed25519 key hash (payment key hash) as hex.
    expect(builderArg.requiredVkeyHashesHex[0]).toMatch(/^[a-f0-9]{56}$/);
    expect(builderArg.outputs.len()).toBe(1);

    // The real submit endpoint was actually hit.
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/tx/submit'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('Jenkins integration stage stays gating', () => {
  const jenkinsfile = fs.readFileSync(
    path.join(__dirname, '../../../Jenkinsfile'),
    'utf8'
  );

  test('runs the live send suite without swallowing failures', () => {
    expect(jenkinsfile).toContain('npm run test:integration');
    // The old non-gating escape hatches must not come back.
    expect(jenkinsfile).not.toContain('temporarily non-gating');
    expect(jenkinsfile).not.toContain('integration tests failed but are non-gating');
  });

  test('publishes a failure status for the Integration tests stage', () => {
    expect(jenkinsfile).toContain(
      "publishGithubStatus('Integration tests', 'failure'"
    );
  });
});

describe('coverage gate is owned by the unit run, not the live-send integration run', () => {
  // Regression guard for a local/Jenkins divergence: the money-path coverage
  // floor is enabled `isCi`, so it used to also apply to the integration-only
  // run — where 15 green live-send tests still failed the stage on unrelated
  // coverage math (src/api/tx + wallet.js exercised only in the unit suites).
  const CONFIG_PATH = path.join(__dirname, '../../../jest.config.js');

  const loadConfigWithEnv = (env) => {
    const touched = ['CI', 'JENKINS_URL', 'GITHUB_ACTIONS', 'LUCEM_RUN_INTEGRATION'];
    const saved = {};
    touched.forEach((k) => {
      saved[k] = process.env[k];
      delete process.env[k];
    });
    Object.assign(process.env, env);
    let cfg;
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      cfg = require(CONFIG_PATH);
    });
    touched.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
    return cfg;
  };

  test('CI unit run enforces the money-path coverage threshold', () => {
    const cfg = loadConfigWithEnv({ JENKINS_URL: 'http://jenkins.local' });
    expect(cfg.collectCoverage).toBe(true);
    expect(cfg.coverageThreshold).toBeTruthy();
    expect(cfg.coverageThreshold['./src/api/tx/']).toBeTruthy();
  });

  test('CI live-send integration run is exempt from that threshold', () => {
    const cfg = loadConfigWithEnv({
      JENKINS_URL: 'http://jenkins.local',
      LUCEM_RUN_INTEGRATION: '1',
    });
    // A green live send must never fail on unit-suite coverage math.
    expect(cfg.coverageThreshold).toBeUndefined();
    expect(cfg.collectCoverage).toBeUndefined();
    // ...and it must still actually run the integration suite.
    expect(cfg.testPathIgnorePatterns).not.toContain('/src/test/integration/');
  });
});
