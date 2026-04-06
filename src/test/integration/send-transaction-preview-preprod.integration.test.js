/**
 * @jest-environment node
 */

/* Load repo-root `.env` when present (mnemonics must be quoted, space-separated BIP-39). */
require('dotenv').config();

/**
 * Live Preview / Preprod: build + sign + submit a small ADA self-transfer via Koios.
 *
 * Skips unless mnemonics are set (CI stays green). When funded wallets are configured,
 * expects success and a tx hash string.
 *
 * Env (GitHub Actions: add as repository secrets and map to env in workflow if desired):
 *   LUCEM_INTEGRATION_PREVIEW_MNEMONIC   — 12/15/24 words, account 0, plain tADA UTxOs only
 *   LUCEM_INTEGRATION_PREPROD_MNEMONIC   — same for preprod
 *   KOIOS_API_KEY_PREVIEW                — optional Bearer token (public tier may work)
 *   KOIOS_API_KEY_PREPROD
 *   LUCEM_INTEGRATION_SEND_LOVELACE      — optional, default 3_000_000
 */

const { buildSignSubmitSelfTransfer } = require('./koios-self-send');

const PREVIEW_BASE = 'https://preview.koios.rest/api/v1';
const PREPROD_BASE = 'https://preprod.koios.rest/api/v1';

const sendLovelace = () =>
  process.env.LUCEM_INTEGRATION_SEND_LOVELACE || '3000000';

function previewMnemonic() {
  return (process.env.LUCEM_INTEGRATION_PREVIEW_MNEMONIC || '').trim();
}

function preprodMnemonic() {
  return (process.env.LUCEM_INTEGRATION_PREPROD_MNEMONIC || '').trim();
}

describe('Preview network — submit ADA self-transfer (integration)', () => {
  const phrase = previewMnemonic();

  (phrase ? test : test.skip)('submits a signed transaction via Koios', async () => {
    const apiKey = process.env.KOIOS_API_KEY_PREVIEW;
    const hash = await buildSignSubmitSelfTransfer({
      baseUrl: PREVIEW_BASE,
      apiKey,
      mnemonic: phrase,
      sendLovelace: sendLovelace(),
    });
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(10);
  });
});

describe('Preprod network — submit ADA self-transfer (integration)', () => {
  const phrase = preprodMnemonic();

  (phrase ? test : test.skip)('submits a signed transaction via Koios', async () => {
    const apiKey = process.env.KOIOS_API_KEY_PREPROD;
    const hash = await buildSignSubmitSelfTransfer({
      baseUrl: PREPROD_BASE,
      apiKey,
      mnemonic: phrase,
      sendLovelace: sendLovelace(),
    });
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(10);
  });
});
