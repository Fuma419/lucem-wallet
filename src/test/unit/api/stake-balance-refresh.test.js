/**
 * Source guards: account.forceUpdate must force a fresh balance fetch, not only
 * bypass the tip short-circuit.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('stake balance refresh guards', () => {
  test('updateAccount passes accountForceUpdate into updateBalance', () => {
    const src = read('api/extension/index.js');
    expect(src).toMatch(/accountForceUpdate/);
    expect(src).toMatch(
      /force:\s*forceUpdate\s*\|\|\s*addressesChanged\s*\|\|\s*accountForceUpdate/
    );
  });

  test('migration 4.0.4 clears lastUpdate and sets forceUpdate', () => {
    const src = read('migrations/versions/4.0.4.js');
    expect(src).toMatch(/forceUpdate\s*=\s*true/);
    expect(src).toMatch(/lastUpdate\s*=\s*null/);
  });
});
