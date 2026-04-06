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

  test('normalizeLovelaceScalar handles bigint', () => {
    expect(normalizeLovelaceScalar(12345n)).toBe('12345');
  });

  test('normalizeLovelaceScalar truncates finite numbers', () => {
    expect(normalizeLovelaceScalar(3.9)).toBe('3');
  });

  test('normalizeLovelaceScalar returns 0 for non-finite numbers', () => {
    expect(normalizeLovelaceScalar(Number.NaN)).toBe('0');
    expect(normalizeLovelaceScalar(Number.POSITIVE_INFINITY)).toBe('0');
  });

  test('bigIntLovelace returns 0n for non-digit strings', () => {
    expect(bigIntLovelace('12a')).toBe(0n);
    expect(bigIntLovelace('-5')).toBe(0n);
  });

  test('normalizeLovelaceScalar unwraps lovelace property', () => {
    expect(normalizeLovelaceScalar({ lovelace: '7' })).toBe('7');
  });

  test('normalizeLovelaceScalar uses to_str when present', () => {
    expect(
      normalizeLovelaceScalar({ to_str: () => '99' })
    ).toBe('99');
  });
});
