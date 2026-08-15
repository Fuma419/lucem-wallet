/**
 * Platform storage accessors and network/account selectors.
 * Leaf module: no imports from other api/extension domain files.
 */
import { EVENT, NETWORK_ID, NODE, SENDER, STORAGE, TARGET } from '../../config/config';
import platform from '../../platform';
import { networkNameToId } from '../util';

const emitNetworkChange = async (networkId) => {
  platform.events.broadcastToTabs({
    data: networkId,
    target: TARGET,
    sender: SENDER.extension,
    event: EVENT.networkChange,
  });
};


export const getStorage = (key) => platform.storage.get(key);
export const setStorage = (item) => platform.storage.set(item);
export const removeStorage = (item) => platform.storage.remove(item);

export const getCurrentAccountIndex = () => getStorage(STORAGE.currentAccount);

export const getNetwork = () => getStorage(STORAGE.network);

export const setNetwork = async (network) => {
  const currentNetwork = await getNetwork();
  let id;
  let node;
  if (network.id === NETWORK_ID.mainnet) {
    id = NETWORK_ID.mainnet;
    node = NODE.mainnet;
  } else if (network.id === NETWORK_ID.testnet) {
    id = NETWORK_ID.testnet;
    node = NODE.testnet;
  } else if (network.id === NETWORK_ID.preview) {
    id = NETWORK_ID.preview;
    node = NODE.preview;
  } else {
    id = NETWORK_ID.preprod;
    node = NODE.preprod;
  }
  if (network.node) node = network.node;
  if (currentNetwork && currentNetwork.id !== id)
    emitNetworkChange(networkNameToId(id));
  await setStorage({
    [STORAGE.network]: {
      id,
      node,
      mainnetSubmit: network.mainnetSubmit,
      testnetSubmit: network.testnetSubmit,
    },
  });
  return true;
};

const accountToNetworkSpecific = (account, network) => {
  const assets = account[network.id].assets;
  const lovelace = account[network.id].lovelace;
  const history = account[network.id].history;
  const minAda = account[network.id].minAda;
  const collateral = account[network.id].collateral;
  const recentSendToAddresses = account[network.id].recentSendToAddresses;
  const paymentAddr = account[network.id].paymentAddr;
  const rewardAddr = account[network.id].rewardAddr;

  return {
    ...account,
    paymentAddr,
    rewardAddr,
    assets,
    lovelace,
    minAda,
    collateral,
    history,
    recentSendToAddresses,
  };
};

/** Returns account with network specific settings (e.g. address, reward address, etc.) */
export const getCurrentAccount = async () => {
  const currentAccountIndex = await getCurrentAccountIndex();
  const accounts = await getStorage(STORAGE.accounts);
  const network = await getNetwork();
  return accountToNetworkSpecific(accounts[currentAccountIndex], network);
};

/** True when encrypted storage has at least one account (wallet bootstrap / routing). */
export const hasStoredAccounts = async () => {
  const accounts = await getStorage(STORAGE.accounts);
  return (
    accounts != null &&
    typeof accounts === 'object' &&
    Object.keys(accounts).length > 0
  );
};

/** Returns accounts with network specific settings (e.g. address, reward address, etc.) */
export const getAccounts = async () => {
  const accounts = await getStorage(STORAGE.accounts);
  if (!accounts || typeof accounts !== 'object') {
    return {};
  }
  const network = await getNetwork();
  for (const index in accounts) {
    accounts[index] = await accountToNetworkSpecific(accounts[index], network);
  }
  return accounts;
};

