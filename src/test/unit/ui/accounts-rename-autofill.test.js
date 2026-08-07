/**
 * Face ID / Password AutoFill guards for the Accounts display-name field.
 * iOS previously treated "Account name" as a login username; these attrs
 * keep the rename control from being classified as a credential input.
 */
const fs = require('fs');
const path = require('path');

const accountsSrc = fs.readFileSync(
  path.join(__dirname, '../../../ui/app/pages/accounts.jsx'),
  'utf8'
);

describe('accounts display-name rename (iOS AutoFill safe)', () => {
  test('rename UI is enabled (not gated behind ACCOUNT_RENAME_ENABLED)', () => {
    expect(accountsSrc).not.toContain('ACCOUNT_RENAME_ENABLED');
    expect(accountsSrc).toContain('data-testid="accounts-rename-input"');
    expect(accountsSrc).toContain('data-testid="accounts-rename-apply"');
    expect(accountsSrc).toContain('Display name');
  });

  test('uses nickname autocomplete and non-credential name/id', () => {
    expect(accountsSrc).toContain('autoComplete="nickname"');
    expect(accountsSrc).toContain('id="lucem-wallet-display-label"');
    expect(accountsSrc).toContain('name="lucem-wallet-display-label"');
    expect(accountsSrc).not.toMatch(/autoComplete=["']username["']/);
    expect(accountsSrc).not.toMatch(/autoComplete=["']current-password["']/);
    expect(accountsSrc).not.toMatch(/name=["']username["']/);
    expect(accountsSrc).not.toMatch(/placeholder=["']Account name["']/);
  });

  test('loads readonly until focus to suppress AutoFill on page open', () => {
    expect(accountsSrc).toContain('renameUnlocked');
    expect(accountsSrc).toContain('isReadOnly={!renameUnlocked}');
    expect(accountsSrc).toContain('onFocus={() => setRenameUnlocked(true)}');
    expect(accountsSrc).toContain("setRenameUnlocked(false)");
  });

  test('password-manager ignore hints are present', () => {
    expect(accountsSrc).toContain('data-lpignore="true"');
    expect(accountsSrc).toContain('data-1p-ignore="true"');
    expect(accountsSrc).toContain('data-form-type="other"');
  });

  test('import-seed CTA is not nested in the rename panel', () => {
    expect(accountsSrc).toContain('data-testid="accounts-validate-panel"');
    // Rename panel block should not contain the validate button.
    const renameBlock = accountsSrc.match(
      /data-testid="accounts-rename-panel"[\s\S]*?(?=data-testid="accounts-validate-panel"|data-testid="accounts-multi-address-panel")/
    );
    expect(renameBlock).toBeTruthy();
    expect(renameBlock[0]).not.toContain('accounts-validate-button');
  });
});
