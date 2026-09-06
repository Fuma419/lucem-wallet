/**
 * dApp origin authorization allowlist.
 *
 * The single source of truth for which dApp origins the user has approved via
 * the CIP-30 `enable()` handshake. This is the trust anchor the background's
 * `requireWhitelist` gate and the content-script proxy both consult before any
 * privileged wallet method runs, so it lives in its own small, directly
 * testable module rather than buried in the 4k-line `api/extension/index.js`.
 *
 * Storage-only: depends on the platform adapter and the `STORAGE` key, with no
 * dependency back on `index.js`, so it can be imported anywhere without risking
 * an import cycle. `index.js` re-exports these names to preserve its public API.
 *
 * CIP-30 sessions are also bound to the account that was selected at `enable()`
 * (Eternl-style). Reads and signing then use that account even if the user
 * later switches in the popup.
 */
import { STORAGE } from '../../config/config';
import {
  getCurrentAccountIndex,
  getStorage,
  setStorage,
} from './storage';

export const getWhitelisted = async () => {
  const result = await getStorage(STORAGE.whitelisted);
  return result ? result : [];
};

export const isWhitelisted = async (_origin) => {
  const whitelisted = await getWhitelisted();
  let access = false;
  if (whitelisted.includes(_origin)) access = true;
  return access;
};

const readDappAccounts = async () => {
  const stored = await getStorage(STORAGE.dappAccounts);
  return stored && typeof stored === 'object' ? stored : {};
};

/**
 * Account storage index this origin was connected with, or `null` if unbound
 * (legacy whitelist entries from before session binding).
 */
export const getDappAccountIndex = async (origin) => {
  if (!origin) return null;
  const dappAccounts = await readDappAccounts();
  if (!Object.prototype.hasOwnProperty.call(dappAccounts, origin)) {
    return null;
  }
  const value = dappAccounts[origin];
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return value;
};

export const setWhitelisted = async (origin, accountIndex) => {
  const whitelisted = await getWhitelisted();
  if (!whitelisted.includes(origin)) {
    whitelisted.push(origin);
  }
  const dappAccounts = { ...(await readDappAccounts()) };
  const index =
    accountIndex !== undefined && accountIndex !== null && accountIndex !== ''
      ? accountIndex
      : await getCurrentAccountIndex();
  dappAccounts[origin] = index;
  return setStorage({
    [STORAGE.whitelisted]: whitelisted,
    [STORAGE.dappAccounts]: dappAccounts,
  });
};

export const removeWhitelisted = async (origin) => {
  const whitelisted = await getWhitelisted();
  const index = whitelisted.indexOf(origin);
  if (index >= 0) whitelisted.splice(index, 1);
  const dappAccounts = { ...(await readDappAccounts()) };
  delete dappAccounts[origin];
  return setStorage({
    [STORAGE.whitelisted]: whitelisted,
    [STORAGE.dappAccounts]: dappAccounts,
  });
};

/**
 * First CIP-30 `enable()` after a legacy whitelist grant: snapshot the
 * currently selected account so later switches do not mix UTxOs/keys.
 */
export const bindCip30AccountIfUnbound = async (origin) => {
  const existing = await getDappAccountIndex(origin);
  if (existing == null) {
    await setWhitelisted(origin);
  }
};
