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

const isLikelyHexHash = (value, minimumLength = 32) =>
  typeof value === 'string' &&
  value.trim().length >= minimumLength &&
  /^[0-9a-f]+$/i.test(value.trim());

const humanizeSlug = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const GOV_ACTION_BECH32_PREFIX = 'gov_action1';

const isLikelyProposalTxHash = (value) =>
  typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value.trim());

const parseJsonField = (value) => {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
};

const normalizeReferenceEntries = (refs) => {
  if (!Array.isArray(refs)) return [];
  return refs
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const label = firstString(entry.label, entry.title);
      const uri = firstString(entry.uri, entry.reference_uri, entry.url);
      if (!label && !uri) return null;
      return { label, uri };
    })
    .filter(Boolean);
};

/** CIP-108 / Blockfrost json_metadata: narrative lives under body or at root. */
export const extractGovernanceNarrativeFromMetadataRoot = (root) => {
  if (!root || typeof root !== 'object') {
    return {
      title: '',
      summary: '',
      rationale: '',
      motivation: '',
      references: [],
      authors: [],
    };
  }

  const body =
    root.body && typeof root.body === 'object' && !Array.isArray(root.body)
      ? root.body
      : root;

  const title = firstString(body.title, root.title);
  const summary = firstString(
    body.abstract,
    body.summary,
    root.abstract,
    root.summary
  );
  const rationale = firstString(body.rationale, root.rationale);
  const motivation = firstString(body.motivation, root.motivation);
  const references = normalizeReferenceEntries(body.references ?? root.references);
  const authors = Array.isArray(root.authors)
    ? root.authors
        .map((author) =>
          firstString(author?.name, author?.given_name, author?.handle)
        )
        .filter(Boolean)
    : [];

  return { title, summary, rationale, motivation, references, authors };
};

const titleFromUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const parsed = new URL(value);
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    const tailSegment = decodeURIComponent(pathSegments[pathSegments.length - 1] || '');
    const fromPath = humanizeSlug(tailSegment);
    if (fromPath && !isLikelyHexHash(fromPath)) return fromPath;
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
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
    proposal.governance_type,
    proposal.type
  );
  const url = firstString(
    proposal.url,
    proposal.anchor?.url,
    proposal.anchor_url,
    proposal.metadata_url,
    proposal.meta_url
  );
  const metaJsonRoot = parseJsonField(proposal.meta_json);
  const metaNarrative = extractGovernanceNarrativeFromMetadataRoot(metaJsonRoot);
  const titleCandidate = firstString(
    proposal.title,
    proposal.metadata?.title,
    proposal.metadata?.name,
    metaNarrative.title
  );
  const derivedUrlTitle = titleFromUrl(url);
  const title = firstString(
    titleCandidate,
    isLikelyHexHash(derivedUrlTitle) ? '' : derivedUrlTitle,
    id
  );
  const summary = firstString(
    proposal.description,
    proposal.metadata?.abstract,
    proposal.metadata?.summary,
    metaNarrative.summary
  );
  const rationale = firstString(metaNarrative.rationale);
  const motivation = firstString(metaNarrative.motivation);
  const references = metaNarrative.references.length ? metaNarrative.references : [];
  const authors = metaNarrative.authors.length ? metaNarrative.authors : [];
  const anchorHash = firstString(
    proposal.anchor?.hash,
    proposal.anchor_hash,
    proposal.metadata_hash,
    proposal.meta_hash
  );
  const submittedEpoch =
    proposal.proposed_in_epoch ??
    proposal.proposal_epoch ??
    proposal.epoch_no ??
    proposal.proposed_epoch ??
    null;
  const expiresAfterEpoch =
    proposal.expires_after ??
    proposal.expires_epoch ??
    proposal.expire_epoch ??
    proposal.expiration ??
    proposal.expired_epoch ??
    null;

  const rawTx = firstString(proposal.tx_hash, proposal.proposal_tx_hash);
  const txHash = isLikelyProposalTxHash(rawTx) ? rawTx.trim().toLowerCase() : '';
  const certRaw = proposal.cert_index ?? proposal.proposal_index;
  let certIndex = null;
  if (certRaw !== null && certRaw !== undefined && certRaw !== '') {
    const parsedCert = Number(certRaw);
    if (Number.isFinite(parsedCert) && parsedCert >= 0) {
      certIndex = parsedCert;
    }
  }
  const govActionId = firstString(proposal.id, proposal.proposal_id, proposal.gov_action_id);

  return {
    id,
    type: type || 'unknown',
    status: toStatus(proposal),
    title,
    summary,
    rationale,
    motivation,
    references,
    authors,
    url,
    anchorHash,
    submittedEpoch,
    expiresAfterEpoch,
    txHash,
    certIndex,
    govActionId,
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

const fetchBlockfrostJsonMaybe = async (networkId, endpoint, signal) => {
  const normalizedNetwork = normalizeNetworkId(networkId);
  const projectId = provider.api.key(normalizedNetwork)?.project_id;
  if (!isUsableBlockfrostProjectId(projectId)) {
    return null;
  }

  const baseUrl = BLOCKFROST_BASE_URLS[normalizedNetwork];
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        project_id: projectId,
      },
      signal,
    });

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch {
    return null;
  }
};

