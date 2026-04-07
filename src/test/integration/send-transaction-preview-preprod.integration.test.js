/**
 * @jest-environment node
 */

/* Load repo-root `.env` when present (mnemonics must be quoted, space-separated BIP-39). */
require('dotenv').config();

const { validateMnemonic } = require('bip39');
const {
  buildSignSubmitSelfTransfer,
  deriveAccount0Address,
  fetchProtocolParams,
  waitForTxStatus,
} = require('./koios-self-send');

/**
 * Preprod only: live Koios self-transfer from account 0 (CIP-1852), ADA-only UTxOs.
 *
 * Run locally: `npm run test:integration` with `.env` (see `.env.example`). Live tests skip if mnemonic unset.
 * To run on GitHub Actions later, add a workflow step + repo secrets; see commented block in `ci.yml`.
 *
 * Env:
 *   LUCEM_INTEGRATION_PREPROD_MNEMONIC
 *   KOIOS_API_KEY_PREPROD — optional Bearer
 *   LUCEM_INTEGRATION_SEND_LOVELACE — default 3000000
 *   LUCEM_INTEGRATION_POLL_TX=1 — poll /tx_status after submit
 */

const PREPROD_BASE = 'https://preprod.koios.rest/api/v1';

const sendLovelace = () =>
  process.env.LUCEM_INTEGRATION_SEND_LOVELACE || '3000000';

const shouldPollTx = () => process.env.LUCEM_INTEGRATION_POLL_TX === '1';

const TX_HASH_RE = /^[a-f0-9]{64}$/i;

function preprodMnemonic() {
  return (process.env.LUCEM_INTEGRATION_PREPROD_MNEMONIC || '').trim();
}

function preprodApiKey() {
  const v = process.env.KOIOS_API_KEY_PREPROD;
  return v && v !== 'your-koios-api-key-here' ? v : undefined;
}

const phrase = preprodMnemonic();
const describeLive = phrase && validateMnemonic(phrase) ? describe : describe.skip;

describeLive('Preprod — tADA self-transfer (Koios integration)', () => {
  const apiKey = preprodApiKey();

  test('mnemonic is valid BIP-39', () => {
    expect(validateMnemonic(phrase)).toBe(true);
  });

  test('account 0 base address uses testnet bech32', () => {
    const { bech32 } = deriveAccount0Address(phrase);
    expect(bech32).toMatch(/^addr_test1/);
  });

  test('Koios returns protocol parameters', async () => {
    const p = await fetchProtocolParams(PREPROD_BASE, apiKey);
    expect(p.linearFee.minFeeA).toBeTruthy();
    expect(p.slot).toBeGreaterThan(0);
  });

  test(
    'submits signed self-transfer; optional Koios /tx_status poll (LUCEM_INTEGRATION_POLL_TX=1)',
    async () => {
      const hash = await buildSignSubmitSelfTransfer({
        baseUrl: PREPROD_BASE,
        apiKey,
        mnemonic: phrase,
        sendLovelace: sendLovelace(),
      });
      expect(hash).toMatch(TX_HASH_RE);
      if (shouldPollTx()) {
        const status = await waitForTxStatus({
          baseUrl: PREPROD_BASE,
          apiKey,
          txHash: hash,
          maxAttempts: 30,
          delayMs: 2000,
          minConfirmations: 0,
        });
        expect(status.tx_hash.toLowerCase()).toBe(hash.toLowerCase());
        expect(status.num_confirmations).not.toBeNull();
      }
    },
    180000
  );
});
