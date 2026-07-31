const { assertTestnetOnly, PROVIDER } = require('../integration/koios-self-send');

describe('integration transaction testnet-only guard', () => {
  const originalAllow = process.env.LUCEM_ALLOW_MAINNET_INTEGRATION;
  const originalCi = process.env.CI;
  const originalJenkins = process.env.JENKINS_URL;
  const originalGha = process.env.GITHUB_ACTIONS;
  const originalBuildId = process.env.BUILD_ID;

  const clearCi = () => {
    delete process.env.CI;
    delete process.env.JENKINS_URL;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.BUILD_ID;
  };

  afterEach(() => {
    if (originalAllow === undefined) {
      delete process.env.LUCEM_ALLOW_MAINNET_INTEGRATION;
    } else {
      process.env.LUCEM_ALLOW_MAINNET_INTEGRATION = originalAllow;
    }
    if (originalCi === undefined) delete process.env.CI;
    else process.env.CI = originalCi;
    if (originalJenkins === undefined) delete process.env.JENKINS_URL;
    else process.env.JENKINS_URL = originalJenkins;
    if (originalGha === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = originalGha;
    if (originalBuildId === undefined) delete process.env.BUILD_ID;
    else process.env.BUILD_ID = originalBuildId;
  });

  test('allows Preview/Preprod testnet endpoints and addresses', () => {
    clearCi();
    delete process.env.LUCEM_ALLOW_MAINNET_INTEGRATION;
    expect(() =>
      assertTestnetOnly('https://preview.koios.rest/api/v1', 'addr_test1abc')
    ).not.toThrow();
    expect(() =>
      assertTestnetOnly(
        'https://cardano-preprod.blockfrost.io/api/v0',
        'addr_test1xyz',
        { providerType: PROVIDER.blockfrost, apiKey: 'preprodabc123' }
      )
    ).not.toThrow();
  });

  test('refuses mainnet Koios/Blockfrost endpoints', () => {
    clearCi();
    delete process.env.LUCEM_ALLOW_MAINNET_INTEGRATION;
    expect(() =>
      assertTestnetOnly('https://api.koios.rest/api/v1', 'addr_test1abc')
    ).toThrow(/Preview\/Preprod/i);
    expect(() =>
      assertTestnetOnly(
        'https://cardano-mainnet.blockfrost.io/api/v0',
        'addr_test1abc'
      )
    ).toThrow(/Preview\/Preprod/i);
  });

  test('refuses unknown / non-testnet hosts (allowlist)', () => {
    clearCi();
    delete process.env.LUCEM_ALLOW_MAINNET_INTEGRATION;
    expect(() =>
      assertTestnetOnly('https://evil.example/api', 'addr_test1abc')
    ).toThrow(/Preview\/Preprod/i);
  });

  test('refuses mainnet (addr1...) sender addresses', () => {
    clearCi();
    delete process.env.LUCEM_ALLOW_MAINNET_INTEGRATION;
    expect(() =>
      assertTestnetOnly('https://preview.koios.rest/api/v1', 'addr1qxyz')
    ).toThrow(/non-testnet address/i);
  });

  test('refuses Blockfrost mainnet project ids', () => {
    clearCi();
    delete process.env.LUCEM_ALLOW_MAINNET_INTEGRATION;
    expect(() =>
      assertTestnetOnly(
        'https://cardano-preview.blockfrost.io/api/v0',
        'addr_test1abc',
        { providerType: PROVIDER.blockfrost, apiKey: 'mainnetSecretKey' }
      )
    ).toThrow(/mainnet project id/i);
  });

  test('refuses mismatched Blockfrost network prefix', () => {
    clearCi();
    delete process.env.LUCEM_ALLOW_MAINNET_INTEGRATION;
    expect(() =>
      assertTestnetOnly(
        'https://cardano-preview.blockfrost.io/api/v0',
        'addr_test1abc',
        { providerType: PROVIDER.blockfrost, apiKey: 'preprodSecretKey' }
      )
    ).toThrow(/must start with "preview"/i);
  });

  test('local LUCEM_ALLOW_MAINNET_INTEGRATION=1 overrides outside CI', () => {
    clearCi();
    process.env.LUCEM_ALLOW_MAINNET_INTEGRATION = '1';
    expect(() =>
      assertTestnetOnly('https://api.koios.rest/api/v1', 'addr1qxyz')
    ).not.toThrow();
  });

  test('CI ignores LUCEM_ALLOW_MAINNET_INTEGRATION override', () => {
    process.env.CI = 'true';
    process.env.LUCEM_ALLOW_MAINNET_INTEGRATION = '1';
    expect(() =>
      assertTestnetOnly('https://api.koios.rest/api/v1', 'addr1qxyz')
    ).toThrow(/Preview\/Preprod/i);
  });
});
