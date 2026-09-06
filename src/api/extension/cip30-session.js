/**
 * CIP-30 dApp session → wallet account.
 *
 * `enable()` stores the selected account index per origin. Privileged CIP-30
 * methods (balance, UTxOs, addresses, sign) must use that account, not
 * whatever is currently selected in the extension popup.
 */
import { getDappAccountIndex } from './dapp-whitelist';
import { getAccountByIndex } from './storage';

export const resolveCip30Account = async (origin) => {
  const index = await getDappAccountIndex(origin);
  return getAccountByIndex(index);
};
