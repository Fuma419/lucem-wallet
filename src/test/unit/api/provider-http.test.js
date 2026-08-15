const {
  BLOCKFROST_BASE,
  isUsableKey,
  normalizeNetworkKey,
  resolveBlockfrostProjectId,
} = require('../../../api/provider-http');

describe('provider-http Blockfrost helpers', () => {
  const originalEnv = process.env.BLOCKFROST_PROJECT_ID_PREVIEW;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BLOCKFROST_PROJECT_ID_PREVIEW;
    } else {
      process.env.BLOCKFROST_PROJECT_ID_PREVIEW = originalEnv;
    }
  });

  test('normalizeNetworkKey only accepts known Cardano networks', () => {
    expect(normalizeNetworkKey({ id: 'preview' })).toBe('preview');
    expect(normalizeNetworkKey({ name: 'preprod' })).toBe('preprod');
    expect(normalizeNetworkKey({ id: 'midnight' })).toBe('mainnet');
    expect(BLOCKFROST_BASE.preview).toMatch(/cardano-preview/);
  });

  test('isUsableKey rejects placeholders', () => {
    expect(isUsableKey('your-blockfrost-project-id')).toBe(false);
    expect(isUsableKey('dummy')).toBe(false);
    expect(isUsableKey('  ')).toBe(false);
    expect(isUsableKey('previewABCDEF123')).toBe(true);
  });

  test('resolveBlockfrostProjectId prefers a matching env project id', () => {
    process.env.BLOCKFROST_PROJECT_ID_PREVIEW = 'preview_test_project_id';
    expect(resolveBlockfrostProjectId('preview')).toBe('preview_test_project_id');
  });
});
