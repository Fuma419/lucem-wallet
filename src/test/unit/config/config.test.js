const {
  STORAGE,
  NETWORK_ID,
  NODE,
  ERROR,
  APIError,
  DataSignError,
  TxSendError,
  TxSignError,
  POPUP_WINDOW,
  TARGET,
  SENDER,
  EVENT,
} = require('../../../config/config');

describe('STORAGE keys', () => {
  test('has all required keys', () => {
    expect(STORAGE.encryptedKey).toBe('encryptedKey');
    expect(STORAGE.accounts).toBe('accounts');
    expect(STORAGE.currentAccount).toBe('currentAccount');
    expect(STORAGE.network).toBe('network');
    expect(STORAGE.currency).toBe('currency');
    expect(STORAGE.whitelisted).toBe('whitelisted');
    expect(STORAGE.migration).toBe('migration');
  });
});

describe('NETWORK_ID', () => {
  test('has all supported networks', () => {
    expect(NETWORK_ID.mainnet).toBe('mainnet');
    expect(NETWORK_ID.testnet).toBe('testnet');
    expect(NETWORK_ID.preview).toBe('preview');
    expect(NETWORK_ID.preprod).toBe('preprod');
  });
});

describe('NODE URLs', () => {
  test('mainnet uses koios rest API', () => {
    expect(NODE.mainnet).toContain('api.koios.rest');
  });
  test('preprod uses preprod koios', () => {
    expect(NODE.preprod).toContain('preprod.koios.rest');
  });
  test('preview uses preview koios', () => {
    expect(NODE.preview).toContain('preview.koios.rest');
  });
});

describe('ERROR constants', () => {
  test('wrongPassword is defined', () => {
    expect(ERROR.wrongPassword).toBeDefined();
  });
  test('onlyOneAccount is defined', () => {
    expect(ERROR.onlyOneAccount).toBeDefined();
  });
});

describe('CIP-30 error types', () => {
  test('APIError has required codes', () => {
    expect(APIError.InvalidRequest).toBeDefined();
    expect(APIError.InternalError).toBeDefined();
    expect(APIError.Refused).toBeDefined();
  });
  test('DataSignError has required codes', () => {
    expect(DataSignError.ProofGeneration).toBeDefined();
    expect(DataSignError.InvalidFormat).toBeDefined();
    expect(DataSignError.AddressNotPK).toBeDefined();
  });
  test('TxSendError has required codes', () => {
    expect(TxSendError.Refused).toBeDefined();
    expect(TxSendError.Failure).toBeDefined();
  });
  test('TxSignError has required codes', () => {
    expect(TxSignError.ProofGeneration).toBeDefined();
    expect(TxSignError.UserDeclined).toBeDefined();
  });
});

describe('POPUP_WINDOW', () => {
  test('has valid dimensions', () => {
    expect(POPUP_WINDOW.width).toBeGreaterThan(0);
    expect(POPUP_WINDOW.height).toBeGreaterThan(0);
  });
});

describe('messaging constants', () => {
  test('TARGET and SENDER are defined', () => {
    expect(TARGET).toBeDefined();
    expect(SENDER.extension).toBeDefined();
    expect(SENDER.webpage).toBeDefined();
  });
  test('EVENT types are defined', () => {
    expect(EVENT.networkChange).toBeDefined();
    expect(EVENT.accountChange).toBeDefined();
    expect(EVENT.connect).toBe('connect');
    expect(EVENT.disconnect).toBe('disconnect');
    expect(EVENT.utxoChange).toBe('utxoChange');
  });
});
