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

const scalarToString = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
  return '';
};

const firstString = (...values) => {
  for (const value of values) {
    const normalized = scalarToString(value);
    if (normalized) {
      return normalized;
    }
  }
  return '';
};

const firstText = (...values) => {
  for (const value of values) {
    const normalized = firstString(value);
    if (normalized) {
      return normalized;
    }
    if (value && typeof value === 'object') {
      try {
        const serialized = JSON.stringify(value, null, 2);
        if (serialized) {
          return serialized;
        }
      } catch {
        // Ignore serialization failures and continue.
      }
    }
  }
  return '';
};

const toIntegerOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
};

const toPercentOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const toStatus = (entry) => {
  if (entry == null || typeof entry !== 'object') return 'unknown';
  const directStatus = firstString(entry.status);
  if (directStatus) {
    return directStatus;
  }
  if (toIntegerOrNull(entry.enacted_epoch) !== null || entry.enacted === true) return 'enacted';
  if (toIntegerOrNull(entry.ratified_epoch) !== null || entry.ratified === true) return 'ratified';
  if (toIntegerOrNull(entry.dropped_epoch) !== null || entry.dropped === true) return 'dropped';
  if (toIntegerOrNull(entry.expired_epoch) !== null || entry.expired === true) return 'expired';
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

const resolveProposalIdentifiers = (proposal, index) => {
  const canonicalId = firstString(proposal.proposal_id, proposal.gov_action_id, proposal.id);
  const txHash = firstString(
    proposal.proposal_tx_hash,
    proposal.tx_hash,
    proposal.action_tx_hash
  );
  const certIndexRaw =
    proposal.proposal_index ??
    proposal.cert_index ??
    proposal.action_index ??
    proposal.gov_action_index ??
    null;
  const certIndex =
    certIndexRaw === null || certIndexRaw === undefined || certIndexRaw === ''
      ? null
      : certIndexRaw;
  const legacyId = txHash && certIndex !== null ? `${txHash}#${certIndex}` : '';
  const id = firstString(canonicalId, legacyId, txHash) || `proposal-${index + 1}`;

  return {
    id,
    canonicalId: canonicalId || '',
    legacyId,
    txHash,
    certIndex,
  };
};

export const normalizeDrepKeyHash = (value) => {
  if (typeof value !== 'string') return '';
  const match = value.trim().toLowerCase().match(/[0-9a-f]{56}/);
  return match ? match[0] : '';
};

const normalizeReferences = (references) =>
  asArray(references)
    .map((reference) => {
      if (typeof reference === 'string') {
        const normalized = reference.trim();
        if (!normalized) return null;
        return {
          label: normalized,
          url: normalized,
        };
      }
      if (!reference || typeof reference !== 'object') return null;

      const url = firstString(reference.uri, reference.url, reference.href);
      const label = firstString(reference.label, reference.title, url);
      if (!url && !label) return null;
      return {
        label: label || url,
        url,
      };
    })
    .filter(Boolean);

const normalizeVoteBucket = (summary, prefix) => ({
  yesVotesCast: toIntegerOrNull(summary[`${prefix}_yes_votes_cast`]),
  yesVotePower: firstString(
    summary[`${prefix}_yes_vote_power`],
    summary[`${prefix}_active_yes_vote_power`]
  ),
  yesPct: toPercentOrNull(summary[`${prefix}_yes_pct`]),
  noVotesCast: toIntegerOrNull(summary[`${prefix}_no_votes_cast`]),
  noVotePower: firstString(
    summary[`${prefix}_no_vote_power`],
    summary[`${prefix}_active_no_vote_power`]
  ),
  noPct: toPercentOrNull(summary[`${prefix}_no_pct`]),
  abstainVotesCast: toIntegerOrNull(summary[`${prefix}_abstain_votes_cast`]),
  abstainVotePower: firstString(
    summary[`${prefix}_abstain_vote_power`],
    summary[`${prefix}_active_abstain_vote_power`]
  ),
  abstainPct: toPercentOrNull(summary[`${prefix}_abstain_pct`]),
  notVotedVotesCast: toIntegerOrNull(summary[`${prefix}_not_voted_votes_cast`]),
  notVotedVotePower: firstString(summary[`${prefix}_not_voted_vote_power`]),
  notVotedPct: toPercentOrNull(summary[`${prefix}_not_voted_pct`]),
});

const normalizeVotingSummary = (summary) => {
  if (!summary || typeof summary !== 'object') return null;

  return {
    epoch: toIntegerOrNull(summary.epoch_no),
    proposalType: firstString(summary.proposal_type),
    drep: {
      ...normalizeVoteBucket(summary, 'drep'),
      alwaysAbstainVotePower: firstString(summary.drep_always_abstain_vote_power),
      alwaysNoConfidenceVotePower: firstString(summary.drep_always_no_confidence_vote_power),
    },
    pool: {
      ...normalizeVoteBucket(summary, 'pool'),
      passiveAlwaysAbstainVotesAssigned: toIntegerOrNull(
        summary.pool_passive_always_abstain_votes_assigned
      ),
      passiveAlwaysAbstainVotePower: firstString(summary.pool_passive_always_abstain_vote_power),
      passiveAlwaysNoConfidenceVotesAssigned: toIntegerOrNull(
        summary.pool_passive_always_no_confidence_votes_assigned
      ),
      passiveAlwaysNoConfidenceVotePower: firstString(
        summary.pool_passive_always_no_confidence_vote_power
      ),
    },
    committee: normalizeVoteBucket(summary, 'committee'),
  };
};

const normalizeProposal = (proposal, index) => {
  const { id, canonicalId, legacyId, txHash, certIndex } = resolveProposalIdentifiers(
    proposal,
    index
  );
  const metadataRoot =
    proposal.meta_json && typeof proposal.meta_json === 'object'
      ? proposal.meta_json
      : proposal.metadata && typeof proposal.metadata === 'object'
        ? proposal.metadata
        : {};
  const metadataBody =
    metadataRoot.body && typeof metadataRoot.body === 'object'
      ? metadataRoot.body
      : metadataRoot;
  const type = firstString(
    proposal.proposal_type,
    proposal.gov_action_type,
    proposal.type
  );
  const title = firstString(
    proposal.title,
    metadataBody.title,
    proposal.metadata?.title,
    proposal.anchor?.url,
    proposal.anchor_url,
    id
  );
  const summary = firstText(
    metadataBody.abstract,
    proposal.description,
    proposal.metadata?.abstract,
    proposal.meta_comment,
    proposal.anchor?.hash,
    proposal.anchor_hash
  );
  const rationale = firstText(metadataBody.rationale, proposal.rationale);
  const motivation = firstText(metadataBody.motivation, proposal.motivation);
  const references = normalizeReferences(metadataBody.references);
  const url = firstString(
    proposal.url,
    proposal.anchor?.url,
    proposal.anchor_url,
    proposal.metadata_url,
    proposal.meta_url
  );
  const actionDetails =
    proposal.proposal_description ??
    proposal.param_proposal ??
    proposal.data_json ??
    metadataBody.onChain ??
    null;
  const submittedEpoch = toIntegerOrNull(
    proposal.proposed_in_epoch ??
      proposal.proposal_epoch ??
      proposal.proposed_epoch ??
      proposal.epoch_no
  );
  const expiresAfterEpoch = toIntegerOrNull(
    proposal.expires_after ?? proposal.expires_epoch ?? proposal.expire_epoch ?? proposal.expiration
  );
  const expirationEpoch = toIntegerOrNull(proposal.expiration);
  const ratifiedEpoch = toIntegerOrNull(proposal.ratified_epoch);
  const enactedEpoch = toIntegerOrNull(proposal.enacted_epoch);
  const droppedEpoch = toIntegerOrNull(proposal.dropped_epoch);
  const expiredEpoch = toIntegerOrNull(proposal.expired_epoch);
  const metadataHash = firstString(
    proposal.meta_hash,
    proposal.anchor?.hash,
    proposal.anchor_hash
  );
  const metadataLanguage = firstString(proposal.meta_language);
  const metadataIsValid =
    typeof proposal.meta_is_valid === 'boolean' ? proposal.meta_is_valid : null;
  const returnAddress = firstString(proposal.return_address);
  const deposit = firstString(proposal.deposit);
  const withdrawal = firstText(proposal.withdrawal);

  return {
    id,
    canonicalId,
    legacyId,
    txHash,
    certIndex,
    type: type || 'unknown',
    status: toStatus(proposal),
    title,
    summary,
    abstract: firstText(metadataBody.abstract),
    rationale,
    motivation,
    references,
    actionDetails,
    url,
    metadataHash,
    metadataLanguage,
    metadataIsValid,
    returnAddress,
    deposit,
    withdrawal,
    submittedEpoch,
    expiresAfterEpoch,
    expirationEpoch,
    ratifiedEpoch,
    enactedEpoch,
    droppedEpoch,
    expiredEpoch,
    voteSummary: null,
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

const proposalLookupKeys = (proposal) =>
  [proposal.id, proposal.canonicalId, proposal.legacyId, proposal.txHash]
    .map((value) => scalarToString(value).toLowerCase())
    .filter(Boolean);

const buildProposalLookup = (proposals) => {
  const lookup = new Map();
  proposals.forEach((proposal) => {
    proposalLookupKeys(proposal).forEach((key) => {
      lookup.set(key, proposal);
    });
  });
  return lookup;
};

const mergeProposalData = (baseProposal, incomingProposal) => {
  if (!incomingProposal) return baseProposal;

  return {
    ...baseProposal,
    canonicalId: baseProposal.canonicalId || incomingProposal.canonicalId,
    legacyId: baseProposal.legacyId || incomingProposal.legacyId,
    txHash: baseProposal.txHash || incomingProposal.txHash,
    certIndex:
      baseProposal.certIndex !== null && baseProposal.certIndex !== undefined
        ? baseProposal.certIndex
        : incomingProposal.certIndex,
    type: baseProposal.type !== 'unknown' ? baseProposal.type : incomingProposal.type,
    status:
      baseProposal.status !== 'unknown' ? baseProposal.status : incomingProposal.status,
    title: incomingProposal.title || baseProposal.title,
    summary: incomingProposal.summary || baseProposal.summary,
    abstract: incomingProposal.abstract || baseProposal.abstract,
    rationale: incomingProposal.rationale || baseProposal.rationale,
    motivation: incomingProposal.motivation || baseProposal.motivation,
    references:
      incomingProposal.references && incomingProposal.references.length > 0
        ? incomingProposal.references
        : baseProposal.references,
    actionDetails:
      incomingProposal.actionDetails !== null && incomingProposal.actionDetails !== undefined
        ? incomingProposal.actionDetails
        : baseProposal.actionDetails,
    url: baseProposal.url || incomingProposal.url,
    metadataHash: baseProposal.metadataHash || incomingProposal.metadataHash,
    metadataLanguage: incomingProposal.metadataLanguage || baseProposal.metadataLanguage,
    metadataIsValid:
      incomingProposal.metadataIsValid !== null && incomingProposal.metadataIsValid !== undefined
        ? incomingProposal.metadataIsValid
        : baseProposal.metadataIsValid,
    returnAddress: incomingProposal.returnAddress || baseProposal.returnAddress,
    deposit: incomingProposal.deposit || baseProposal.deposit,
    withdrawal: incomingProposal.withdrawal || baseProposal.withdrawal,
    submittedEpoch:
      baseProposal.submittedEpoch !== null && baseProposal.submittedEpoch !== undefined
        ? baseProposal.submittedEpoch
        : incomingProposal.submittedEpoch,
    expiresAfterEpoch:
      baseProposal.expiresAfterEpoch !== null && baseProposal.expiresAfterEpoch !== undefined
        ? baseProposal.expiresAfterEpoch
        : incomingProposal.expiresAfterEpoch,
    expirationEpoch:
      baseProposal.expirationEpoch !== null && baseProposal.expirationEpoch !== undefined
        ? baseProposal.expirationEpoch
        : incomingProposal.expirationEpoch,
    ratifiedEpoch:
      baseProposal.ratifiedEpoch !== null && baseProposal.ratifiedEpoch !== undefined
        ? baseProposal.ratifiedEpoch
        : incomingProposal.ratifiedEpoch,
    enactedEpoch:
      baseProposal.enactedEpoch !== null && baseProposal.enactedEpoch !== undefined
        ? baseProposal.enactedEpoch
        : incomingProposal.enactedEpoch,
    droppedEpoch:
      baseProposal.droppedEpoch !== null && baseProposal.droppedEpoch !== undefined
        ? baseProposal.droppedEpoch
        : incomingProposal.droppedEpoch,
    expiredEpoch:
      baseProposal.expiredEpoch !== null && baseProposal.expiredEpoch !== undefined
        ? baseProposal.expiredEpoch
        : incomingProposal.expiredEpoch,
  };
};

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

const fetchKoiosProposalList = async (proposalLimit, signal) =>
  koiosRequestEnhanced(`/proposal_list?limit=${proposalLimit}&offset=0`, {}, undefined, signal);

const fetchKoiosVotingSummary = async (proposalId, signal) => {
  const normalizedProposalId = firstString(proposalId);
  if (!normalizedProposalId) return null;

  try {
    const summary = await koiosRequestEnhanced(
      `/proposal_voting_summary?_proposal_id=${encodeURIComponent(normalizedProposalId)}`,
      {},
      undefined,
      signal
    );
    const firstResult = asArray(summary)[0];
    return normalizeVotingSummary(firstResult);
  } catch {
    return null;
  }
};

const attachVotingSummaries = async (proposals, signal) =>
  Promise.all(
    proposals.map(async (proposal) => {
      const candidateIds = Array.from(
        new Set([proposal.canonicalId, proposal.id, proposal.legacyId].filter(Boolean))
      );

      for (const candidateId of candidateIds) {
        const voteSummary = await fetchKoiosVotingSummary(candidateId, signal);
        if (voteSummary) {
          return {
            ...proposal,
            voteSummary,
          };
        }
        if (signal?.aborted) {
          break;
        }
      }

      return proposal;
    })
  );

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

  const blockfrostProposals = normalizeProposals(proposalList);
  let mergedProposals = blockfrostProposals;

  try {
    const koiosProposalList = await fetchKoiosProposalList(proposalLimit, options.signal);
    const koiosProposals = normalizeProposals(koiosProposalList);
    const proposalLookup = buildProposalLookup(koiosProposals);
    mergedProposals = blockfrostProposals.map((proposal) => {
      const match = proposalLookupKeys(proposal)
        .map((key) => proposalLookup.get(key))
        .find(Boolean);
      return match ? mergeProposalData(proposal, match) : proposal;
    });
  } catch {
    // Optional enrichment only.
  }

  const proposalsWithVotes = await attachVotingSummaries(mergedProposals, options.signal);

  return {
    source: 'blockfrost',
    proposals: proposalsWithVotes,
    dreps: normalizeDreps(drepList),
  };
};

const fetchKoiosGovernance = async (options) => {
  const proposalLimit = Math.max(1, Math.min(options.proposalLimit ?? 12, 50));
  const drepLimit = Math.max(1, Math.min(options.drepLimit ?? 20, 50));

  const [proposalList, drepList] = await Promise.all([
    fetchKoiosProposalList(proposalLimit, options.signal),
    koiosRequestEnhanced(`/drep_list?limit=${drepLimit}&offset=0`, {}, undefined, options.signal),
  ]);
  const proposalsWithVotes = await attachVotingSummaries(
    normalizeProposals(proposalList),
    options.signal
  );

  return {
    source: 'koios',
    proposals: proposalsWithVotes,
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

