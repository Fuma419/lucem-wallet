import Loader from '../loader';

/**
 * CIP-30 address values are hex-encoded Address CBOR, not bech32.
 * Mesh / Eternl / Lace speak hex; bech32 here breaks dApp change-address
 * and stake-certificate builders.
 * Unknown / already-hex strings are returned unchanged so mocks keep working.
 */
export const toCip30AddressHex = (address) => {
  if (typeof address !== 'string' || address.length === 0) {
    return address;
  }
  if (/^(addr|stake)/i.test(address)) {
    try {
      return Buffer.from(
        Loader.Cardano.Address.from_bech32(address).to_bytes()
      ).toString('hex');
    } catch (/** @type {any} */ _) {
      return address;
    }
  }
  return address;
};
