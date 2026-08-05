/**
 * Source guards for stake-unified wallet UX: signing covers all enabled
 * payment hashes, history matches same-stake addresses, and hiding the
 * multi-address panel does not wipe discovered indices.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('stake-unified wallet source guards', () => {
  test('exports paymentKeyHashesForSigning for fee and witnesses', () => {
    const src = read('api/extension/index.js');
    expect(src).toMatch(/export const paymentKeyHashesForSigning/);
    expect(src).toMatch(/listEnabledPaymentAddresses/);
  });

  test('buildTx sizes fees for all enabled payment key hashes', () => {
    const src = read('api/extension/wallet.js');
    expect(src).toMatch(/paymentKeyHashesForSigning\(account\)/);
    expect(src).toMatch(/requiredVkeyHashesHex/);
  });

  test('send and staking sign with paymentKeyHashesForSigning', () => {
    expect(read('ui/app/pages/send.jsx')).toMatch(/paymentKeyHashesForSigning/);
    expect(read('ui/app/pages/staking.jsx')).toMatch(
      /paymentKeyHashesForSigning/
    );
    expect(read('ui/app/pages/governance.jsx')).toMatch(
      /paymentKeyHashesForSigning/
    );
    expect(read('ui/app/tabs/trezorTx.jsx')).toMatch(
      /paymentKeyHashesForSigning/
    );
  });

  test('history prefers same-stake credential matches', () => {
    const src = read('ui/app/components/transaction.jsx');
    expect(src).toMatch(/Same stake key/);
    expect(src).toMatch(/ownStakeCred/);
  });

  test('multi-address Off hides panel without wiping indices', () => {
    const src = read('ui/app/components/multiAddressSettings.jsx');
    expect(src).toMatch(/Collapse the panel only/);
    expect(src).not.toMatch(/setAccountExternalIndices\(\s*\[0\]\s*\)/);
  });

  test('multi-address panel lives on Accounts not Settings', () => {
    expect(read('ui/app/pages/accounts.jsx')).toMatch(/MultiAddressSettings/);
    expect(read('ui/app/pages/accounts.jsx')).toMatch(
      /accounts-multi-address-panel/
    );
    expect(read('ui/app/pages/settings.jsx')).not.toMatch(
      /MultiAddressSettings/
    );
    expect(read('ui/app/pages/settings.jsx')).not.toMatch(
      /settings-advanced-panel/
    );
  });

  test('Keystone signing uses enabled payment/change paths not primary-only', () => {
    const src = read('api/keystone-cardano.js');
    expect(src).toMatch(/findEnabledPaymentByAddress/);
    expect(src).toMatch(/cip1852PaymentPath/);
    expect(src).not.toMatch(
      /does not treat as its primary payment address/
    );
  });

  test('getUtxos filters spendable set to enabled payment addresses', () => {
    const src = read('api/extension/index.js');
    expect(src).toMatch(/enabledOwners\.has/);
    expect(src).toMatch(
      /Spend only from addresses we can witness/
    );
  });
});
