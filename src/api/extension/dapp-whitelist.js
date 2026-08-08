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
 */
import platform from '../../platform';
import { STORAGE } from '../../config/config';

const getStorage = (key) => platform.storage.get(key);
const setStorage = (item) => platform.storage.set(item);

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

export const setWhitelisted = async (origin) => {
  let whitelisted = await getWhitelisted();
  whitelisted ? whitelisted.push(origin) : (whitelisted = [origin]);
  return await setStorage({ [STORAGE.whitelisted]: whitelisted });
};

export const removeWhitelisted = async (origin) => {
  const whitelisted = await getWhitelisted();
  const index = whitelisted.indexOf(origin);
  whitelisted.splice(index, 1);
  return await setStorage({ [STORAGE.whitelisted]: whitelisted });
};
