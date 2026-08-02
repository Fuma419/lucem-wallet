import {
  MAX_COLLATERAL_AMOUNT,
  MAX_COLLATERAL_UTXO,
  isReservedCollateralPresent,
  parseCollateralAmount,
  selectCollateralCandidates,
  utxoOutputIndex,
} from '../../../../api/extension/collateral';

describe('utxoOutputIndex', () => {
  test('prefers output_index over tx_index', () => {
    expect(utxoOutputIndex({ output_index: 2, tx_index: 0 })).toBe(2);
  });

  test('falls back to tx_index (Koios address_info)', () => {
    expect(utxoOutputIndex({ tx_index: 1 })).toBe(1);
  });
});

describe('isReservedCollateralPresent', () => {
  const collateral = { txHash: 'aabb', txId: 0 };

  test('matches via tx_index when output_index is absent', () => {
    expect(
      isReservedCollateralPresent(
        [{ tx_hash: 'aabb', tx_index: 0 }],
        collateral
      )
    ).toBe(true);
  });

  test('returns false when UTxO is missing', () => {
    expect(
      isReservedCollateralPresent(
        [{ tx_hash: 'aabb', tx_index: 1 }],
        collateral
      )
    ).toBe(false);
  });

  test('returns false without reserved collateral', () => {
    expect(isReservedCollateralPresent([{ tx_hash: 'aabb', tx_index: 0 }])).toBe(
      false
    );
  });
});

describe('parseCollateralAmount', () => {
  const decodeCoin = (hex) => {
    // Minimal CBOR unsigned: 1a004c4b40 = 5_000_000
    if (hex.toLowerCase() === '1a004c4b40') return 5_000_000n;
    if (hex.toLowerCase() === '1a000f4240') return 1_000_000n;
    throw new Error('could not parse');
  };

  test('defaults to 5 ADA when amount omitted', () => {
    expect(parseCollateralAmount(undefined, { decodeCoin })).toBe(
      MAX_COLLATERAL_AMOUNT
    );
    expect(parseCollateralAmount(null, { decodeCoin })).toBe(
      MAX_COLLATERAL_AMOUNT
    );
  });

  test('accepts decimal lovelace string and number', () => {
    expect(parseCollateralAmount('2000000', { decodeCoin })).toBe(2_000_000n);
    expect(parseCollateralAmount(2000000, { decodeCoin })).toBe(2_000_000n);
  });

  test('accepts CBOR coin hex via decoder', () => {
    expect(parseCollateralAmount('1a000f4240', { decodeCoin })).toBe(
      1_000_000n
    );
  });

  test('rejects amounts above 5 ADA', () => {
    expect(() =>
      parseCollateralAmount('5000001', { decodeCoin })
    ).toThrow(/too big/);
  });

  test('rejects invalid amount shapes', () => {
    expect(() => parseCollateralAmount('not-hex', { decodeCoin })).toThrow();
    expect(() => parseCollateralAmount(1.5, { decodeCoin })).toThrow();
  });
});

describe('selectCollateralCandidates', () => {
  const mk = (coin, id, multiassetLen = 0) => ({
    coin,
    multiassetLen,
    utxo: { id },
  });

  test('selects smallest ADA-only UTxOs covering the target', () => {
    const selected = selectCollateralCandidates(
      [
        mk(4_000_000n, 'a'),
        mk(2_000_000n, 'b'),
        mk(3_000_000n, 'c'),
        mk(10_000_000n, 'd', 1),
      ],
      5_000_000n
    );
    expect(selected.map((u) => u.id)).toEqual(['b', 'c']);
  });

  test('skips oversized pure-ADA UTxOs', () => {
    const selected = selectCollateralCandidates(
      [mk(MAX_COLLATERAL_UTXO + 1n, 'too-big'), mk(5_000_000n, 'ok')],
      5_000_000n
    );
    expect(selected.map((u) => u.id)).toEqual(['ok']);
  });

  test('returns null when coverage is impossible', () => {
    expect(
      selectCollateralCandidates([mk(1_000_000n, 'a')], 5_000_000n)
    ).toBeNull();
  });
});
