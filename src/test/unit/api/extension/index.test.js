import {
  getStorage,
  encryptWithPassword,
  decryptWithPassword,
  createWallet,
  switchAccount,
  createAccount,
  setWhitelisted,
  getWhitelisted,
  getNetwork,
  setNetwork,
  getCurrentAccount,
  eraseLocalWalletData,
  initLocalWalletSecretIfAbsent,
} from '../../../../api/extension';
import Loader from '../../../../api/loader';
import { generateMnemonic } from 'bip39';
import { ERROR, NODE, STORAGE } from '../../../../config/config';

beforeAll(async () => {
  const seed =
    'midnight draft salt dirt woman tragic cause immense dad later jaguar finger nerve nerve sign job erase citizen cube neglect token bracket orient narrow';
  const name = 'Wallet 1';
  const password = 'password123';
  await Loader.load();
  await createWallet(name, seed, password);
});

test('storage initialized correctly', async () => {
  const store = await getStorage();
  expect(store).toHaveProperty(STORAGE.accounts);
  expect(store).toHaveProperty(STORAGE.currency);
  expect(store).toHaveProperty(STORAGE.encryptedKey);
  expect(store).toHaveProperty(STORAGE.currentAccount);
  expect(store).toHaveProperty(STORAGE.network);
  expect(Object.keys(store).length).toBe(5);
});

test('should have whitelist', async () => {
  await setWhitelisted('https://www.hodlerstaking.com/');
  const store = await getStorage();
  expect(store).toHaveProperty(STORAGE.whitelisted);
  const whitelisted = await getWhitelisted();
  expect(whitelisted).toEqual(['https://www.hodlerstaking.com/']);
  expect(Object.keys(store).length).toBe(6);
});

test('account structure is correct', async () => {
  const store = await getStorage();
  const account = store.accounts[store.currentAccount];
  expect(account).toHaveProperty('avatar');
  expect(account).toHaveProperty('name');
  expect(account).toHaveProperty('index');
  expect(account).toHaveProperty('paymentKeyHash');
  expect(account).toHaveProperty('stakeKeyHash');
  expect(account).toHaveProperty('mainnet');
  expect(account).toHaveProperty('testnet');
  expect(account.mainnet).toHaveProperty('lovelace');
  expect(account.mainnet).toHaveProperty('assets');
  expect(account.mainnet).toHaveProperty('history');
  expect(account.mainnet.history).toHaveProperty('confirmed');
  expect(account.mainnet.history).toHaveProperty('details');
});

test('current account should be 0', async () => {
  const currentAccount = await getStorage('currentAccount');
  expect(currentAccount).toBe(0);
});

test('current account should be 1', async () => {
  const name = 'Wallet 2';
  const password = 'password123';
  await createAccount(name, password);
  await switchAccount(1);
  const currentAccount = await getStorage('currentAccount');
  expect(currentAccount).toBe(1);
});

test('expect error because of wrong password', async () => {
  const name = 'Wallet 3';
  const password = 'password456';
  expect.assertions(1);
  try {
    const index = await createAccount(name, password);
    await switchAccount(index);
  } catch (e) {
    expect(e).toBe(ERROR.wrongPassword);
  }
});

test('expect mainnet', async () => {
  const network = await getNetwork();
  expect(network.id).toBe('mainnet');
});

test('expect testnet address', async () => {
  await setNetwork({ id: 'testnet', node: NODE.testnet });
  const account = await getCurrentAccount();
  expect(account.paymentAddr).toContain('addr_');
});

test('should encrypt/decrypt root key correctly', async () => {
  const rootKey = Loader.Cardano.Bip32PrivateKey.generate_ed25519_bip32();
  const password = 'test123';
  const rootKeyBytes = rootKey.to_raw_key().as_bytes();
  const encryptedKey = await encryptWithPassword(password, rootKeyBytes);
  expect(Buffer.from(rootKeyBytes, 'hex').toString('hex')).not.toBe(
    encryptedKey
  );
  const decryptedKey = await decryptWithPassword(password, encryptedKey);
  expect(Buffer.from(rootKeyBytes, 'hex').toString('hex')).toBe(decryptedKey);
});

