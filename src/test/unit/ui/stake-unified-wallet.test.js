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
    const barrel = read('api/extension/index.js');
    const src = read('api/extension/addresses.js');
    expect(barrel).toMatch(/paymentKeyHashesForSigning/);
    expect(src).toMatch(/export const paymentKeyHashesForSigning/);
    expect(src).toMatch(/listEnabledPaymentAddresses/);
  });

  test('buildTx sizes fees for all enabled payment key hashes', () => {
    const src = read('api/extension/wallet.ts');
    expect(src).toMatch(/paymentKeyHashesForSigning\(account\)/);
    expect(src).toMatch(/requiredVkeyHashesHex/);
  });

  test('send and staking sign with paymentKeyHashesForSigning', () => {
    expect(read('ui/app/pages/send.jsx')).toMatch(/paymentKeyHashesForSigning/);
    expect(read('ui/app/pages/send.jsx')).toMatch(/keyHashesForTx/);
    expect(read('ui/app/pages/staking.jsx')).toMatch(
      /paymentKeyHashesForSigning/
    );
    expect(read('ui/app/pages/governance.jsx')).toMatch(
      /paymentKeyHashesForSigning/
    );
  });

  test('history prefers same-stake credential matches', () => {
    const src = read('ui/app/components/transaction.jsx');
    expect(src).toMatch(/Same stake key/);
    expect(src).toMatch(/ownStakeCred/);
  });

  test('multi-address is always on — no toggle; list always visible', () => {
    const src = read('ui/app/components/multiAddressSettings.jsx');
    expect(src).toMatch(/multi-address-always-on/);
    expect(src).not.toMatch(/SettingsToggleRow/);
    expect(src).not.toMatch(/Enable multi-address/);
    expect(src).not.toMatch(/advancedOn/);
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

  test('Accounts list shows controlled stake, not primary-address contents', () => {
    const src = read('ui/app/pages/accounts.jsx');
    expect(src).toMatch(/getAccountsControlledStake/);
    expect(src).toMatch(/Controlled stake/);
    expect(src).not.toMatch(/paymentAddr/);
    expect(src).not.toMatch(/Select to load/);
  });

  test('multi-address panel loads per-address contents via address_info', () => {
    const api = read('api/extension/chain-reads.js');
    expect(api).toMatch(/export const getEnabledPaymentAddressDetails/);
    expect(api).toMatch(/getAddressesInfo/);
    expect(api).toMatch(/summarizeAddressInfo/);
    expect(api).toMatch(/filterPaymentAddressesForAccountsDisplay/);
    expect(api).toMatch(/userExternalIndices/);
    // Accounts listing must discover + use stake UTxOs so funded addresses
    // appear even when prior index discovery / address_info was incomplete.
    expect(api).toMatch(/activateDiscoveredExternalAddresses/);
    expect(api).toMatch(/aggregateKoiosUtxosByAddress/);
    expect(api).toMatch(/getAccountUtxos/);
    expect(api).toMatch(/extFromFunded/);

    const panel = read('ui/app/components/multiAddressSettings.jsx');
    expect(panel).toMatch(/getEnabledPaymentAddressDetails/);
    expect(panel).toMatch(/accountsDisplay:\s*true/);
    expect(panel).toMatch(/multi-address-contents-/);
    expect(panel).toMatch(/utxoCount/);
    expect(panel).toMatch(/nativeAssetCount/);
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
    const src = read('api/extension/chain-reads.js');
    expect(src).toMatch(/enabledOwners\.has/);
    expect(src).toMatch(
      /Spend only from addresses we can witness/
    );
    // The rescue must not be limited to token UTxOs: ADA-only UTxOs on an
    // undiscovered change/receive index have to stay spendable too.
    expect(src).toMatch(/unknownAddrs/);
    expect(src).not.toMatch(/asset_list\) && utxo\.asset_list\.length > 0/);
    expect(src).toMatch(/matchInternalIndicesFromAddresses/);
  });
});
