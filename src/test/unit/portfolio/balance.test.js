const {
  PLACEHOLDER_CHAINS,
  assemblePortfolio,
  cardanoAdaPosition,
  disconnectedPosition,
  fiatCentsForPosition,
} = require('../../../portfolio/balance');

describe('portfolio balance', () => {
  test('Cardano live position contributes fiat; disconnected chains do not', () => {
    const cardano = cardanoAdaPosition({
      quantityAtomic: '5000000',
      fiatPrice: 0.5,
      symbol: '₳',
    });
    expect(cardano.status).toBe('live');
    expect(cardano.chainId).toBe('cardano');
    expect(fiatCentsForPosition(cardano)).toBe(250);

    const portfolio = assemblePortfolio({ cardano });
    expect(portfolio.positions.map((p) => p.chainId)).toEqual([
      'cardano',
      'bitcoin',
      'solana',
    ]);
    expect(portfolio.positions.filter((p) => p.status === 'disconnected')).toHaveLength(
      2
    );
    expect(portfolio.fiatCents).toBe(250);
  });

  test('disconnected placeholders never add fiat', () => {
    expect(
      fiatCentsForPosition(
        disconnectedPosition(PLACEHOLDER_CHAINS[0])
      )
    ).toBe(0);
  });

  test('a second live chain would add into the same fiat total', () => {
    const cardano = cardanoAdaPosition({
      quantityAtomic: '1000000',
      fiatPrice: 1,
    });
    const bitcoin = {
      chainId: 'bitcoin',
      assetId: 'btc',
      label: 'Bitcoin',
      symbol: 'BTC',
      quantityAtomic: '100000000',
      decimals: 8,
      fiatPrice: 100,
      status: 'live',
    };
    expect(fiatCentsForPosition(cardano) + fiatCentsForPosition(bitcoin)).toBe(
      100 + 10000
    );
  });
});
