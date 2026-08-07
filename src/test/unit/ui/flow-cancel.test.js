/**
 * Unit coverage for setup Cancel return-path + presence on create/import/HW pages.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const {
  resolveSetupReturnPath,
  sanitizeFlowReturnPath,
  appendFlowReturnQuery,
  readFlowReturnPath,
} = require('../../../ui/app/components/flowCancel');

describe('setup Cancel return-path helpers', () => {
  test('resolveSetupReturnPath prefers from= then accounts vs welcome', () => {
    expect(resolveSetupReturnPath('/accounts', false)).toBe('/accounts');
    expect(resolveSetupReturnPath('/welcome', true)).toBe('/welcome');
    expect(resolveSetupReturnPath(null, true)).toBe('/accounts');
    expect(resolveSetupReturnPath(null, false)).toBe('/welcome');
    expect(resolveSetupReturnPath('/evil', true)).toBe('/accounts');
    expect(resolveSetupReturnPath('send', false)).toBe('/send');
  });

  test('appendFlowReturnQuery / readFlowReturnPath round-trip', () => {
    const q = appendFlowReturnQuery('?type=generate', '/accounts');
    expect(q).toContain('type=generate');
    expect(q).toContain('from=%2Faccounts');
    expect(readFlowReturnPath(q)).toBe('/accounts');
    expect(sanitizeFlowReturnPath('/settings')).toBe('/settings');
    expect(sanitizeFlowReturnPath('https://evil.example')).toBe(null);
  });

  test('SetupCancelButton is exported and leaveSetupFlow exists', () => {
    const src = read('ui/app/components/flowCancel.jsx');
    expect(src).toMatch(/export const SetupCancelButton/);
    expect(src).toMatch(/export async function leaveSetupFlow/);
    expect(src).toContain('data-testid="setup-cancel-button"');
    expect(src).not.toContain('SetupCardCloseButton');
  });
});

describe('setup pages wire Cancel on every step', () => {
  test('createWallet: generate, verify, import, account all call leaveSetupFlow', () => {
    const src = read('ui/app/tabs/createWallet.jsx');
    expect(src).toContain('SetupCancelButton');
    expect(src).toContain('leaveSetupFlow');
    const cancelCalls = src.match(/SetupCancelButton[\s\S]*?leaveSetupFlow\(\)/g) || [];
    expect(cancelCalls.length).toBeGreaterThanOrEqual(4);
    expect(src).not.toContain('SetupCardCloseButton');
    expect(src).not.toContain('setup-card-close');
  });

  test('hw: pick, keystone steps, and select-accounts expose Cancel', () => {
    const src = read('ui/app/tabs/hw.jsx');
    expect(src).toContain('SetupCancelButton');
    expect(src).toContain('leaveSetupFlow');
    const cancelCalls = src.match(/SetupCancelButton[\s\S]*?leaveSetupFlow\(\)/g) || [];
    // pick Continue, keystone showRequest, keystone scanReply, SelectAccounts
    expect(cancelCalls.length).toBeGreaterThanOrEqual(4);
    expect(src).not.toContain('SetupCardCloseButton');
  });

  test('welcome/accounts modals stamp from= for create/import/HW', () => {
    const src = read('ui/app/components/walletSetupFlow.jsx');
    expect(src).toContain('appendFlowReturnQuery');
    expect(src).toMatch(
      /appendFlowReturnQuery\('\?type=generate', returnTo\)/
    );
    expect(src).toMatch(
      /appendFlowReturnQuery\(`\?type=import&length=\$\{seedLength\}`, returnTo\)/
    );
    expect(src).toMatch(
      /createTab\(TAB\.hw, appendFlowReturnQuery\('', returnTo\)\)/
    );
  });
});