describe('initLocalWalletSecretIfAbsent', () => {
  beforeEach(() => {
    global.chrome.storage.local.clear();
  });

  test('sets encryptedKey and defaults when absent', async () => {
    await initLocalWalletSecretIfAbsent('abcdefgh');
    expect(await getStorage(STORAGE.encryptedKey)).toBeDefined();
    expect(await getStorage(STORAGE.network)).toBeDefined();
    expect(await getStorage(STORAGE.currency)).toBe('usd');
  });

  test('second call leaves encryptedKey unchanged', async () => {
    await initLocalWalletSecretIfAbsent('abcdefgh');
    const first = await getStorage(STORAGE.encryptedKey);
    await initLocalWalletSecretIfAbsent('zzzzzzzz');
    expect(await getStorage(STORAGE.encryptedKey)).toBe(first);
  });
});

test('eraseLocalWalletData clears all local data', async () => {
  await eraseLocalWalletData();
  const store = await getStorage();
  expect(store).toEqual({});
});

test('createWallet with explicit accounts', async () => {
  await eraseLocalWalletData();
  const seed =
    'midnight draft salt dirt woman tragic cause immense dad later jaguar finger nerve nerve sign job erase citizen cube neglect token bracket orient narrow';
  const name = 'Wallet 1';
  const password = 'password123';
  const selected = await createWallet(name, seed, password, [0, 2, 4]);
  const store = await getStorage();
  expect(Object.keys(store.accounts).length).toBe(3);
  expect(store.accounts[0].name).toBe('Wallet 1');
  expect(store.accounts[2].name).toBe('Account 2');
  expect(store.accounts[4].name).toBe('Account 4');
  // Primary new account (first explicit index) must become the selection.
  expect(selected).toBe(0);
  expect(store.currentAccount).toBe(0);
});

test('createWallet rejects a seed that is already imported', async () => {
  await eraseLocalWalletData();
  const seed =
    'midnight draft salt dirt woman tragic cause immense dad later jaguar finger nerve nerve sign job erase citizen cube neglect token bracket orient narrow';
  const password = 'password123';
  await createWallet('Wallet 1', seed, password, [0]);
  await expect(
    createWallet('Wallet 1 again', seed, password, [0])
  ).rejects.toThrow(/already imported/i);
  // Existing wallet must remain intact (no wipe on duplicate).
  const store = await getStorage();
  expect(store.accounts[0].name).toBe('Wallet 1');
  expect(store.encryptedKey).toBeDefined();
});

test('createAccount rejects a duplicate account index', async () => {
  await eraseLocalWalletData();
  const seed =
    'midnight draft salt dirt woman tragic cause immense dad later jaguar finger nerve nerve sign job erase citizen cube neglect token bracket orient narrow';
  const password = 'password123';
  await createWallet('Wallet 1', seed, password, [0]);
  await expect(createAccount('Dup', password, 0)).rejects.toThrow(
    /already/i
  );
});

test('importing a second seed keeps the first wallet and stores both', async () => {
  await eraseLocalWalletData();
  const seedA =
    'midnight draft salt dirt woman tragic cause immense dad later jaguar finger nerve nerve sign job erase citizen cube neglect token bracket orient narrow';
  const seedB = generateMnemonic(); // distinct, valid 12-word phrase
  const password = 'password123';

  const firstSlot = await createWallet('Wallet A', seedA, password, [0]);
  const secondSlot = await createWallet('Wallet B', seedB, password, [0]);

  const store = await getStorage();

  // Both wallets survive — the second import no longer wipes the first.
  const names = Object.values(store.accounts).map((a) => a.name);
  expect(names).toContain('Wallet A');
  expect(names).toContain('Wallet B');
  expect(Object.keys(store.accounts).length).toBe(2);

  // Distinct slots and a materialized multi-seed key map.
  expect(String(firstSlot)).not.toBe(String(secondSlot));
  expect(store.encryptedKeys).toBeDefined();
  expect(store.encryptedKeys['0']).toBeDefined();
  expect(store.encryptedKeys['1']).toBeDefined();

  // Second wallet's account references its own seed via walletId.
  const second = store.accounts[secondSlot];
  expect(second.walletId).toBe('1');
  expect(store.currentAccount).toEqual(secondSlot);
});

test('adding a wallet with the wrong vault password is rejected', async () => {
  await eraseLocalWalletData();
  const seedA =
    'midnight draft salt dirt woman tragic cause immense dad later jaguar finger nerve nerve sign job erase citizen cube neglect token bracket orient narrow';
  const seedB = generateMnemonic();
  await createWallet('Wallet A', seedA, 'password123', [0]);
  await expect(
    createWallet('Wallet B', seedB, 'wrong-password', [0])
  ).rejects.toThrow(/password/i);
  // First wallet remains intact.
  const store = await getStorage();
  expect(Object.keys(store.accounts).length).toBe(1);
});
