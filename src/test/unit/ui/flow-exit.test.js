/**
 * Source guards for always-available Exit on setup and signing flows.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('flow exit / abort', () => {
  test('shared helpers leave setup to accounts or welcome', () => {
    const src = read('ui/app/components/flowExit.jsx');
    expect(src).toMatch(/export async function leaveSetupFlow/);
    expect(src).toMatch(/export async function leaveSignTabFlow/);
    expect(src).toMatch(/export async function leaveDappApprovalFlow/);
    expect(src).toMatch(/export const FlowShellHeader/);
    expect(src).toMatch(/data-testid': 'flow-exit-button'/);
    expect(src).toMatch(/hasAccounts \? '\/accounts' : '\/welcome'/);
  });

  test('create wallet shell exposes Exit on every step', () => {
    const src = read('ui/app/tabs/createWallet.jsx');
    expect(src).toMatch(/FlowShellHeader/);
    expect(src).toMatch(/leaveSetupFlow/);
    expect(src).toMatch(/data-testid="import-abandon-button"/);
    expect(src).not.toMatch(/abandonWalletSetup/);
  });

  test('hardware wallet setup shell exposes Exit', () => {
    const src = read('ui/app/tabs/hw.jsx');
    expect(src).toMatch(/FlowShellHeader/);
    expect(src).toMatch(/leaveSetupFlow/);
  });

  test('Keystone and Trezor sign tabs expose Exit', () => {
    expect(read('ui/app/tabs/keystoneTx.jsx')).toMatch(/leaveSignTabFlow/);
    expect(read('ui/app/tabs/keystoneTx.jsx')).toMatch(/FlowShellHeader/);
    expect(read('ui/app/tabs/trezorTx.jsx')).toMatch(/leaveSignTabFlow/);
    expect(read('ui/app/tabs/trezorTx.jsx')).toMatch(/FlowShellHeader/);
  });

  test('dApp sign/enable decline via leaveDappApprovalFlow', () => {
    expect(read('ui/app/pages/signTx.jsx')).toMatch(/leaveDappApprovalFlow/);
    expect(read('ui/app/pages/signData.jsx')).toMatch(/leaveDappApprovalFlow/);
    expect(read('ui/app/pages/enable.jsx')).toMatch(/leaveDappApprovalFlow/);
    expect(read('ui/app/pages/signTx.jsx')).toMatch(
      /TxSignError\.UserDeclined/
    );
  });
});
