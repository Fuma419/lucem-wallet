/**
 * @jest-environment node
 *
 * Regression: delegation failed with "No spendable ADA in this account" on
 * wallets whose ADA sat on a CIP-1852 change/receive index that discovery had
 * not enabled yet (common after restoring a seed from another wallet).
 *
 * `getBalance` aggregates the whole stake set, so the home screen showed the
 * ADA, but `getUtxos` filtered the spendable set down to enabled addresses and
 * only rescued UTxOs that carried native tokens. ADA-only UTxOs were dropped,
 * leaving the tx builders with nothing to select from.
 *
 * Derivation here is real CSL, so the address matching is genuine.
 */
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');

const mockKoiosRequest = jest.fn();
jest.mock('../../../api/util', () => {
  const actual = jest.requireActual('../../../api/util');
  return { ...actual, koiosRequest: (...args) => mockKoiosRequest(...args) };
});

jest.mock('../../../api/loader', () => ({
  __esModule: true,
  default: { load: jest.fn().mockResolvedValue(undefined), Cardano: null },
}));

const mockGetCurrentAccount = jest.fn();
const mockGetStorage = jest.fn();
const mockSetStorage = jest.fn();
jest.mock('../../../api/extension/storage', () => ({
  __esModule: true,
  getCurrentAccount: (...args) => mockGetCurrentAccount(...args),
  getCurrentAccountIndex: jest.fn().mockResolvedValue('0'),
  getNetwork: jest.fn().mockResolvedValue({ id: 'preprod' }),
  getStorage: (...args) => mockGetStorage(...args),
  setStorage: (...args) => mockSetStorage(...args),
}));

const mockGetEnabledPaymentAddresses = jest.fn();
const mockGetRewardAddress = jest.fn();
jest.mock('../../../api/extension/addresses', () => ({
  __esModule: true,
  activateDiscoveredExternalAddresses: jest.fn(),
  getAddress: jest.fn(),
  getEnabledPaymentAddresses: (...args) => mockGetEnabledPaymentAddresses(...args),
  getRewardAddress: (...args) => mockGetRewardAddress(...args),
}));

const Loader = require('../../../api/loader').default;
const { getUtxos } = require('../../../api/extension/chain-reads');
const {
  ADDRESS_ROLE,
  derivePaymentFromAccountPublicKey,
} = require('../../../api/extension/multi-address');

const NETWORK_ID_NUMBER = 0; // preprod / testnet

/** Deterministic CIP-1852 account key so derived addresses are stable. */
function accountKeys() {
  const entropy = Buffer.alloc(32, 0x42);
  const accountPrv = CSL.Bip32PrivateKey.from_bip39_entropy(entropy, Buffer.alloc(0))
    .derive(1852 + 0x80000000)
    .derive(1815 + 0x80000000)
    .derive(0x80000000);
  const publicKey = accountPrv.to_public().as_bytes();
  const publicKeyHex = Buffer.from(publicKey).toString('hex');

  const external0 = derivePaymentFromAccountPublicKey(
    CSL,
    publicKeyHex,
    NETWORK_ID_NUMBER,
    ADDRESS_ROLE.external,
    0
  );
  const internal0 = derivePaymentFromAccountPublicKey(
    CSL,
    publicKeyHex,
    NETWORK_ID_NUMBER,
    ADDRESS_ROLE.internal,
    0
  );
  return { publicKeyHex, external0, internal0 };
}

const { publicKeyHex, external0, internal0 } = accountKeys();

const REWARD_ADDR =
  'stake_test1uqevw2xnsc0pvn9t9r9c7qdfz7rtvyqmhmvhpjq6z3rzhssqvhqvh';

/** One Koios `/account_utxos` row (`_extended: true`). */
const utxoRow = (address, { assets = [] } = {}) => ({
  tx_hash: 'ab'.repeat(32),
  tx_index: 0,
  address,
  value: '25000000',
  asset_list: assets,
});

describe('getUtxos keeps ADA on undiscovered change/receive addresses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Loader.Cardano = CSL;
    Loader.load = jest.fn().mockResolvedValue(undefined);

    // Discovery has only ever enabled external index 0.
    mockGetCurrentAccount.mockResolvedValue({
      paymentAddr: external0.paymentAddr,
      paymentKeyHash: external0.paymentKeyHash,
      publicKey: publicKeyHex,
      rewardAddr: REWARD_ADDR,
      externalIndices: [0],
      internalIndices: [],
    });
    mockGetEnabledPaymentAddresses.mockResolvedValue([
      { role: 0, index: 0, ...external0 },
    ]);
    mockGetRewardAddress.mockResolvedValue(REWARD_ADDR);
    mockGetStorage.mockResolvedValue({ 0: { externalIndices: [0] } });
    mockSetStorage.mockResolvedValue(undefined);
  });

  test('ADA-only UTxO on a derivable change address stays spendable', async () => {
    mockKoiosRequest.mockResolvedValue([utxoRow(internal0.paymentAddr)]);

    const utxos = await getUtxos();

    expect(utxos).toHaveLength(1);
    expect(utxos[0].output().address().to_bech32()).toBe(internal0.paymentAddr);
  });

  test('activates the discovered change index for later reads', async () => {
    mockKoiosRequest.mockResolvedValue([utxoRow(internal0.paymentAddr)]);

    await getUtxos();

    const written = mockSetStorage.mock.calls.at(-1)?.[0];
    expect(written).toBeDefined();
    expect(Object.values(written)[0]['0'].internalIndices).toContain(0);
  });

  test('still keeps UTxOs on the enabled primary address', async () => {
    mockKoiosRequest.mockResolvedValue([utxoRow(external0.paymentAddr)]);

    await expect(getUtxos()).resolves.toHaveLength(1);
  });

  test('drops UTxOs under the stake key whose payment key is not ours', async () => {
    // Same stake credential, foreign payment credential — we cannot witness it.
    const foreign = CSL.BaseAddress.new(
      NETWORK_ID_NUMBER,
      CSL.Credential.from_keyhash(
        CSL.Ed25519KeyHash.from_bytes(Buffer.alloc(28, 0x99))
      ),
      CSL.Credential.from_keyhash(
        CSL.Ed25519KeyHash.from_bytes(Buffer.alloc(28, 0x77))
      )
    )
      .to_address()
      .to_bech32();

    mockKoiosRequest.mockResolvedValue([utxoRow(foreign)]);

    await expect(getUtxos()).resolves.toHaveLength(0);
  });
});
