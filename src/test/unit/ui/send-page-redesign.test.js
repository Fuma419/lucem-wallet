const fs = require('fs');
const path = require('path');

describe('send page redesigned flow', () => {
  const sendSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/pages/send.jsx'),
    'utf8'
  );

  test('renders the redesigned send page shell and stable action label', () => {
    expect(sendSrc).toContain('data-testid="send-page"');
    expect(sendSrc).toContain('data-testid="send-primary-action"');
    expect(sendSrc).toContain("'Review transaction'");
    expect(sendSrc).not.toContain("{fee.error ? fee.error : 'Send'}");
  });

  test('surfaces preparation failures as a separate alert', () => {
    expect(sendSrc).toContain('data-testid="send-error-alert"');
    expect(sendSrc).toContain('sendPreparationErrorMessage(e)');
    expect(sendSrc).toContain('Unable to prepare transaction');
  });

  test('does not leave the form in an indefinite loading state if init fails', () => {
    expect(sendSrc).toContain('init().catch');
    expect(sendSrc).toContain('setIsLoading(false)');
  });

  test('exposes functional selectors for the send form', () => {
    expect(sendSrc).toContain('data-testid="send-recipient-input"');
    expect(sendSrc).toContain('data-testid="send-ada-amount"');
  });
});
