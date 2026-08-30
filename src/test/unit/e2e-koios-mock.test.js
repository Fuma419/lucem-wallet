/**
 * Guards the Playwright Koios mock so Send stays spendable in e2e.
 *
 * getUtxos() prefers POST /account_utxos when a stake address exists. A mock
 * that only stubs /address_utxos fulfills account_utxos as [] and CI archives
 * a watch-only Send with Available 0 t₳.
 */
const fs = require('fs');
const path = require('path');
const {
  E2E_ACCOUNT_UTXO,
  E2E_PAYMENT_ADDR,
  koiosMockBody,
} = require('../../../e2e/helpers');

const helpersSrc = fs.readFileSync(
  path.join(__dirname, '../../../e2e/helpers.js'),
  'utf8'
);
const screenshotsSrc = fs.readFileSync(
  path.join(__dirname, '../../../e2e/screenshots.spec.js'),
  'utf8'
);

describe('e2e Koios mock includes spendable /account_utxos', () => {
  test('koiosMockBody returns an ADA UTxO on the seeded payment address', () => {
    const body = koiosMockBody(
      'https://preview.koios.rest/api/v1/account_utxos'
    );
    expect(body).toEqual([E2E_ACCOUNT_UTXO]);
    expect(body[0].address).toBe(E2E_PAYMENT_ADDR);
    expect(BigInt(body[0].value)).toBeGreaterThan(0n);
    expect(body[0].tx_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(body[0].tx_index ?? body[0].output_index).toBeDefined();
    expect(Array.isArray(body[0].asset_list)).toBe(true);
  });

  test('/account_utxos is not swallowed as an empty unmatched stub', () => {
    const account = koiosMockBody(
      'https://preview.koios.rest/api/v1/account_utxos'
    );
    const address = koiosMockBody(
      'https://preview.koios.rest/api/v1/address_utxos'
    );
    expect(account).toHaveLength(1);
    expect(address).toHaveLength(1);
    expect(account[0].address).toBe(E2E_PAYMENT_ADDR);
  });

  test('Blockfrost account UTxOs are stubbed before /accounts/stake*', () => {
    const stake = 'stake_test1uraeephypk4yn4nfj50r3t6y7959jf6u9evmfx7zhxsmtrssx6ehu';
    const body = koiosMockBody(
      `https://cardano-preview.blockfrost.io/api/v0/accounts/${stake}/utxos?count=100&page=1`
    );
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].address).toBe(E2E_PAYMENT_ADDR);
    expect(body[0].amount).toEqual([
      { unit: 'lovelace', quantity: E2E_ACCOUNT_UTXO.value },
    ]);
  });

  test('seed helper writes dummy encryptedKey unless sterilized', () => {
    expect(helpersSrc).toMatch(/encryptedKey/);
    expect(helpersSrc).toMatch(/e2e-dummy-encrypted-key/);
    expect(helpersSrc).toMatch(/signable !== false/);
  });

  test('seed is 95 ADA UTxO + 5 ADA withdrawable (100 controlled)', () => {
    expect(E2E_ACCOUNT_UTXO.value).toBe('95000000');
    const info = koiosMockBody(
      'https://preview.koios.rest/api/v1/account_info'
    );
    expect(info[0].withdrawable_amount).toBe('5000000');
    expect(info[0].controlled_amount).toBe('100000000');
  });

  test('screenshots expect Send Available to include rewards (100 tADA)', () => {
    expect(screenshotsSrc).toMatch(/Available 100/);
  });

  test('screenshots keep a sterilized Send shot for restore-seed UX', () => {
    expect(screenshotsSrc).toMatch(/signable:\s*false/);
    expect(screenshotsSrc).toMatch(/12b-send-page-needs-seed/);
    expect(screenshotsSrc).toMatch(/send-needs-seed-alert/);
    expect(screenshotsSrc).toMatch(/send-available-balance/);
  });

  test('layout and send-all seed a wallet instead of skipping', () => {
    const layoutSrc = fs.readFileSync(
      path.join(__dirname, '../../../e2e/wallet-layout.spec.js'),
      'utf8'
    );
    const sendAllSrc = fs.readFileSync(
      path.join(__dirname, '../../../e2e/send-all.spec.js'),
      'utf8'
    );
    expect(layoutSrc).toMatch(/openSeededWallet/);
    expect(layoutSrc).not.toMatch(/test\.skip/);
    expect(sendAllSrc).toMatch(/openSeededWallet/);
    expect(sendAllSrc).not.toMatch(/test\.skip/);
  });
});
