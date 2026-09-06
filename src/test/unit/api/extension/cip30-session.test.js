import { NETWORK_ID, STORAGE } from '../../../../config/config';
import { resolveCip30Account } from '../../../../api/extension/cip30-session';
import { setWhitelisted } from '../../../../api/extension/dapp-whitelist';

const netSlice = (paymentAddr, rewardAddr) => ({
  paymentAddr,
  rewardAddr,
  lovelace: 0,
  assets: [],
  minAda: 0,
  collateral: null,
  history: { confirmed: [], details: {} },
  recentSendToAddresses: [],
});

const accountRow = (index, name) => ({
  index,
  name,
  paymentKeyHash: 'aa',
  [NETWORK_ID.mainnet]: netSlice(`addr_m_${index}`, `stake_m_${index}`),
  [NETWORK_ID.testnet]: netSlice(`addr_t_${index}`, `stake_t_${index}`),
  [NETWORK_ID.preview]: netSlice(`addr_v_${index}`, `stake_v_${index}`),
  [NETWORK_ID.preprod]: netSlice(`addr_p_${index}`, `stake_p_${index}`),
});

describe('resolveCip30Account', () => {
  beforeEach(() => {
    global.mockStore = {
      [STORAGE.currentAccount]: 0,
      [STORAGE.network]: { id: NETWORK_ID.preprod, node: 'https://preprod' },
      [STORAGE.accounts]: {
        0: accountRow(0, 'Account 0'),
        1: accountRow(1, 'Account 1'),
      },
    };
  });

  test('returns the account bound at enable, not the UI selection', async () => {
    await setWhitelisted('https://portal.example', 1);
    global.mockStore[STORAGE.currentAccount] = 0;
    const account = await resolveCip30Account('https://portal.example');
    expect(account.name).toBe('Account 1');
    expect(account.paymentAddr).toBe('addr_p_1');
  });

  test('falls back to the current account when the origin is unbound', async () => {
    global.mockStore[STORAGE.currentAccount] = 1;
    const account = await resolveCip30Account('https://unknown.example');
    expect(account.name).toBe('Account 1');
  });
});
