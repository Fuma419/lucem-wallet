const {
  asHexString,
  asLovelace,
  asNetworkKey,
  asSlot,
} = require('../../../api/types');

describe('branded money-path types', () => {
  test('asLovelace accepts digit strings and rejects junk', () => {
    expect(asLovelace('1500000')).toBe('1500000');
    expect(asLovelace(2_000_000)).toBe('2000000');
    expect(asLovelace(3n)).toBe('3');
    expect(() => asLovelace('1.5')).toThrow(/Invalid lovelace/);
    expect(() => asLovelace('abc')).toThrow(/Invalid lovelace/);
  });

  test('asSlot accepts non-negative integers only', () => {
    expect(asSlot(0)).toBe(0);
    expect(asSlot(50_000_000)).toBe(50_000_000);
    expect(() => asSlot(-1)).toThrow(/Invalid slot/);
    expect(() => asSlot(1.5)).toThrow(/Invalid slot/);
  });

  test('asHexString requires even-length hex', () => {
    expect(asHexString('aa'.repeat(28))).toHaveLength(56);
    expect(() => asHexString('xyz')).toThrow(/Invalid hex/);
    expect(() => asHexString('abc')).toThrow(/Invalid hex/);
  });

  test('asNetworkKey falls back to mainnet', () => {
    expect(asNetworkKey('preview')).toBe('preview');
    expect(asNetworkKey('midnight')).toBe('mainnet');
    expect(asNetworkKey(null)).toBe('mainnet');
  });
});
