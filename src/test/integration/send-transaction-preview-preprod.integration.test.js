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
 * Live Preview / Preprod: fund account 0 (CIP-1852) with plain tADA, then run:
 *   npm run test:integration
 *
 * Env:
 *   LUCEM_INTEGRATION_PREVIEW_MNEMONIC   — optional; skip Preview tests if unset
 *   LUCEM_INTEGRATION_PREPROD_MNEMONIC   — optional; skip Preprod tests if unset
 *   KOIOS_API_KEY_PREVIEW / PREPROD      — optional Bearer
 *   LUCEM_INTEGRATION_SEND_LOVELACE      — default 3_000_000
 *   LUCEM_INTEGRATION_POLL_TX=1          — after submit, poll /tx_status until visible
 */

const PREVIEW_BASE = 'https://preview.koios.rest/api/v1';
const PREPROD_BASE = 'https://preprod.koios.rest/api/v1';

const sendLovelace = () =>
  process.env.LUCEM_INTEGRATION_SEND_LOVELACE || '3000000';

const shouldPollTx = () => process.env.LUCEM_INTEGRATION_POLL_TX === '1';

const TX_HASH_RE = /^[a-f0-9]{64}$/i;

const NETWORKS = [
  {
    name: 'Preview',
    baseUrl: PREVIEW_BASE,
    mnemonicEnv: 'LUCEM_INTEGRATION_PREVIEW_MNEMONIC',
    apiKeyEnv: 'KOIOS_API_KEY_PREVIEW',
  },
  {
    name: 'Preprod',
    baseUrl: PREPROD_BASE,
    mnemonicEnv: 'LUCEM_INTEGRATION_PREPROD_MNEMONIC',
    apiKeyEnv: 'KOIOS_API_KEY_PREPROD',
  },
];

function mnemonicFor(envKey) {
  return (process.env[envKey] || '').trim();
}

function apiKeyFor(envKey) {
  const v = process.env[envKey];
  return v && v !== 'your-koios-api-key-here' ? v : undefined;
}

NETWORKS.forEach(
  ({ name, baseUrl, mnemonicEnv, apiKeyEnv }) => {
    const phrase = mnemonicFor(mnemonicEnv);
    const describeOrSkip = phrase ? describe : describe.skip;

    describeOrSkip(`${name} — tADA self-transfer (Koios integration)`, () => {
      const apiKey = apiKeyFor(apiKeyEnv);

      test('mnemonic is valid BIP-39', () => {
        expect(validateMnemonic(phrase)).toBe(true);
      });

      test('account 0 base address uses testnet bech32 (preview/preprod)', () => {
        const { bech32 } = deriveAccount0Address(phrase);
        expect(bech32).toMatch(/^addr_test1/);
      });

      test('Koios returns protocol parameters', async () => {
        const p = await fetchProtocolParams(baseUrl, apiKey);
        expect(p.linearFee.minFeeA).toBeTruthy();
        expect(p.slot).toBeGreaterThan(0);
      });

      test(
        'submits signed self-transfer; optional Koios /tx_status poll (LUCEM_INTEGRATION_POLL_TX=1)',
        async () => {
          const hash = await buildSignSubmitSelfTransfer({
            baseUrl,
            apiKey,
            mnemonic: phrase,
            sendLovelace: sendLovelace(),
          });
          expect(hash).toMatch(TX_HASH_RE);
          if (shouldPollTx()) {
            const status = await waitForTxStatus({
              baseUrl,
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
  }
);
