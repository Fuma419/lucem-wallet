import {
  deriveExternalPaymentFromAccountPublicKey,
  getExternalIndices,
  isMultiAddressEnabled,
  listEnabledPaymentAddresses,
  MAX_EXTERNAL_ADDRESS_INDEX,
  normalizeExternalIndices,
} from '../../../api/extension/multi-address';

describe('multi-address helpers', () => {
  test('getExternalIndices defaults to [0] for missing/legacy accounts', () => {
    expect(getExternalIndices(undefined)).toEqual([0]);
    expect(getExternalIndices({})).toEqual([0]);
    expect(getExternalIndices({ externalIndices: null })).toEqual([0]);
  });

  test('getExternalIndices always includes 0, sorts, and caps', () => {
    expect(getExternalIndices({ externalIndices: [3, 1, 0, 1] })).toEqual([
      0, 1, 3,
    ]);
    expect(
      getExternalIndices({
        externalIndices: [-1, 2, MAX_EXTERNAL_ADDRESS_INDEX + 5, 'x'],
      })
    ).toEqual([0, 2]);
  });

  test('isMultiAddressEnabled is true only when extras exist', () => {
    expect(isMultiAddressEnabled({ externalIndices: [0] })).toBe(false);
    expect(isMultiAddressEnabled({ externalIndices: [0, 1] })).toBe(true);
  });

  test('normalizeExternalIndices always keeps 0 and unique sorted', () => {
    expect(normalizeExternalIndices([])).toEqual([0]);
    expect(normalizeExternalIndices([5, 2, 2, 0])).toEqual([0, 2, 5]);
    expect(normalizeExternalIndices([99, -3])).toEqual([0]);
  });

  test('listEnabledPaymentAddresses uses cached index 0 fields', () => {
    const Cardano = {};
    const account = {
      paymentAddr: 'addr_test1_primary',
      paymentKeyHash: 'pkh0',
      paymentKeyHashBech32: 'addr_vkh0',
      externalIndices: [0],
      publicKey: 'unused',
    };
    expect(listEnabledPaymentAddresses(Cardano, account, 0)).toEqual([
      {
        index: 0,
        paymentAddr: 'addr_test1_primary',
        paymentKeyHash: 'pkh0',
        paymentKeyHashBech32: 'addr_vkh0',
      },
    ]);
  });

  test('listEnabledPaymentAddresses derives extras when publicKey present', () => {
    const hash0 = {
      to_bytes: () => Buffer.from('aa', 'hex'),
      to_bech32: () => 'addr_vkh_0',
    };
    const hash1 = {
      to_bytes: () => Buffer.from('bb', 'hex'),
      to_bech32: () => 'addr_vkh_1',
    };
    const stakeHash = {
      to_bytes: () => Buffer.from('cc', 'hex'),
    };
    const paymentChain = {
      derive: (idx) => ({
        to_raw_key: () => ({
          hash: () => (idx === 0 ? hash0 : hash1),
        }),
      }),
    };
    const stakeChain = {
      derive: () => ({
        to_raw_key: () => ({ hash: () => stakeHash }),
      }),
    };
    const accountPub = {
      derive: (role) => (role === 0 ? paymentChain : stakeChain),
    };
    const Cardano = {
      Bip32PublicKey: {
        from_hex: () => accountPub,
      },
      Credential: {
        from_keyhash: (h) => h,
      },
      BaseAddress: {
        new: () => ({
          to_address: () => ({
            to_bech32: () => 'addr_test1_derived_1',
          }),
        }),
      },
    };

    const account = {
      paymentAddr: 'addr_test1_primary',
      paymentKeyHash: 'aa',
      paymentKeyHashBech32: 'addr_vkh_0',
      publicKey: 'pubhex',
      externalIndices: [0, 1],
    };

    const rows = listEnabledPaymentAddresses(Cardano, account, 0);
    expect(rows).toHaveLength(2);
    expect(rows[0].paymentAddr).toBe('addr_test1_primary');
    expect(rows[1]).toMatchObject({
      index: 1,
      paymentAddr: 'addr_test1_derived_1',
      paymentKeyHash: 'bb',
    });
  });

  test('deriveExternalPaymentFromAccountPublicKey returns index fields', () => {
    const paymentHash = {
      to_bytes: () => Buffer.from('11', 'hex'),
      to_bech32: () => 'addr_vkh_x',
    };
    const stakeHash = { to_bytes: () => Buffer.from('22', 'hex') };
    const Cardano = {
      Bip32PublicKey: {
        from_hex: () => ({
          derive: (role) => ({
            derive: () => ({
              to_raw_key: () => ({
                hash: () => (role === 0 ? paymentHash : stakeHash),
              }),
            }),
          }),
        }),
      },
      Credential: { from_keyhash: (h) => h },
      BaseAddress: {
        new: () => ({
          to_address: () => ({ to_bech32: () => 'addr_test1_x' }),
        }),
      },
    };

    expect(
      deriveExternalPaymentFromAccountPublicKey(Cardano, 'pk', 0, 3)
    ).toEqual({
      index: 3,
      paymentAddr: 'addr_test1_x',
      paymentKeyHash: '11',
      paymentKeyHashBech32: 'addr_vkh_x',
    });
  });
});
