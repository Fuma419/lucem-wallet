/**
 * Source guards for Cancel on wallet create / import / HW setup flows.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('setup flow Cancel / return-to-initiator', () => {
  test('shared helpers prefer ?from= and fall back to accounts vs welcome', () => {
    const src = read('ui/app/components/flowCancel.jsx');
    expect(src).toMatch(/export async function leaveSetupFlow/);
    expect(src).toMatch(/export function appendFlowReturnQuery/);
    expect(src).toMatch(/export function readFlowReturnPath/);
    expect(src).toMatch(/export const SetupShellHeader/);
    expect(src).toMatch(/export const SetupCancelButton/);
    expect(src).toMatch(/data-testid': 'setup-cancel-button'/);
    expect(src).toMatch(/hasAccounts \? '\/accounts' : '\/welcome'/);
    expect(src).toContain("'/send'");
  });

  test('createWallet stamps Cancel via leaveSetupFlow on every step shell', () => {
    const src = read('ui/app/tabs/createWallet.jsx');
    expect(src).toContain('leaveSetupFlow');
    expect(src).toContain('SetupShellHeader');
    expect(src).toContain('data-testid="import-abandon-button"');
    expect(src).not.toContain('abandonWalletSetup');
    expect(src).toMatch(/onCancel=\{\(\) => leaveSetupFlow\(\)\}/);
  });

  test('hw setup exposes Cancel via header and step buttons', () => {
    const src = read('ui/app/tabs/hw.jsx');
    expect(src).toContain('leaveSetupFlow');
    expect(src).toContain('SetupShellHeader');
    expect(src).toContain('SetupCancelButton');
    expect(src).toMatch(/onCancel=\{\(\) => leaveSetupFlow\(\)\}/);
  });

  test('welcome/accounts modals pass from= when opening create/import/HW', () => {
    const src = read('ui/app/components/walletSetupFlow.jsx');
    expect(src).toContain('appendFlowReturnQuery');
    expect(src).toContain('useFlowReturnPath');
    expect(src).toMatch(
      /appendFlowReturnQuery\('\?type=generate', returnTo\)/
    );
    expect(src).toMatch(
      /appendFlowReturnQuery\(`\?type=import&length=\$\{seedLength\}`, returnTo\)/
    );
    expect(src).toMatch(/createTab\(TAB\.hw, appendFlowReturnQuery\('', returnTo\)\)/);
  });
});