const resolveProposalMetadataPath = (proposal) => {
  if (
    proposal.txHash &&
    proposal.certIndex !== null &&
    proposal.certIndex !== undefined
  ) {
    return `/governance/proposals/${proposal.txHash}/${proposal.certIndex}/metadata`;
  }
  const gid = firstString(proposal.govActionId);
  if (gid && gid.startsWith(GOV_ACTION_BECH32_PREFIX)) {
    return `/governance/proposals/${encodeURIComponent(gid)}/metadata`;
  }
  return '';
};

const mergeBlockfrostMetadataIntoProposal = (proposal, payload) => {
  if (!payload || typeof payload !== 'object') return proposal;

  const rawMeta = payload.json_metadata;
  const metaRoot =
    typeof rawMeta === 'string' ? parseJsonField(rawMeta) : rawMeta;
  const narrative = extractGovernanceNarrativeFromMetadataRoot(metaRoot);

  const mergedRefs =
    proposal.references?.length > 0 ? proposal.references : narrative.references;
  const mergedAuthors =
    proposal.authors?.length > 0 ? proposal.authors : narrative.authors;

  return {
    ...proposal,
    title: firstString(narrative.title, proposal.title, proposal.id),
    summary: firstString(narrative.summary, proposal.summary),
    rationale: firstString(narrative.rationale, proposal.rationale),
    motivation: firstString(narrative.motivation, proposal.motivation),
    references: mergedRefs,
    authors: mergedAuthors,
    url: firstString(proposal.url, payload.url),
    anchorHash: firstString(proposal.anchorHash, payload.hash),
  };
};

export const enrichProposalsWithBlockfrostMetadata = async (
  networkId,
  proposals,
  options = {}
) => {
  if (!isUsableBlockfrostProjectId(provider.api.key(normalizeNetworkId(networkId))?.project_id)) {
    return proposals;
  }

  const concurrency = Math.max(1, Math.min(options.metadataConcurrency ?? 4, 8));
  const signal = options.signal;
  const next = [...proposals];

  for (let offset = 0; offset < next.length; offset += concurrency) {
    const slice = next.slice(offset, offset + concurrency);
    const enriched = await Promise.all(
      slice.map(async (proposal) => {
        const path = resolveProposalMetadataPath(proposal);
        if (!path) return proposal;

        const payload = await fetchBlockfrostJsonMaybe(networkId, path, signal);
        if (!payload) return proposal;

        return mergeBlockfrostMetadataIntoProposal(proposal, payload);
      })
    );

    for (let index = 0; index < enriched.length; index += 1) {
      next[offset + index] = enriched[index];
    }
  }

  return next;
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

  const proposals = await enrichProposalsWithBlockfrostMetadata(
    networkId,
    normalizeProposals(proposalList),
    options
  );

  return {
    source: 'blockfrost',
    proposals,
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
  const proposals = await enrichProposalsWithBlockfrostMetadata(
    networkId,
    koiosResult.proposals,
    options
  );

  return {
    ...koiosResult,
    proposals,
    fallbackReason: blockfrostError ? blockfrostError.message : '',
  };
};

