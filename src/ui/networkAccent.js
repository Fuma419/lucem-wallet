/**
 * Cardano network → Lucem chrome accent (same mapping as the Magic
 * Delegation Portal chips: mainnet lime, preprod cyan, preview magenta).
 */
export const NETWORK_ACCENT = {
  mainnet: 'lime',
  preprod: 'cyan',
  preview: 'magenta',
  testnet: 'magenta',
};

export const syncNetworkAccentDom = (networkId) => {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const id = String(networkId || 'mainnet');
  document.documentElement.setAttribute('data-network', id);
};
