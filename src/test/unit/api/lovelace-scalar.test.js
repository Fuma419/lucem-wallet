const {
  normalizeLovelaceScalar,
  bigIntLovelace,
} = require('../../../api/lovelace-scalar');

describe('lovelace-scalar', () => {
  test('normalizeLovelaceScalar strips spaces and commas', () => {
    expect(normalizeLovelaceScalar(' 1,234,567 ')).toBe('1234567');
  });

  test('bigIntLovelace returns 0n for invalid objects', () => {
    expect(bigIntLovelace({})).toBe(0n);
    expect(bigIntLovelace({ foo: 1 })).toBe(0n);
  });

  test('bigIntLovelace reads nested quantity', () => {
    expect(bigIntLovelace({ quantity: '42' })).toBe(42n);
  });

  test('bigIntLovelace reads ada_lovelace from nested API shapes', () => {
    expect(bigIntLovelace({ ada_lovelace: '99' })).toBe(99n);
  });

  test('bigIntLovelace accepts string amounts', () => {
    expect(bigIntLovelace('5000000')).toBe(5000000n);
  });
});
