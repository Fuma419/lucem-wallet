const { isSameAccountIndex } = require('../../../ui/app/utils/accountIndex');

describe('isSameAccountIndex', () => {
  test('matches native indexes when storage holds a string key', () => {
    expect(isSameAccountIndex('0', 0)).toBe(true);
    expect(isSameAccountIndex('1', 1)).toBe(true);
    expect(isSameAccountIndex('19', 19)).toBe(true);
  });

  test('matches when both sides are numbers or both are strings', () => {
    expect(isSameAccountIndex(2, 2)).toBe(true);
    expect(isSameAccountIndex('2', '2')).toBe(true);
  });

  test('distinguishes different accounts across many indexes', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(isSameAccountIndex(String(i), i)).toBe(true);
      expect(isSameAccountIndex(String(i), i === 19 ? 0 : i + 1)).toBe(false);
    }
  });

  test('matches hardware wallet string indexes', () => {
    expect(isSameAccountIndex('ledger-0-0', 'ledger-0-0')).toBe(true);
    expect(isSameAccountIndex('ledger-0-0', 'ledger-0-1')).toBe(false);
  });

  test('rejects nullish values', () => {
    expect(isSameAccountIndex(null, 0)).toBe(false);
    expect(isSameAccountIndex(0, undefined)).toBe(false);
    expect(isSameAccountIndex(null, null)).toBe(false);
  });
});
