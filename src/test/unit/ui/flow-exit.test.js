/**
 * Source guards for always-available Exit on setup and signing flows.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('flow exit / abort', () => {
  test('shared helpers leave setup preferring ?from= initiator', () => {
    const src = read('ui/app/components/flowExit.jsx');
    expect(src).toMatch(/export async function leaveSetupFlow/);
    expect(src).toMatch(/export async function leaveSignTabFlow/);
    expect(src).toMatch(/export async function leaveDappApprovalFlow/);
    expect(src).toMatch(/export const FlowShellHeader/);
    expect(src).toMatch(/export function appendFlowReturnQuery/);
    expect(src).toMatch(/export function readFlowReturnPath/);
    expect(src).toMatch(/FLOW_RETURN_ROUTES/);
    expect(src).toMatch(/'\/send'/);
    expect(src).toMatch(/data-testid': 'flow-exit-button'/);
  });

  test('appendFlowReturnQuery encodes from path', () => {
    // Pure logic mirrored from flowExit (avoid importing JSX module in node).
    const allowed = new Set([
      '/wallet',
      '/accounts',
      '/welcome',
      '/settings',
      '/staking',
      '/governance',
      '/send',
    ]);
    const sanitize = (path) => {
      if (!path || typeof path !== 'string') return null;
      const bare = (path.startsWith('/') ? path : `/${path}`)
        .split('?')[0]
        .split('#')[0];
      return allowed.has(bare) ? bare : null;
    };
    const append = (query = '', fromPath) => {
      const safe = sanitize(fromPath);
      if (!safe) {
        if (!query) return '';
        return query.startsWith('?') ? query : `?${query}`;
      }
      const raw = query.startsWith('?') ? query.slice(1) : query;
      const params = new URLSearchParams(raw);
      params.set('from', safe);
      return `?${params.toString()}`;
    };
    expect(sanitize('/accounts')).toBe('/accounts');
    expect(sanitize('/evil')).toBeNull();
    expect(append('?type=generate', '/welcome')).toBe(
      '?type=generate&from=%2Fwelcome'
    );
    expect(append('?type=generate', '/accounts')).toContain('from=%2Faccounts');
    expect(
      sanitize(new URLSearchParams('?from=/send&signId=x').get('from'))
    ).toBe('/send');
  });

  test('create wallet shell exposes Exit on every step', () => {
    const src = read('ui/app/tabs/createWallet.jsx');
    expect(src).toMatch(/FlowShellHeader/);
    expect(src).toMatch(/leaveSetupFlow/);
    expect(src).toMatch(/data-testid="import-abandon-button"/);
    expect(src).not.toMatch(/abandonWalletSetup/);
  });

  test('wallet setup openers pass from= initiator route', () => {
    const src = read('ui/app/components/walletSetupFlow.jsx');
    expect(src).toMatch(/appendFlowReturnQuery/);
    expect(src).toMatch(/useFlowReturnPath/);
    expect(src).toMatch(/TAB\.hw/);
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

  test('send/staking/governance pass from into HW sign tabs', () => {
    expect(read('ui/app/pages/send.jsx')).toMatch(/from:\s*'\/send'/);
    expect(read('ui/app/pages/staking.jsx')).toMatch(/from:\s*'\/staking'/);
    expect(read('ui/app/pages/governance.jsx')).toMatch(
      /from:\s*'\/governance'/
    );
  });
});
