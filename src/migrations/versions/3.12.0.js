import { NETWORK_ID, STORAGE } from '../../config/config';
import { getStorage, setStorage } from '../../api/extension/index';

const migration = {
  version: '3.12.0',
  up: async () => {
    const networkDefault = {
      lovelace: null,
      minAda: 0,
      assets: [],
      history: { confirmed: [], details: {} },
    };

    const storage = await getStorage(STORAGE.accounts);
    const accountIndexes = Object.keys(storage);

    for (let i = 0; i < accountIndexes.length; i++) {
      const account = storage[accountIndexes[i]];
      if (account[NETWORK_ID.midnight_preview]) continue;
      const preview = account[NETWORK_ID.preview];
      account[NETWORK_ID.midnight_preview] = {
        ...networkDefault,
        paymentAddr: preview?.paymentAddr || '',
        rewardAddr: preview?.rewardAddr || '',
      };
    }

    await setStorage({ [STORAGE.accounts]: storage });
  },
  down: async () => {
    const storage = await getStorage(STORAGE.accounts);
    const accountIndexes = Object.keys(storage);
    for (let i = 0; i < accountIndexes.length; i++) {
      delete storage[accountIndexes[i]][NETWORK_ID.midnight_preview];
    }
    await setStorage({ [STORAGE.accounts]: storage });
  },
  info: [
    {
      title: 'Midnight Preview network',
      detail:
        'Adds Midnight Preview (test developer chain) to the network switcher. Cardano send/stake flows stay disabled there until Midnight wallet support lands.',
    },
  ],
  pwdRequired: false,
};

export default migration;
