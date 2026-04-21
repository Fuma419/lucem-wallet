import provider from '../config/provider';
import { koiosRequestEnhanced } from './util';

const BLOCKFROST_BASE_URLS = {
  mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
  preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
  preview: 'https://cardano-preview.blockfrost.io/api/v0',
  testnet: 'https://cardano-preprod.blockfrost.io/api/v0',
};

const BLOCKFROST_PLACEHOLDER_KEYS = new Set([
  'dummy',
  'your-koios-api-key-here',
  'your-blockfrost-project-id',
]);

const asArray = (value) => (Array.isArray(value) ? value : []);

const firstString = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const toStatus = (entry) => {
  if (entry == null || typeof entry !== 'object') return 'unknown';
  if (typeof entry.status === 'string' && entry.status.trim()) {
    return entry.status.trim();
  }
  if (entry.ratified === true) return 'ratified';
  if (entry.expired === true) return 'expired';
  if (entry.enacted === true) return 'enacted';
  return 'active';
};

const toSortableStake = (value) => {
  try {
    if (value === null || value === undefined || value === '') {
      return 0n;
    }
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return BigInt(Math.floor(value));
    }
    if (typeof value === 'string') {
      return BigInt(value.trim() || '0');
    }
  } catch {
    /* fall back below */
  }
  return 0n;
};

const normalizeNetworkId = (networkId) =>
  Object.prototype.hasOwnProperty.call(BLOCKFROST_BASE_URLS, networkId)
    ? networkId
    : 'mainnet';

const resolveProposalId = (proposal, index) => {
  const direct = firstString(
    proposal.proposal_id,
    proposal.gov_action_id,
    proposal.id,
    proposal.tx_hash
  );
  if (direct) {
    if (
      proposal.tx_hash &&
      proposal.cert_index !== undefined &&
      proposal.cert_index !== null
    ) {
      return `${proposal.tx_hash}#${proposal.cert_index}`;
    }
    return direct;
  }
  return `proposal-${index + 1}`;
};

export const normalizeDrepKeyHash = (value) => {
  if (typeof value !== 'string') return '';
  const match = value.trim().toLowerCase().match(/[0-9a-f]{56}/);
  return match ? match[0] : '';
};

const normalizeProposal = (proposal, index) => {
  const id = resolveProposalId(proposal, index);
  const type = firstString(
    proposal.proposal_type,
    proposal.gov_action_type,
    proposal.type
  );
  const title = firstString(
    proposal.title,
    proposal.metadata?.title,
    proposal.anchor?.url,
    proposal.anchor_url,
    id
  );
  const summary = firstString(
    proposal.description,
    proposal.metadata?.abstract,
    proposal.anchor?.hash,
    proposal.anchor_hash
  );
  const url = firstString(
    proposal.url,
    proposal.anchor?.url,
    proposal.anchor_url,
    proposal.metadata_url
  );
  const submittedEpoch =
    proposal.proposed_in_epoch ??
    proposal.proposal_epoch ??
    proposal.epoch_no ??
    null;
  const expiresAfterEpoch =
    proposal.expires_after ?? proposal.expires_epoch ?? proposal.expire_epoch ?? null;

  return {
    id,
    type: type || 'unknown',
    status: toStatus(proposal),
    title,
    summary,
    url,
    submittedEpoch,
    expiresAfterEpoch,
  };
};

const normalizeDrep = (drep, index) => {
  const id = firstString(drep.drep_id, drep.id, drep.view, drep.drep);
  const keyHashHex = normalizeDrepKeyHash(
    firstString(
      drep.drep_id_hex,
      drep.drep_hash,
      drep.key_hash,
      drep.hex,
      drep.drep_id,
      drep.id
    )
  );
  const votingPower = firstString(
    String(drep.active_stake ?? ''),
    String(drep.voting_power ?? ''),
    String(drep.amount ?? '')
  );
  const name = firstString(
    drep.metadata?.given_name,
    drep.metadata?.name,
    drep.name
  );
  const url = firstString(drep.url, drep.metadata?.url);

  return {
    id: id || `drep-${index + 1}`,
    keyHashHex,
    name,
    url,
    status: toStatus(drep),
    votingPower: votingPower || '0',
  };
};

const normalizeProposals = (list) =>
  asArray(list).map((proposal, index) => normalizeProposal(proposal, index));

const normalizeDreps = (list) =>
  asArray(list)
    .map((drep, index) => normalizeDrep(drep, index))
    .sort((a, b) =>
      toSortableStake(a.votingPower) < toSortableStake(b.votingPower) ? 1 : -1
    );

export const isUsableBlockfrostProjectId = (projectId) => {
  if (typeof projectId !== 'string') return false;
  const normalized = projectId.trim();
  if (!normalized) return false;
  return !BLOCKFROST_PLACEHOLDER_KEYS.has(normalized.toLowerCase());
};

const fetchBlockfrostJson = async (networkId, endpoint, signal) => {
  const normalizedNetwork = normalizeNetworkId(networkId);
  const projectId = provider.api.key(normalizedNetwork)?.project_id;
  if (!isUsableBlockfrostProjectId(projectId)) {
    throw new Error('Blockfrost project_id is missing');
  }

  const baseUrl = BLOCKFROST_BASE_URLS[normalizedNetwork];
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      project_id: projectId,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `Blockfrost governance request failed (${response.status} ${response.statusText})`
    );
  }

  return response.json();
};

const fetchBlockfrostGovernance = async (networkId, options) => {
  const proposalLimit = Math.max(1, Math.min(options.proposalLimit ?? 12, 50));
  const drepLimit = Math.max(1, Math.min(options.drepLimit ?? 20, 50));

  const [proposalList, drepList] = await Promise.all([
    fetchBlockfrostJson(
      networkId,
      `/governance/proposals?order=desc&count=${proposalLimit}&page=1`,
      options.signal
    ),
    fetchBlockfrostJson(
      networkId,
      `/governance/dreps?order=desc&count=${drepLimit}&page=1`,
      options.signal
    ),
  ]);

  return {
    source: 'blockfrost',
    proposals: normalizeProposals(proposalList),
    dreps: normalizeDreps(drepList),
  };
};

const fetchKoiosGovernance = async (options) => {
  const proposalLimit = Math.max(1, Math.min(options.proposalLimit ?? 12, 50));
  const drepLimit = Math.max(1, Math.min(options.drepLimit ?? 20, 50));

  const [proposalList, drepList] = await Promise.all([
    koiosRequestEnhanced(`/proposal_list?limit=${proposalLimit}&offset=0`, {}, undefined, options.signal),
    koiosRequestEnhanced(`/drep_list?limit=${drepLimit}&offset=0`, {}, undefined, options.signal),
  ]);

  return {
    source: 'koios',
    proposals: normalizeProposals(proposalList),
    dreps: normalizeDreps(drepList),
  };
};

export const fetchGovernanceOverview = async (
  networkId,
  options = { proposalLimit: 12, drepLimit: 20 }
) => {
  let blockfrostError = null;

  try {
    return await fetchBlockfrostGovernance(networkId, options);
  } catch (error) {
    blockfrostError = error;
  }

  const koiosResult = await fetchKoiosGovernance(options);
  return {
    ...koiosResult,
    fallbackReason: blockfrostError ? blockfrostError.message : '',
  };
};

