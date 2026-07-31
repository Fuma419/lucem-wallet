/**
 * @jest-environment node
 */

/* Load repo-root `.env` when present (mnemonics must be quoted, space-separated BIP-39). */
require('dotenv').config();

const { validateMnemonic } = require('bip39');
const {
  PROVIDER,
  buildSignSubmitAccountTransfer,
  buildSignSubmitSelfTransfer,
  deriveAccount0Address,
  fetchProtocolParams,
  waitForTxStatus,
  waitForTxInAccountHistory,
} = require('./koios-self-send');

/**
 * Live testnet transfers only (never Cardano mainnet). CIP-1852, ADA-only UTxOs,
 * Blockfrost first / Koios fallback:
 *   - Preview: same-address self-transfer (account 0 → 0)
 *   - Preprod: account 0 → account 1 (different payment address in the same wallet)
 *
 * Run locally: `npm run test:integration` with `.env` (see `.env.example`). Live tests skip if mnemonic unset.
 * Jenkins strips mainnet credentials before this suite. Mainnet submit is hard-refused.
 *
 * Env:
 *   LUCEM_INTEGRATION_PREVIEW_MNEMONIC
 *   LUCEM_INTEGRATION_PREPROD_MNEMONIC
 *   BLOCKFROST_PREVIEW_PROJECT_ID / BLOCKFROST_PROJECT_ID_PREVIEW
 *   BLOCKFROST_PREPROD_PROJECT_ID / BLOCKFROST_PROJECT_ID_PREPROD
 *   KOIOS_API_KEY_PREVIEW — optional fallback Bearer
 *   KOIOS_API_KEY_PREPROD — optional fallback Bearer
 *   LUCEM_INTEGRATION_SEND_LOVELACE — default 5000000 (5 tADA)
 *   LUCEM_INTEGRATION_POLL_TX=1 — poll /tx_status after submit
 */

const PREVIEW_KOIOS_BASE = 'https://preview.koios.rest/api/v1';
const PREPROD_KOIOS_BASE = 'https://preprod.koios.rest/api/v1';
const PREVIEW_BLOCKFROST_BASE = 'https://cardano-preview.blockfrost.io/api/v0';
const PREPROD_BLOCKFROST_BASE = 'https://cardano-preprod.blockfrost.io/api/v0';

const sendLovelace = () =>
  process.env.LUCEM_INTEGRATION_SEND_LOVELACE || '5000000';

const shouldPollTx = () => process.env.LUCEM_INTEGRATION_POLL_TX === '1';

const TX_HASH_RE = /^[a-f0-9]{64}$/i;

const resolveBlockfrostKey = (preferredEnv, alternateEnv) => {
  const preferred = (process.env[preferredEnv] || '').trim();
  if (preferred && preferred !== 'your-blockfrost-project-id') {
    return preferred;
  }
  const alternate = (process.env[alternateEnv] || '').trim();
  if (alternate && alternate !== 'your-blockfrost-project-id') {
    return alternate;
  }
  return undefined;
};

const resolveKoiosKey = (envKey) => {
  const value = (process.env[envKey] || '').trim();
  if (value && value !== 'your-koios-api-key-here' && value !== 'DUMMY_PREVIEW') {
    return value;
  }
  return undefined;
};

const NETWORKS = [
  {
    name: 'Preview',
    // Preview exercises a genuine same-address self-transfer (account 0 -> 0),
    // which the wallet history labels "Self transfer".
    transferKind: 'self',
    koiosBaseUrl: PREVIEW_KOIOS_BASE,
    blockfrostBaseUrl: PREVIEW_BLOCKFROST_BASE,
    mnemonicEnv: 'LUCEM_INTEGRATION_PREVIEW_MNEMONIC',
    blockfrostApiKeyEnv: 'BLOCKFROST_PREVIEW_PROJECT_ID',
    blockfrostApiKeyAltEnv: 'BLOCKFROST_PROJECT_ID_PREVIEW',
    koiosApiKeyEnv: 'KOIOS_API_KEY_PREVIEW',
  },
  {
    name: 'Preprod',
    // Preprod stays an account 0 -> account 1 transfer.
    transferKind: 'account',
    koiosBaseUrl: PREPROD_KOIOS_BASE,
    blockfrostBaseUrl: PREPROD_BLOCKFROST_BASE,
    mnemonicEnv: 'LUCEM_INTEGRATION_PREPROD_MNEMONIC',
    blockfrostApiKeyEnv: 'BLOCKFROST_PREPROD_PROJECT_ID',
    blockfrostApiKeyAltEnv: 'BLOCKFROST_PROJECT_ID_PREPROD',
    koiosApiKeyEnv: 'KOIOS_API_KEY_PREPROD',
  },
];

