/**
 * @jest-environment jsdom
 *
 * Behavioral tests for AvatarLoader's hardware-wallet branding. A hardware
 * account stores its device id as the avatar (set at import); AvatarLoader must
 * render the brand logo asset for it — not the literal string, and without the
 * dicebear generator — while leaving software avatars (dicebear seeds and plain
 * URLs) untouched.
 *
 * SVG imports resolve to the shared file mock ('test-file-stub'), so a mapped
 * logo shows that stub as the <img src> whereas an unmapped value passes through
 * verbatim — enough to prove the mapping fired.
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';

global.IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  });
}

// jest.mock factories may only reference variables prefixed with `mock`.
const mockAvatarToImage = jest.fn(() => 'blob:mock-avatar');
jest.mock('../../../api/extension', () => ({
  __esModule: true,
  avatarToImage: (...args) => mockAvatarToImage(...args),
}));

import AvatarLoader from '../../../ui/app/components/avatarLoader';

async function renderAvatar(avatar) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <ChakraProvider>
        <AvatarLoader avatar={avatar} width="40px" />
      </ChakraProvider>
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

beforeEach(() => {
  mockAvatarToImage.mockClear();
});

describe('AvatarLoader — hardware wallet logos', () => {
  test('keystone avatar renders the Keystone logo asset (not the literal id)', async () => {
    const container = await renderAvatar('keystone');
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('test-file-stub');
    expect(img.getAttribute('src')).not.toBe('keystone');
    // The dicebear generator must not run for a branded avatar.
    expect(mockAvatarToImage).not.toHaveBeenCalled();
  });

  test('ledger avatar renders the Ledger logo asset', async () => {
    const container = await renderAvatar('ledger');
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toBe('test-file-stub');
    expect(mockAvatarToImage).not.toHaveBeenCalled();
  });

  test('trezor avatar renders the Trezor logo asset', async () => {
    const container = await renderAvatar('trezor');
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toBe('test-file-stub');
    expect(mockAvatarToImage).not.toHaveBeenCalled();
  });
});

describe('AvatarLoader — software avatars are unchanged', () => {
  test('numeric dicebear seed goes through avatarToImage', async () => {
    const container = await renderAvatar('0.4242');
    const img = container.querySelector('img');
    expect(mockAvatarToImage).toHaveBeenCalledWith('0.4242');
    expect(img.getAttribute('src')).toBe('blob:mock-avatar');
  });

  test('a plain (non-device) string is used verbatim as the image src', async () => {
    const container = await renderAvatar('https://example.com/pic.png');
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toBe('https://example.com/pic.png');
    expect(mockAvatarToImage).not.toHaveBeenCalled();
  });
});
