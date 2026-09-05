import provider from '../../../config/provider';
import { koiosRequestEnhanced } from '../../../api/util';
import Loader from '../../../api/loader';
import {
  DREP_NOT_REGISTERED,
  bech32IdsForDrepKeyHash,
  ensureDrepRegisteredForDelegation,
  extractGovernanceNarrativeFromMetadataRoot,
  fetchDRepRegistration,
  fetchGovernanceOverview,
  isUsableBlockfrostProjectId,
  normalizeDrepKeyHash,
  parseDrepKeyHash,
} from '../../../api/governance';

jest.mock('../../../config/provider', () => ({
  __esModule: true,
  default: {
    api: {
      key: jest.fn(),
    },
  },
}));

jest.mock('../../../api/util', () => ({
  koiosRequestEnhanced: jest.fn(),
}));

describe('governance API service', () => {
  test('extracts CIP-108 narrative fields from metadata JSON root', () => {
    const narrative = extractGovernanceNarrativeFromMetadataRoot({
      body: {
        title: 'Hardfork example',
        abstract: 'Short summary',
        rationale: 'Testing rationale',
        motivation: 'Testing motivation',
        references: [{ uri: 'https://example.org/doc', label: 'Doc' }],
      },
      authors: [{ name: 'Alice', witness: {} }],
    });

    expect(narrative.title).toBe('Hardfork example');
    expect(narrative.summary).toBe('Short summary');
    expect(narrative.rationale).toBe('Testing rationale');
    expect(narrative.motivation).toBe('Testing motivation');
    expect(narrative.references).toEqual([
      expect.objectContaining({ uri: 'https://example.org/doc', label: 'Doc' }),
    ]);
    expect(narrative.authors).toEqual(['Alice']);
  });

  beforeEach(() => {
    provider.api.key.mockReset();
    provider.api.key.mockReturnValue({
      project_id: 'dummy',
      blockfrost_project_id: undefined,
    });
    koiosRequestEnhanced.mockReset();
    global.fetch = jest.fn();
  });

  test('uses Blockfrost first when blockfrost_project_id is available', async () => {
    provider.api.key.mockReturnValue({
      project_id: 'koios_should_not_be_used_for_bf',
      blockfrost_project_id: 'bf_live_key',
    });

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [
          { gov_action_id: 'proposal-1', proposal_type: 'parameter_change' },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [{ drep_id: 'a'.repeat(56), active_stake: '1234' }],
      });

    const result = await fetchGovernanceOverview('preprod', {
      proposalLimit: 3,
      drepLimit: 2,
    });

    expect(result.source).toBe('blockfrost');
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].id).toBe('proposal-1');
    expect(result.dreps[0].keyHashHex).toBe('a'.repeat(56));
    expect(koiosRequestEnhanced).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/governance/proposals?order=desc&count=3&page=1'),
      expect.objectContaining({
        headers: expect.objectContaining({ project_id: 'bf_live_key' }),
      })
    );
  });

  test('loads Blockfrost proposal metadata for CIP-108 abstract and rationale', async () => {
    provider.api.key.mockReturnValue({
      project_id: 'koios_token',
      blockfrost_project_id: 'bf_live_key',
    });
    const txHash = `${'c'.repeat(64)}`;

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [
          {
            id: 'gov_action1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqvrsnmqq',
            tx_hash: txHash,
            cert_index: 1,
            governance_type: 'info_action',
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [{ drep_id: 'd'.repeat(56), active_stake: '99' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          url: 'https://example.test/proposal.json',
          hash: 'e'.repeat(64),
          json_metadata: {
            body: {
              title: 'Resolved title',
              abstract: 'Resolved abstract',
              rationale: 'Resolved rationale',
              motivation: 'Resolved motivation',
            },
          },
        }),
      });

    const result = await fetchGovernanceOverview('preview', {
      proposalLimit: 3,
      drepLimit: 2,
    });

    expect(result.source).toBe('blockfrost');
    expect(result.proposals[0].title).toBe('Resolved title');
    expect(result.proposals[0].summary).toBe('Resolved abstract');
    expect(result.proposals[0].rationale).toBe('Resolved rationale');
    expect(result.proposals[0].motivation).toBe('Resolved motivation');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch.mock.calls[2][0]).toContain(
      `/governance/proposals/${txHash}/1/metadata`
    );
  });

  test('falls back to Koios when Blockfrost key is missing', async () => {
    koiosRequestEnhanced
      .mockResolvedValueOnce([{ proposal_id: 'koios-proposal' }])
      .mockResolvedValueOnce([{ drep_id: 'b'.repeat(56), active_stake: '2' }]);

    const result = await fetchGovernanceOverview('mainnet', {
      proposalLimit: 4,
      drepLimit: 4,
    });

    expect(result.source).toBe('koios');
    expect(result.fallbackReason).toMatch(/missing/i);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(koiosRequestEnhanced).toHaveBeenCalledTimes(2);
    expect(result.proposals[0].id).toBe('koios-proposal');
  });

  test('falls back to Koios when Blockfrost request errors', async () => {
    provider.api.key.mockReturnValue({
      project_id: 'koios_token',
      blockfrost_project_id: 'bf_live_key',
    });
    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [],
      });

    koiosRequestEnhanced
      .mockResolvedValueOnce([{ proposal_id: 'fallback-proposal' }])
      .mockResolvedValueOnce([{ drep_id: 'c'.repeat(56), active_stake: '10' }]);

    const result = await fetchGovernanceOverview('preview');

    expect(result.source).toBe('koios');
    expect(result.fallbackReason).toMatch(/Blockfrost governance request failed/);
    expect(result.proposals[0].id).toBe('fallback-proposal');
  });

  test('keeps Blockfrost as source when only DRep endpoint fails', async () => {
    provider.api.key.mockReturnValue({
      project_id: 'koios_token',
      blockfrost_project_id: 'bf_live_key',
    });
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [{ proposal_id: 'bf-proposal-1' }],
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => [],
      });

    koiosRequestEnhanced.mockResolvedValueOnce([
      { drep_id: 'c'.repeat(56), active_stake: '10' },
    ]);

    const result = await fetchGovernanceOverview('preview');

    expect(result.source).toBe('blockfrost');
    expect(result.proposals[0].id).toBe('bf-proposal-1');
    expect(result.dreps[0].keyHashHex).toBe('c'.repeat(56));
    expect(result.fallbackReason).toMatch(/DRep list unavailable/i);
    expect(koiosRequestEnhanced).toHaveBeenCalledWith(
      '/drep_list?limit=20&offset=0',
      {},
      undefined,
      undefined,
      'preview'
    );
  });

  test('scopes Koios proposal fetch to the requested network', async () => {
    koiosRequestEnhanced
      .mockResolvedValueOnce([{ proposal_id: 'preprod-proposal' }])
      .mockResolvedValueOnce([]);

    await fetchGovernanceOverview('preprod', { proposalLimit: 5, drepLimit: 5 });

    expect(koiosRequestEnhanced).toHaveBeenNthCalledWith(
      1,
      '/proposal_list?limit=5&offset=0',
      {},
      undefined,
      undefined,
      'preprod'
    );
    expect(koiosRequestEnhanced).toHaveBeenNthCalledWith(
      2,
      '/drep_list?limit=5&offset=0',
      {},
      undefined,
      undefined,
      'preprod'
    );
  });

  test('normalizes proposal fields for clean UI rendering', async () => {
    koiosRequestEnhanced
      .mockResolvedValueOnce([
        {
          proposal_id: 'proposal-clean',
          proposal_type: 'treasury_withdrawal',
          anchor_url: 'https://example.org/governance-actions/treasury-withdrawal',
          anchor_hash: 'f'.repeat(64),
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await fetchGovernanceOverview('mainnet', {
      proposalLimit: 2,
      drepLimit: 1,
    });

    expect(result.source).toBe('koios');
    expect(result.proposals[0]).toEqual(
      expect.objectContaining({
        id: 'proposal-clean',
        type: 'treasury_withdrawal',
        title: 'treasury withdrawal',
        summary: '',
        anchorHash: 'f'.repeat(64),
      })
    );
  });

  test('utility helpers sanitize key hash and detect placeholder keys', () => {
    const keyHashHex = 'aa'.repeat(28);
    const drep = Loader.Cardano.DRep.new_key_hash(
      Loader.Cardano.Ed25519KeyHash.from_bytes(Buffer.from(keyHashHex, 'hex'))
    );
    const cip129 = drep.to_bech32(true);
    expect(cip129.startsWith('drep1')).toBe(true);
    expect(normalizeDrepKeyHash(cip129)).toBe(keyHashHex);
    expect(normalizeDrepKeyHash(`  ${cip129}  `)).toBe(keyHashHex);
    expect(normalizeDrepKeyHash(drep.to_bech32(false))).toBe(keyHashHex);
    expect(normalizeDrepKeyHash(keyHashHex)).toBe(keyHashHex);
    expect(normalizeDrepKeyHash(`prefix-${'A'.repeat(56)}-suffix`)).toBe(
      'a'.repeat(56)
    );
    expect(normalizeDrepKeyHash('drep1example')).toBe('');

    const scriptDrep = Loader.Cardano.DRep.new_script_hash(
      Loader.Cardano.ScriptHash.from_bytes(Buffer.from('bb'.repeat(28), 'hex'))
    );
    expect(parseDrepKeyHash(scriptDrep.to_bech32(true))).toEqual({
      keyHashHex: '',
      reason: 'script_hash',
    });
    expect(
      parseDrepKeyHash(`23${'bb'.repeat(28)}`)
    ).toEqual({ keyHashHex: '', reason: 'script_hash' });

    const cip129Hex = `22${keyHashHex}`;
    expect(cip129Hex).toHaveLength(58);
    expect(parseDrepKeyHash(cip129Hex)).toEqual({
      keyHashHex: keyHashHex,
      reason: 'ok',
    });
    expect(parseDrepKeyHash(`0x${cip129Hex}`)).toEqual({
      keyHashHex: keyHashHex,
      reason: 'ok',
    });
    // Truncating CIP-129 hex to 56 chars keeps the 0x22 header — the bug
    // that produced DelegateeDRepNotRegisteredDELEG for hash 22288b58….
    const truncated = cip129Hex.slice(0, 56);
    expect(truncated.startsWith('22')).toBe(true);
    expect(parseDrepKeyHash(cip129Hex).keyHashHex).not.toBe(truncated);
    expect(parseDrepKeyHash(cip129Hex + 'ff')).toEqual({
      keyHashHex: '',
      reason: 'invalid',
    });

    const droppedByteCredential = `288b58867387e6e809fa5400074d1d825ac557d618bdf26f68177eab`;
    const explorerCip129Hex = `22${droppedByteCredential}`;
    expect(parseDrepKeyHash(explorerCip129Hex).keyHashHex).toBe(
      droppedByteCredential
    );
    expect(explorerCip129Hex.slice(0, 56)).toBe(
      '22288b58867387e6e809fa5400074d1d825ac557d618bdf26f68177e'
    );

    expect(isUsableBlockfrostProjectId('bf_key_123')).toBe(true);
    expect(isUsableBlockfrostProjectId('dummy')).toBe(false);
    expect(isUsableBlockfrostProjectId('DUMMY_PREVIEW')).toBe(false);
    expect(isUsableBlockfrostProjectId('your-koios-api-key-here')).toBe(false);
  });

  test('drops retired DReps from the overview list', async () => {
    koiosRequestEnhanced
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { drep_id: 'aa'.repeat(28), active_stake: '10', registered: true },
        { drep_id: 'bb'.repeat(28), active_stake: '99', registered: false },
      ]);

    const result = await fetchGovernanceOverview('preview');
    expect(result.dreps).toHaveLength(1);
    expect(result.dreps[0].keyHashHex).toBe('aa'.repeat(28));
  });

  test('fetchDRepRegistration treats Koios unregistered rows as not registered', async () => {
    koiosRequestEnhanced.mockResolvedValue([
      { registered: false, drep_id: 'drep1x' },
    ]);
    const result = await fetchDRepRegistration('preview', {
      drepIdCip129: 'drep1x',
    });
    expect(result).toEqual(
      expect.objectContaining({
        registered: false,
        lookupFailed: false,
        source: 'koios',
      })
    );
  });

  test('fetchDRepRegistration reports lookupFailed when indexers are down', async () => {
    koiosRequestEnhanced.mockRejectedValue(new Error('koios down'));
    const result = await fetchDRepRegistration('preview', {
      drepIdCip129: 'drep1x',
    });
    expect(result.lookupFailed).toBe(true);
    expect(result.registered).toBe(false);
  });

  test('fetchDRepRegistration treats Blockfrost 404 as not registered', async () => {
    provider.api.key.mockReturnValue({
      project_id: 'koios',
      blockfrost_project_id: 'bf_live_key',
    });
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ status_code: 404 }),
    });
    koiosRequestEnhanced.mockResolvedValue([]);
    const result = await fetchDRepRegistration('preview', {
      drepIdCip129: 'drep1x',
      drepIdLegacy: 'drep1y',
    });
    expect(result.registered).toBe(false);
    expect(result.lookupFailed).toBe(false);
  });

  test('bech32IdsForDrepKeyHash emits CIP-129 and legacy ids', async () => {
    const keyHashHex = 'aa'.repeat(28);
    const ids = await bech32IdsForDrepKeyHash(keyHashHex);
    expect(ids.drepIdCip129.startsWith('drep1')).toBe(true);
    expect(ids.drepIdLegacy.startsWith('drep_vkh1') || ids.drepIdLegacy.startsWith('drep1')).toBe(
      true
    );
    expect(ids.drepIdCip129).not.toBe(ids.drepIdLegacy);
    expect(parseDrepKeyHash(ids.drepIdCip129).keyHashHex).toBe(keyHashHex);
  });

  test('ensureDrepRegisteredForDelegation throws when the DRep is not registered', async () => {
    koiosRequestEnhanced.mockResolvedValue([]);
    await expect(
      ensureDrepRegisteredForDelegation('preview', 'aa'.repeat(28))
    ).rejects.toThrow(DREP_NOT_REGISTERED);
  });

  test('ensureDrepRegisteredForDelegation allows build when lookup fails', async () => {
    koiosRequestEnhanced.mockRejectedValue(new Error('koios down'));
    await expect(
      ensureDrepRegisteredForDelegation('preview', 'aa'.repeat(28))
    ).resolves.toBeUndefined();
  });
});

