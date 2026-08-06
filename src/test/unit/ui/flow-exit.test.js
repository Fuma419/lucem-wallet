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
    expect(src).toMatch(/export const FlowCardCloseButton/);
    expect(src).toMatch(/export function appendFlowReturnQuery/);
    expect(src).toMatch(/export function readFlowReturnPath/);
    expect(src).toMatch(/FLOW_RETURN_ROUTES/);
    expect(src).toMatch(/'\/send'/);
    expect(src).toMatch(/CloseIcon/);
    expect(src).toMatch(/data-testid=["']flow-exit-button["']/);
  });

  test('appendFlowReturnQuery encodes from path', () => {
    const allowed = new Set([
      '/wallet',
      '/accounts',
      '/welcome',
      '/settings',
      '/staking',
      '/governance',
      '/send',
    ]);
    const sanitize = (p) => {
      if (!p || typeof p !== 'string') return null;
      const bare = (p.startsWith('/') ? p : `/${p}`).split('?')[0].split('#')[0];
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

  test('create wallet Exit clears credentials, no DOM scrubbing theater', () => {
    const src = read('ui/app/tabs/createWallet.jsx');
    expect(src).toMatch(/FlowCardCloseButton/);
    expect(src).toMatch(/onClick=\{\(\) => leaveSetupFlow\(\)\}/);
    expect(src).toMatch(/data-testid="import-abandon-button"/);
    // No unmount/DOM-detach hack — the iOS fix is the input attributes below.
    expect(src).not.toMatch(/setAbandoning/);
    expect(src).not.toMatch(/detachFlowSensitiveDom/);
  });

  test('leaveSetupFlow re-arms readonly + clears passwords, no blur (iOS AutoFill)', () => {
    const src = read('ui/app/components/flowExit.jsx');
    expect(src).toMatch(/clearFlowCredentials/);
    expect(src).toMatch(/input\[type="password"\]/);
    // Re-arm readonly so iOS won't offer AutoFill during the Exit transition.
    expect(src).toMatch(/setAttribute\('readonly', ''\)/);
    // Blurring a password field can itself pop the iOS AutoFill accessory.
    expect(src).not.toMatch(/\.blur\(\)/);
  });

  // The behavioral guarantee (rendered DOM has no iOS "retrieve saved login"
  // signature and credential fields load read-only) is enforced by
  // src/test/unit/ui/ios-password-autofill.test.js. These are cheap source
  // guards that the correct attributes are present.
  test('account setup password fields: type=password, new-password, readonly guard', () => {
    const src = read('ui/app/tabs/createWallet.jsx');
    expect(src).toMatch(/name="lucem-account-name"/);
    expect(src).toMatch(/name="lucem-account-password"/);
    expect(src).not.toMatch(/name="username"/);
    // Documented iOS signal for a NEW password (suppresses saved-login Face ID).
    expect(src).toMatch(/autoComplete="new-password"/);
    expect(src).not.toMatch(/autoComplete="username"/);
    // readonly-until-focus guard (iOS never autofills read-only fields).
    expect(src).toMatch(/isReadOnly=\{autofillGuard\}/);
    expect(src).toMatch(/onFocus=\{releaseAutofillGuard\}/);
    // The ineffective hacks must stay gone.
    expect(src).not.toMatch(/WebkitTextSecurity/);
    expect(src).not.toMatch(/data-lpignore/);
  });

  test('HW local password fields: type=password, new-password, readonly guard', () => {
    const src = read('ui/app/tabs/hw.jsx');
    expect(src).toMatch(/autoComplete="new-password"/);
    expect(src).toMatch(/isReadOnly=\{autofillGuard\}/);
    expect(src).not.toMatch(/WebkitTextSecurity/);
  });

  test('wallet setup openers pass from= initiator route', () => {
    const src = read('ui/app/components/walletSetupFlow.jsx');
    expect(src).toMatch(/appendFlowReturnQuery/);
    expect(src).toMatch(/useFlowReturnPath/);
    expect(src).toMatch(/TAB\.hw/);
  });

  test('hardware wallet setup shell exposes Exit', () => {
    const src = read('ui/app/tabs/hw.jsx');
    expect(src).toMatch(/FlowCardCloseButton/);
    expect(src).toMatch(/leaveSetupFlow/);
  });

  test('Keystone and Trezor sign tabs expose card close', () => {
    expect(read('ui/app/tabs/keystoneTx.jsx')).toMatch(/leaveSignTabFlow/);
    expect(read('ui/app/tabs/keystoneTx.jsx')).toMatch(/FlowCardCloseButton/);
    expect(read('ui/app/tabs/trezorTx.jsx')).toMatch(/leaveSignTabFlow/);
    expect(read('ui/app/tabs/trezorTx.jsx')).toMatch(/FlowCardCloseButton/);
  });

  test('HW confirm closes before opening Keystone/Trezor tabs', () => {
    const src = read('ui/app/components/confirmModal.jsx');
    expect(src).toMatch(/Close before opening Keystone\/Trezor/);
    expect(src).toMatch(/onClose\(\);\s*\n\s*await props\.sign\(null, hw\)/);
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
