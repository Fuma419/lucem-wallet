const { assertTestnetOnly } = require('../integration/koios-self-send');

describe('integration transaction testnet-only guard', () => {
  const original = process.env.LUCEM_ALLOW_MAINNET_INTEGRATION;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.LUCEM_ALLOW_MAINNET_INTEGRATION;
    } else {
      process.env.LUCEM_ALLOW_MAINNET_INTEGRATION = original;
    }
  });

  test('allows Preview/Preprod testnet endpoints and addresses', () => {
    delete process.env.LUCEM_ALLOW_MAINNET_INTEGRATION;
    expect(() =>
      assertTestnetOnly('https://preview.koios.rest/api/v1', 'addr_test1abc')
    ).not.toThrow();
    expect(() =>
      assertTestnetOnly(
        'https://cardano-preprod.blockfrost.io/api/v0',
        'addr_test1xyz'
      )
    ).not.toThrow();
  });

  test('refuses mainnet Koios/Blockfrost endpoints', () => {
    delete process.env.LUCEM_ALLOW_MAINNET_INTEGRATION;
    expect(() =>
      assertTestnetOnly('https://api.koios.rest/api/v1', 'addr_test1abc')
    ).toThrow(/mainnet/i);
    expect(() =>
      assertTestnetOnly(
        'https://cardano-mainnet.blockfrost.io/api/v0',
        'addr_test1abc'
      )
    ).toThrow(/mainnet/i);
  });

  test('refuses mainnet (addr1...) sender addresses', () => {
    delete process.env.LUCEM_ALLOW_MAINNET_INTEGRATION;
    expect(() =>
      assertTestnetOnly('https://preview.koios.rest/api/v1', 'addr1qxyz')
    ).toThrow(/mainnet/i);
  });

  test('explicit LUCEM_ALLOW_MAINNET_INTEGRATION=1 overrides the guard', () => {
    process.env.LUCEM_ALLOW_MAINNET_INTEGRATION = '1';
    expect(() =>
      assertTestnetOnly('https://api.koios.rest/api/v1', 'addr1qxyz')
    ).not.toThrow();
  });
});
