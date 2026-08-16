/**
 * @jest-environment node
 */

const {
  displayTokenAmount,
  formatUtxoBalanceInsufficient,
  resolveTokenSendQuantity,
  tokenDecimals,
} = require('../../../api/token-amount');

describe('tokenDecimals', () => {
  test('defaults to 0 when metadata is missing', () => {
    expect(tokenDecimals(null)).toBe(0);
    expect(tokenDecimals({})).toBe(0);
    expect(tokenDecimals({ decimals: '' })).toBe(0);
  });

  test('uses the registry decimal count', () => {
    expect(tokenDecimals({ decimals: 6 })).toBe(6);
  });
});

describe('resolveTokenSendQuantity', () => {
  test('converts display 1 at 0 decimals to 1 base unit', () => {
    expect(resolveTokenSendQuantity('1', 0, '1')).toEqual({ quantity: '1' });
  });

  test('treats typed 1 of a 1-qty token as 1 base unit, not 10^decimals', () => {
    expect(resolveTokenSendQuantity('1', 6, '1')).toEqual({ quantity: '1' });
    expect(resolveTokenSendQuantity('1.000000', 6, '1')).toEqual({
      quantity: '1',
    });
  });

  test('rejects a true overspend when more than 1 unit is held', () => {
    expect(resolveTokenSendQuantity('1', 6, '500')).toEqual({
      error:
        'Token amount is larger than this wallet holds. Check the amount and token decimals.',
    });
  });

  test('accepts 1 base unit displayed at 6 decimals', () => {
    expect(resolveTokenSendQuantity('0.000001', 6, '1')).toEqual({
      quantity: '1',
    });
  });

  test('requires a quantity', () => {
    expect(resolveTokenSendQuantity('', 0, '10')).toEqual({
      error: 'Asset quantity not set',
    });
  });
});

describe('displayTokenAmount', () => {
  test('formats 1 base unit at 6 decimals without scientific notation', () => {
    expect(displayTokenAmount('1', 6)).toBe('0.000001');
    expect(displayTokenAmount('1', 0)).toBe('1');
  });
});

describe('formatUtxoBalanceInsufficient', () => {
  test('rewrites the CSL coin-selection error', () => {
    expect(formatUtxoBalanceInsufficient('UTxO Balance Insufficient')).toMatch(
      /selected token/
    );
  });

  test('leaves other messages alone', () => {
    expect(formatUtxoBalanceInsufficient('Asset quantity not set')).toBe(
      'Asset quantity not set'
    );
  });
});