NETWORKS.forEach(
  ({
    name,
    transferKind,
    koiosBaseUrl,
    blockfrostBaseUrl,
    mnemonicEnv,
    blockfrostApiKeyEnv,
    blockfrostApiKeyAltEnv,
    koiosApiKeyEnv,
  }) => {
  const phrase = (process.env[mnemonicEnv] || '').trim();
  const blockfrostApiKey = resolveBlockfrostKey(
    blockfrostApiKeyEnv,
    blockfrostApiKeyAltEnv
  );
  const koiosApiKey = resolveKoiosKey(koiosApiKeyEnv);
  const providerType = blockfrostApiKey ? PROVIDER.blockfrost : PROVIDER.koios;
  const txBaseUrl = providerType === PROVIDER.blockfrost ? blockfrostBaseUrl : koiosBaseUrl;
  const txApiKey = providerType === PROVIDER.blockfrost ? blockfrostApiKey : koiosApiKey;
  const describeLive = phrase && validateMnemonic(phrase) ? describe : describe.skip;

  const isSelfTransfer = transferKind === 'self';
  const buildTransfer = isSelfTransfer
    ? buildSignSubmitSelfTransfer
    : buildSignSubmitAccountTransfer;
  const transferLabel = isSelfTransfer
    ? 'account0 self-transfer'
    : 'account0->account1 transfer';

  describeLive(`${name} — 5 tADA ${transferLabel} (Blockfrost preferred)`, () => {
    test('mnemonic is valid BIP-39', () => {
      expect(validateMnemonic(phrase)).toBe(true);
    });

    test('account 0 base address uses testnet bech32', () => {
      const { bech32 } = deriveAccount0Address(phrase);
      expect(bech32).toMatch(/^addr_test1/);
    });

    test('active provider returns protocol parameters', async () => {
      const p = await fetchProtocolParams(txBaseUrl, txApiKey, providerType);
      expect(p.linearFee.minFeeA).toBeTruthy();
      expect(p.slot).toBeGreaterThan(0);
    });

    let submittedHash;

    test(
      `submits signed 5 tADA ${transferLabel}; optional /tx_status poll (LUCEM_INTEGRATION_POLL_TX=1)`,
      async () => {
        const hash = await buildTransfer({
          providerType,
          baseUrl: txBaseUrl,
          apiKey: txApiKey,
          mnemonic: phrase,
          sendLovelace: sendLovelace(),
        });
        expect(hash).toMatch(TX_HASH_RE);
        submittedHash = hash;
        if (shouldPollTx()) {
          const status = await waitForTxStatus({
            baseUrl: koiosBaseUrl,
            apiKey: koiosApiKey,
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

    test(
      'submitted tx appears in /account_txs history (Koios)',
      async () => {
        if (!submittedHash) {
          console.warn('Skipping history check — no submitted tx hash');
          return;
        }
        const row = await waitForTxInAccountHistory({
          baseUrl: koiosBaseUrl,
          apiKey: koiosApiKey,
          mnemonic: phrase,
          txHash: submittedHash,
          maxAttempts: 30,
          delayMs: 3000,
        });
        expect(row.tx_hash.toLowerCase()).toBe(submittedHash.toLowerCase());
        expect(row.block_height).toBeGreaterThan(0);
      },
      120000
    );
  });
}
);
