import { getStorage, setStorage } from '../../api/extension';
import { NETWORK_ID, STORAGE } from '../../config/config';

/**
 * Re-force stake-scoped balance refresh for clients that already applied 4.0.3
 * but kept primary-address totals because soft open cleared forceUpdate without
 * bypassing the balance cache / tip short-circuit.
 */
const migration = {
  version: '4.0.4',
  up: async () => {
    const accounts = await getStorage(STORAGE.accounts);
    if (!accounts || typeof accounts !== 'object') return;
    for (const accountIndex of Object.keys(accounts)) {
      const account = accounts[accountIndex];
      if (!account || typeof account !== 'object') continue;
      for (const networkId of Object.values(NETWORK_ID)) {
        if (account[networkId] && typeof account[networkId] === 'object') {
          account[networkId].forceUpdate = true;
          // Clear tip watermark so the next open cannot short-circuit.
          account[networkId].lastUpdate = null;
        }
      }
    }
    await setStorage({ [STORAGE.accounts]: accounts });
  },
  down: async () => {},
  info: [
    {
      title: 'Refresh stake-controlled balance',
      detail:
        'Forces a full balance refetch so totals match every address under your stake key.',
    },
  ],
  pwdRequired: false,
};

export default migration;
