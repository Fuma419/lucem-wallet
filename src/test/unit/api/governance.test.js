import provider from '../../../config/provider';
import { koiosRequestEnhanced } from '../../../api/util';
import {
  extractGovernanceNarrativeFromMetadataRoot,
  fetchGovernanceOverview,
  isUsableBlockfrostProjectId,
  normalizeDrepKeyHash,
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
    provider.api.key.mockReturnValue({ project_id: 'dummy' });
    koiosRequestEnhanced.mockReset();
    global.fetch = jest.fn();
  });

  test('uses Blockfrost first when project_id is available', async () => {
    provider.api.key.mockReturnValue({ project_id: 'bf_live_key' });

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
    provider.api.key.mockReturnValue({ project_id: 'bf_live_key' });
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
    provider.api.key.mockReturnValue({ project_id: 'bf_live_key' });
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
    expect(normalizeDrepKeyHash(`prefix-${'A'.repeat(56)}-suffix`)).toBe(
      'a'.repeat(56)
    );
    expect(normalizeDrepKeyHash('drep1example')).toBe('');

    expect(isUsableBlockfrostProjectId('bf_key_123')).toBe(true);
    expect(isUsableBlockfrostProjectId('dummy')).toBe(false);
    expect(isUsableBlockfrostProjectId('your-koios-api-key-here')).toBe(false);
  });
});

