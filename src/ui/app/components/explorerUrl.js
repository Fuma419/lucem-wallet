export const NETWORK_EXPLORERS = {
  mainnet: 'https://cexplorer.io',
  preprod: 'https://preprod.cexplorer.io',
  preview: 'https://preview.cexplorer.io',
};

export function explorerAddressUrl(networkId, address) {
  const base = NETWORK_EXPLORERS[networkId] || NETWORK_EXPLORERS.mainnet;
  if (!address) return base;
  return `${base}/address/${address}`;
}
