/**
 * Account map keys from Object.keys are always strings, while native
 * `account.index` is a number and HW indexes are strings. Storage may hold
 * either shape after switchAccount — compare as strings so any of N accounts
 * can highlight as selected.
 */
export const isSameAccountIndex = (a, b) =>
  a != null && b != null && String(a) === String(b);

/**
 * Other wallets already imported in Lucem, excluding the account that is
 * sending. Used on Send so the user can pick a recipient without pasting.
 * @param {Record<string, any>|any[]|null|undefined} accounts
 * @param {string|number|null|undefined} currentIndex
 * @returns {Array<{ index: string|number, name?: string, paymentAddr: string, avatar?: string }>}
 */
export const otherLoadedAccounts = (accounts, currentIndex) => {
  if (!accounts || typeof accounts !== 'object' || Array.isArray(accounts)) {
    return [];
  }
  return Object.keys(accounts)
    .filter((key) => !isSameAccountIndex(key, currentIndex))
    .map((key) => {
      const row = accounts[key];
      if (!row || !row.paymentAddr) return null;
      return {
        ...row,
        index: row.index != null ? row.index : key,
      };
    })
    .filter(Boolean);
};
