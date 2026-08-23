const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const { toCip30AddressHex } = require('../../../api/extension/cip30-address');

jest.mock('../../../api/loader', () => ({
  __esModule: true,
  default: {
    load: async () => {},
    Cardano: require('@emurgo/cardano-serialization-lib-nodejs'),
  },
}));

describe('CIP-30 address encoding', () => {
  const payment = CSL.EnterpriseAddress.new(
    1,
    CSL.Credential.from_keyhash(
      CSL.Ed25519KeyHash.from_bytes(Buffer.from('ab'.repeat(28), 'hex'))
    )
  )
    .to_address()
    .to_bech32();

  const stake = CSL.RewardAddress.new(
    1,
    CSL.Credential.from_keyhash(
      CSL.Ed25519KeyHash.from_bytes(Buffer.from('cd'.repeat(28), 'hex'))
    )
  )
    .to_address()
    .to_bech32();

  test('converts bech32 payment and stake addresses to Address CBOR hex', () => {
    const paymentHex = toCip30AddressHex(payment);
    const stakeHex = toCip30AddressHex(stake);
    expect(paymentHex).toMatch(/^[0-9a-f]+$/);
    expect(stakeHex).toMatch(/^[0-9a-f]+$/);
    expect(CSL.Address.from_bytes(Buffer.from(paymentHex, 'hex')).to_bech32()).toBe(
      payment
    );
    expect(CSL.Address.from_bytes(Buffer.from(stakeHex, 'hex')).to_bech32()).toBe(
      stake
    );
  });

  test('leaves mock / already-hex values unchanged', () => {
    expect(toCip30AddressHex('addr_used_hex')).toBe('addr_used_hex');
    expect(toCip30AddressHex('aa'.repeat(16))).toBe('aa'.repeat(16));
  });
});
