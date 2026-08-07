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
    expect(src).toMatch(/export const SetupCardCloseButton/);
    expect(src).toContain('data-testid="setup-cancel-button"');
    expect(src).toContain('data-testid="setup-card-close"');
    expect(src).toMatch(/hasAccounts \? '\/accounts' : '\/welcome'/);
    expect(src).toContain("'/send'");
    // Cancel lives on the card (modal close + outline CTA), not the logo header.
    expect(src).not.toMatch(/SetupShellHeader[\s\S]*onCancel/);
  });

  test('createWallet uses card close + themed Cancel under CTAs', () => {
    const src = read('ui/app/tabs/createWallet.jsx');
    expect(src).toContain('leaveSetupFlow');
    expect(src).toContain('SetupShellHeader');
    expect(src).toContain('SetupCardCloseButton');
    expect(src).toContain('SetupCancelButton');
    expect(src).toContain('tone="purple"');
    expect(src).toContain('tone="cyan"');
    expect(src).toMatch(
      /SetupCardCloseButton\s+onCancel=\{\(\) => leaveSetupFlow\(\)\}/
    );
  });

  test('hw setup uses card close + lime Cancel under CTAs', () => {
    const src = read('ui/app/tabs/hw.jsx');
    expect(src).toContain('leaveSetupFlow');
    expect(src).toContain('SetupShellHeader');
    expect(src).toContain('SetupCardCloseButton');
    expect(src).toContain('SetupCancelButton');
    expect(src).toContain('tone="hw"');
    expect(src).toMatch(
      /SetupCardCloseButton\s+onCancel=\{\(\) => leaveSetupFlow\(\)\}/
    );
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
    expect(src).toMatch(
      /createTab\(TAB\.hw, appendFlowReturnQuery\('', returnTo\)\)/
    );
  });
});
