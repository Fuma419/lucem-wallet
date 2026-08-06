/**
 * @jest-environment jsdom
 *
 * Reproduces the iOS Safari / WKWebView "Face ID to retrieve login" prompt at
 * the DOM level, rather than regex-matching source.
 *
 * Root cause (confirmed against Apple's Password AutoFill docs):
 *   iOS offers to autofill a *saved* login (Face ID) whenever it heuristically
 *   classifies a field as a login/current password. It does NOT do so when a
 *   password field is explicitly marked as a NEW password via
 *   `autocomplete="new-password"`. `autocomplete="off"` is ignored, and
 *   `-webkit-text-security` / `type="text"` masking is treated as a password
 *   field with no new-password hint — i.e. it re-triggers the prompt.
 *
 * This test renders the actual wallet create/import forms and asserts the DOM
 * has no "retrieve saved login" signature:
 *   1. Password entry uses real `input[type="password"]` (not a text hack).
 *   2. Every password field is marked `autocomplete="new-password"`.
 *   3. No field advertises `username` / `current-password` / `on` autofill,
 *      which is what makes WebKit treat the page as a login form.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MakeAccount, ImportSeed } from '../../../ui/app/tabs/createWallet';

const RETRIEVE_LOGIN_AUTOCOMPLETE = new Set([
  'username',
  'current-password',
  'on',
]);

function renderToContainer(element, entry) {
  const html = renderToString(
    <ChakraProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path={entry.pathname} element={element} />
        </Routes>
      </MemoryRouter>
    </ChakraProvider>
  );
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

function inputs(container) {
  return Array.from(container.querySelectorAll('input, textarea'));
}

function iosRetrieveLoginSignature(container) {
  const fields = inputs(container);
  const passwordFields = fields.filter(
    (el) => (el.getAttribute('type') || '').toLowerCase() === 'password'
  );
  const passwordsMissingNewPassword = passwordFields.filter(
    (el) => (el.getAttribute('autocomplete') || '') !== 'new-password'
  );
  const loginAdvertisingFields = fields.filter((el) =>
    RETRIEVE_LOGIN_AUTOCOMPLETE.has(
      (el.getAttribute('autocomplete') || '').toLowerCase()
    )
  );
  return { passwordFields, passwordsMissingNewPassword, loginAdvertisingFields };
}

describe('iOS Password AutoFill (Face ID) on wallet setup forms', () => {
  test('create/import account password fields use type=password + new-password', () => {
    const container = renderToContainer(<MakeAccount colorTheme="purple" />, {
      pathname: '/account',
      state: {
        mnemonic:
          'test test test test test test test test test test test junk',
        flow: 'restore-wallet',
        colorTheme: 'purple',
      },
    });

    const { passwordFields, passwordsMissingNewPassword, loginAdvertisingFields } =
      iosRetrieveLoginSignature(container);

    // Real password inputs must exist (the masking hack rendered type="text",
    // which iOS still treats as a password field but with no new-password hint).
    expect(passwordFields.length).toBeGreaterThanOrEqual(1);

    // Every password field must be a NEW password → no saved-login retrieval.
    expect(passwordsMissingNewPassword).toHaveLength(0);

    // Nothing may advertise itself as a login username / current password.
    expect(loginAdvertisingFields).toHaveLength(0);
  });

  test('import seed step is not shaped like a login form', () => {
    const container = renderToContainer(<ImportSeed colorTheme="cyan" />, {
      pathname: '/import',
      state: { seedLength: 12, colorTheme: 'cyan' },
    });

    const { passwordFields, loginAdvertisingFields } =
      iosRetrieveLoginSignature(container);

    // The seed step collects a recovery phrase, not credentials — no password
    // inputs and no login/current-password autofill hints.
    expect(passwordFields).toHaveLength(0);
    expect(loginAdvertisingFields).toHaveLength(0);
  });
});
