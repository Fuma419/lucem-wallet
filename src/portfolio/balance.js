/**
 * Multi-chain portfolio math. Isolated from Cardano tx/keys.
 * Other chains register here later; they must not import CSL or Koios.
 */

export const PLACEHOLDER_CHAINS = [
  {
    chainId: 'bitcoin',
    assetId: 'btc',
    label: 'Bitcoin',
    symbol: 'BTC',
    decimals: 8,
  },
  {
    chainId: 'solana',
    assetId: 'sol',
    label: 'Solana',
    symbol: 'SOL',
    decimals: 9,
  },
];

export const cardanoAdaPosition = ({
  quantityAtomic,
  fiatPrice,
  symbol = '₳',
}) => ({
  chainId: 'cardano',
  assetId: 'ada',
  label: 'Cardano',
  symbol,
  quantityAtomic: String(quantityAtomic ?? '0'),
  decimals: 6,
  fiatPrice: fiatPrice ?? 0,
  status: 'live',
});

export const disconnectedPosition = (chain) => ({
  ...chain,
  quantityAtomic: '0',
  fiatPrice: null,
  status: 'disconnected',
});

export const fiatCentsForPosition = (position) => {
  if (!position || position.status !== 'live') return 0;
  const price = Number(position.fiatPrice);
  if (!Number.isFinite(price) || price <= 0) return 0;
  const atomic = Number(position.quantityAtomic);
  if (!Number.isFinite(atomic) || atomic <= 0) return 0;
  const whole = atomic / 10 ** position.decimals;
  return Math.round(whole * price * 100);
};

export const assemblePortfolio = ({
  cardano,
  placeholders = PLACEHOLDER_CHAINS,
} = {}) => {
  const positions = [];
  if (cardano) positions.push(cardano);
  for (const chain of placeholders) {
    positions.push(disconnectedPosition(chain));
  }
  return {
    positions,
    fiatCents: positions.reduce(
      (sum, position) => sum + fiatCentsForPosition(position),
      0
    ),
  };
};
