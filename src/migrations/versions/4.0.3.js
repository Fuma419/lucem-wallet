import { getStorage, setStorage } from '../../api/extension';
import { NETWORK_ID, STORAGE } from '../../config/config';

/**
 * Force a stake-scoped balance/asset refresh. Prior builds could persist
 * primary-address-only lovelace/assets, and soft refresh skipped the refetch
 * when the tip hash was unchanged.
 */
const migration = {
  version: '4.0.3',
  up: async () => {
    const accounts = await getStorage(STORAGE.accounts);
    if (!accounts || typeof accounts !== 'object') return;
    for (const accountIndex of Object.keys(accounts)) {
      const account = accounts[accountIndex];
      if (!account || typeof account !== 'object') continue;
      for (const networkId of Object.values(NETWORK_ID)) {
        if (account[networkId] && typeof account[networkId] === 'object') {
          account[networkId].forceUpdate = true;
        }
      }
    }
    await setStorage({ [STORAGE.accounts]: accounts });
  },
  down: async () => {},
  info: [
    {
      title: 'Stake-controlled balance and assets',
      detail:
        'Wallet totals and spendable UTxOs now include every payment/change address under your stake key, including native assets.',
    },
  ],
  pwdRequired: false,
};

export default migration;
