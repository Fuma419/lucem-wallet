/**
 * Source guards for the api/extension domain split.
 * index.js stays the public barrel; wallet.js must not import it.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../../');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('api/extension domain split', () => {
  test('index.js re-exports storage, keys, signing, addresses, and chain-reads', () => {
    const src = read('api/extension/index.js');
    expect(src).toMatch(/from '\.\/storage'/);
    expect(src).toMatch(/from '\.\/keys'/);
    expect(src).toMatch(/from '\.\/signing'/);
    expect(src).toMatch(/from '\.\/addresses'/);
    expect(src).toMatch(/from '\.\/chain-reads'/);
    expect(src).toMatch(/paymentKeyHashesForSigning/);
    expect(src).toMatch(/getEnabledPaymentAddressDetails/);
    expect(src).toMatch(/signTxHW/);
    expect(src).toMatch(/requestAccountKey/);
  });

  test('wallet.ts imports leaf modules instead of the index barrel', () => {
    const src = read('api/extension/wallet.ts');
    expect(src).toMatch(/from '\.\/storage'/);
    expect(src).toMatch(/from '\.\/chain-reads'/);
    expect(src).toMatch(/from '\.\/addresses'/);
    expect(src).toMatch(/from '\.\/signing'/);
    expect(src).not.toMatch(/from '\.'/);
  });

  test('addresses.js does not import chain-reads (no cycle)', () => {
    const src = read('api/extension/addresses.js');
    expect(src).not.toMatch(/from '\.\/chain-reads'/);
    expect(src).not.toMatch(/from '\.\/index'/);
  });

  test('chain-reads.js does not import index or wallet', () => {
    const src = read('api/extension/chain-reads.js');
    expect(src).not.toMatch(/from '\.\/index'/);
    expect(src).not.toMatch(/from '\.\/wallet'/);
  });

  test('chain-reads.js imports address-match helpers used by accounts display', () => {
    const src = read('api/extension/chain-reads.js');
    expect(src).toMatch(/matchExternalIndicesFromAddresses/);
    expect(src).toMatch(/matchInternalIndicesFromAddresses/);
    expect(src).toMatch(/invalidateAll as invalidateReadCache/);
    expect(src).toMatch(/ADDRESS_ROLE/);
  });

  test('signing.js imports networkNameToId for verifyTx', () => {
    const src = read('api/extension/signing.js');
    expect(src).toMatch(/networkNameToId/);
  });
});
