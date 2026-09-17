/**
 * History categories for a Cardano tx: payment flow (send/receive/internal)
 * plus certificate / vote / asset extras.
 *
 * Taxonomy follows Yoroi's operation picker (certs → votes → mint → swap →
 * payment) and Lace's extra kinds (delegation, stake, unstake, contract),
 * plus native-asset send/receive which those wallets surface as token deltas.
 */

export const TX_KIND = {
  contract: 'contract',
  multisig: 'multisig',
  withdrawal: 'withdrawal',
  delegation: 'delegation',
  stake: 'stake',
  unstake: 'unstake',
  poolUpdate: 'poolUpdate',
  poolRetire: 'poolRetire',
  mint: 'mint',
  burn: 'burn',
  vote: 'vote',
  catalystVote: 'catalystVote',
  proposal: 'proposal',
  drepDelegation: 'drepDelegation',
  drepRegistration: 'drepRegistration',
  drepDeregistration: 'drepDeregistration',
  drepUpdate: 'drepUpdate',
  committeeHot: 'committeeHot',
  committeeCold: 'committeeCold',
  mir: 'mir',
  swap: 'swap',
  assetSend: 'assetSend',
  assetReceive: 'assetReceive',
  assetSelf: 'assetSelf',
  assetTransfer: 'assetTransfer',
};

export const TX_KIND_LABEL = {
  withdrawal: 'Reward withdrawal',
  delegation: 'Stake delegation',
  stake: 'Stake registration',
  unstake: 'Stake deregistration',
  poolUpdate: 'Pool update',
  poolRetire: 'Pool retire',
  mint: 'Minting',
  burn: 'Burning',
  multisig: 'Multi-signature',
  contract: 'Contract',
  vote: 'Governance vote',
  catalystVote: 'Catalyst vote',
  proposal: 'Governance proposal',
  drepDelegation: 'DRep delegation',
  drepRegistration: 'DRep registration',
  drepDeregistration: 'DRep deregistration',
  drepUpdate: 'DRep update',
  committeeHot: 'Committee authorization',
  committeeCold: 'Committee resignation',
  mir: 'Treasury / reserves',
  swap: 'Swap',
  assetSend: 'Send assets',
  assetReceive: 'Receive assets',
  assetSelf: 'Asset transfer',
  assetTransfer: 'Asset transfer',
};

export const TX_FLOW_LABEL = {
  self: 'Self transfer',
  internalIn: 'Internal receive',
  internalOut: 'Internal send',
  externalIn: 'Receive',
  externalOut: 'Send',
  multisig: 'Multi-signature',
};

/** CIP-36 / CIP-15 Catalyst registration labels. */
export const CIP36_METADATA_LABELS = new Set(['61284', '61285', '61286']);
const CIP20_METADATA_LABEL = '674';
const SWAP_HINTS = [
  'swap',
  'minswap',
  'sundae',
  'wingriders',
  'muesli',
  'vyfi',
  'splash',
  'cswap',
  'dexhunter',
];

const KIND_PRIORITY = [
  TX_KIND.unstake,
  TX_KIND.vote,
  TX_KIND.catalystVote,
  TX_KIND.proposal,
  TX_KIND.drepDelegation,
  TX_KIND.delegation,
  TX_KIND.stake,
  TX_KIND.drepRegistration,
  TX_KIND.drepDeregistration,
  TX_KIND.drepUpdate,
  TX_KIND.committeeHot,
  TX_KIND.committeeCold,
  TX_KIND.withdrawal,
  TX_KIND.burn,
  TX_KIND.mint,
  TX_KIND.poolUpdate,
  TX_KIND.poolRetire,
  TX_KIND.mir,
  TX_KIND.swap,
  TX_KIND.contract,
  TX_KIND.assetSend,
  TX_KIND.assetReceive,
  TX_KIND.assetSelf,
  TX_KIND.assetTransfer,
  TX_KIND.multisig,
];

const certTypeOf = (cert) =>
  String(cert?.cert_type || cert?.type || '').toLowerCase();

const isPoolDelegationCert = (type) =>
  type === 'delegation' ||
  type === 'deleg_reg' ||
  type === 'stake_delegation' ||
  type.includes('stake_reg_deleg') ||
  type.includes('stake_and_vote') ||
  type.includes('stake_vote_deleg') ||
  type.includes('stake_vote_reg');

const isDrepDelegationCert = (type) =>
  type === 'vote_deleg' ||
  type.includes('vote_deleg') ||
  type.includes('vote_reg_deleg') ||
  type.includes('stake_and_vote') ||
  type.includes('stake_vote');

const isStakeRegCert = (type) =>
  type === 'stake_registration' ||
  type === 'stake_reg' ||
  type === 'reg_cert' ||
  type === 'reg' ||
  type.includes('stake_reg_deleg') ||
  type.includes('vote_reg_deleg') ||
  type.includes('stake_vote_reg');

const isStakeUnregCert = (type) =>
  type === 'stake_deregistration' ||
  type === 'stake_dereg' ||
  type === 'unreg_cert' ||
  type === 'unreg' ||
  type === 'stake_unreg';

const isDrepRegCert = (type) =>
  type === 'drep_reg' ||
  type === 'drep_registration' ||
  type === 'reg_drep';

const isDrepUnregCert = (type) =>
  type === 'drep_unreg' ||
  type === 'drep_deregistration' ||
  type === 'unreg_drep';

const isDrepUpdateCert = (type) =>
  type === 'drep_update' || type === 'update_drep';

const isCommitteeHotCert = (type) =>
  type.includes('committee_hot') || type.includes('auth_committee');

const isCommitteeColdCert = (type) =>
  type.includes('committee_cold') || type.includes('resign_committee');

const isMirCert = (type) =>
  type.includes('mir') || type.includes('move_instantaneous');

const isProposalCert = (type) =>
  type.includes('param_proposal') || type.includes('parameter_change');

const pushUnique = (list, kind) => {
  if (kind && !list.includes(kind)) list.push(kind);
};

const certLooks = (cert, reader) => {
  try {
    const value = cert?.[reader]?.();
    return Boolean(value);
  } catch {
    return false;
  }
};

const countList = (value) => {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
};

const toInt = (value) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
};

const quantityOf = (asset) => {
  try {
    return BigInt(asset?.quantity ?? 0);
  } catch {
    return 0n;
  }
};

/**
 * Flatten Koios / Blockfrost metadata into `{ label, json_metadata }[]`.
 */
export const listMetadataItems = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (item == null) return null;
        if (item.label != null) {
          return {
            label: String(item.label),
            json_metadata: item.json_metadata ?? item.json ?? item.map_json,
          };
        }
        return null;
      })
      .filter(Boolean);
  }
  const source =
    raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? raw.metadata
      : raw;
  if (typeof source !== 'object' || Array.isArray(source) || source == null) {
    return [];
  }
  return Object.entries(source)
    .filter(([key]) => key !== 'tx_hash')
    .map(([label, json_metadata]) => ({ label: String(label), json_metadata }));
};

const metadataHasLabels = (items, labels) =>
  items.some((item) => labels.has(String(item.label)));

const metadataLooksLikeSwap = (items) => {
  const blobs = items
    .filter(
      (item) =>
        String(item.label) === CIP20_METADATA_LABEL ||
        String(item.label) === 'msg'
    )
    .map((item) => JSON.stringify(item.json_metadata || '').toLowerCase());
  if (!blobs.length) return false;
  const text = blobs.join(' ');
  return SWAP_HINTS.some((hint) => text.includes(hint));
};

const cslMetadataHasLabels = (tx, labels) => {
  try {
    const aux =
      typeof tx.auxiliary_data === 'function' ? tx.auxiliary_data() : null;
    if (!aux || typeof aux.metadata !== 'function') return false;
    const md = aux.metadata();
    if (!md || typeof md.keys !== 'function') return false;
    const keys = md.keys();
    if (!keys || typeof keys.len !== 'function') return false;
    for (let i = 0; i < keys.len(); i++) {
      const key = keys.get(i);
      const n = typeof key?.to_str === 'function' ? key.to_str() : String(key);
      if (labels.has(String(n))) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
};

/**
 * Classify extras from a CSL Transaction (used right after submit, before Koios).
 * @param {object} tx
 * @returns {string[]}
 */
export const classifyCslTx = (tx) => {
  const extra = [];
  if (!tx || typeof tx.body !== 'function') {
    if (cslMetadataHasLabels(tx, CIP36_METADATA_LABELS)) {
      extra.push(TX_KIND.catalystVote);
    }
    return extra;
  }
  let body;
  try {
    body = tx.body();
  } catch {
    return extra;
  }
  if (!body) return extra;

  try {
    const certs = typeof body.certs === 'function' ? body.certs() : null;
    if (certs && typeof certs.len === 'function') {
      for (let i = 0; i < certs.len(); i++) {
        const cert = certs.get(i);
        if (
          certLooks(cert, 'as_stake_delegation') ||
          certLooks(cert, 'as_stake_registration_and_delegation') ||
          certLooks(cert, 'as_stake_and_vote_delegation') ||
          certLooks(cert, 'as_stake_vote_registration_and_delegation')
        ) {
          pushUnique(extra, TX_KIND.delegation);
        }
        if (
          certLooks(cert, 'as_stake_registration') ||
          certLooks(cert, 'as_reg_cert') ||
          certLooks(cert, 'as_stake_registration_and_delegation') ||
          certLooks(cert, 'as_vote_registration_and_delegation') ||
          certLooks(cert, 'as_stake_vote_registration_and_delegation')
        ) {
          pushUnique(extra, TX_KIND.stake);
        }
        if (
          certLooks(cert, 'as_stake_deregistration') ||
          certLooks(cert, 'as_unreg_cert')
        ) {
          pushUnique(extra, TX_KIND.unstake);
        }
        if (
          certLooks(cert, 'as_vote_delegation') ||
          certLooks(cert, 'as_vote_registration_and_delegation') ||
          certLooks(cert, 'as_stake_and_vote_delegation') ||
          certLooks(cert, 'as_stake_vote_registration_and_delegation')
        ) {
          pushUnique(extra, TX_KIND.drepDelegation);
        }
        if (certLooks(cert, 'as_drep_registration')) {
          pushUnique(extra, TX_KIND.drepRegistration);
        }
        if (certLooks(cert, 'as_drep_deregistration')) {
          pushUnique(extra, TX_KIND.drepDeregistration);
        }
        if (certLooks(cert, 'as_drep_update')) {
          pushUnique(extra, TX_KIND.drepUpdate);
        }
        if (certLooks(cert, 'as_committee_hot_auth')) {
          pushUnique(extra, TX_KIND.committeeHot);
        }
        if (certLooks(cert, 'as_committee_cold_resign')) {
          pushUnique(extra, TX_KIND.committeeCold);
        }
        if (
          certLooks(cert, 'as_pool_registration') ||
          certLooks(cert, 'as_pool_update')
        ) {
          pushUnique(extra, TX_KIND.poolUpdate);
        }
        if (certLooks(cert, 'as_pool_retirement')) {
          pushUnique(extra, TX_KIND.poolRetire);
        }
        if (certLooks(cert, 'as_move_instantaneous_rewards_cert')) {
          pushUnique(extra, TX_KIND.mir);
        }
      }
    }
  } catch {
    // Unknown cert layout — still classify votes / withdrawals below.
  }

  try {
    const votes =
      typeof body.voting_procedures === 'function'
        ? body.voting_procedures()
        : null;
    if (votes && typeof votes.len === 'function' && votes.len() > 0) {
      pushUnique(extra, TX_KIND.vote);
    }
  } catch {
    /* ignore */
  }

  try {
    const proposals =
      (typeof body.voting_proposals === 'function' && body.voting_proposals()) ||
      (typeof body.proposal_procedures === 'function' &&
        body.proposal_procedures());
    if (proposals && typeof proposals.len === 'function' && proposals.len() > 0) {
      pushUnique(extra, TX_KIND.proposal);
    }
  } catch {
    /* ignore */
  }

  try {
    const withdrawals =
      typeof body.withdrawals === 'function' ? body.withdrawals() : null;
    if (withdrawals && typeof withdrawals.len === 'function' && withdrawals.len() > 0) {
      pushUnique(extra, TX_KIND.withdrawal);
    }
  } catch {
    /* ignore */
  }

  try {
    const mint = typeof body.mint === 'function' ? body.mint() : null;
    if (mint) pushUnique(extra, TX_KIND.mint);
  } catch {
    /* ignore */
  }

  if (cslMetadataHasLabels(tx, CIP36_METADATA_LABELS)) {
    pushUnique(extra, TX_KIND.catalystVote);
  }

  return extra;
};

/**
 * Counts Koios uses for history extras (certificate + vote fields).
 */
export const koiosKindCounts = (koiosTx = {}) => {
  const certificates = koiosTx.certificates || [];
  const types = certificates.map(certTypeOf);
  const withdrawals = koiosTx.withdrawals || [];
  const assetsMinted = koiosTx.assets_minted || [];
  const plutusContracts = koiosTx.plutus_contracts || [];
  const votingProcedures =
    koiosTx.voting_procedures || koiosTx.votingProcedures || [];
  const proposalProcedures =
    koiosTx.proposal_procedures ||
    koiosTx.proposalProcedures ||
    koiosTx.voting_proposals ||
    [];

  const minted = assetsMinted.filter((asset) => quantityOf(asset) > 0n);
  const burned = assetsMinted.filter((asset) => quantityOf(asset) < 0n);

  return {
    delegationCount: types.filter(isPoolDelegationCert).length,
    drepDelegationCount: types.filter(isDrepDelegationCert).length,
    drepRegistrationCount: types.filter(isDrepRegCert).length,
    drepDeregistrationCount: types.filter(isDrepUnregCert).length,
    drepUpdateCount: types.filter(isDrepUpdateCert).length,
    stakeRegCount: types.filter(isStakeRegCert).length,
    stakeUnregCount: types.filter(isStakeUnregCert).length,
    stakeCertCount: types.filter(
      (t) => isStakeRegCert(t) || isStakeUnregCert(t)
    ).length,
    poolRetireCount: types.filter(
      (t) => t === 'pool_retirement' || t === 'pool_retire'
    ).length,
    poolUpdateCount: types.filter(
      (t) => t === 'pool_registration' || t === 'pool_update' || t === 'pool_reg'
    ).length,
    committeeHotCount: types.filter(isCommitteeHotCert).length,
    committeeColdCount: types.filter(isCommitteeColdCert).length,
    mirCount: types.filter(isMirCert).length,
    proposalCertCount: types.filter(isProposalCert).length,
    withdrawalCount: withdrawals.length,
    assetMintCount: minted.length,
    assetBurnCount: burned.length,
    assetMintOrBurnCount: assetsMinted.length,
    voteCount: countList(votingProcedures),
    proposalCount: countList(proposalProcedures),
    redeemerCount: plutusContracts.reduce(
      (count, contract) =>
        count + (contract.redeemers ? contract.redeemers.length : 0),
      0
    ),
  };
};

/**
 * Map Koios-normalized tx info (+ payment flow type) to history extras.
 * @param {object} info
 * @param {string} [txType]
 * @param {{ hasNativeAssets?: boolean, metadata?: unknown }} [options]
 * @returns {string[]}
 */
export const extraFromKoiosInfo = (info = {}, txType = '', options = {}) => {
  const extra = [];
  const metadataItems = listMetadataItems(
    options.metadata || info.metadata || info.tx_metadata
  );

  if (info.delegation_count) extra.push(TX_KIND.delegation);
  if (info.drep_delegation_count) extra.push(TX_KIND.drepDelegation);
  if (info.drep_registration_count) extra.push(TX_KIND.drepRegistration);
  if (info.drep_deregistration_count) extra.push(TX_KIND.drepDeregistration);
  if (info.drep_update_count) extra.push(TX_KIND.drepUpdate);
  if (info.vote_count) extra.push(TX_KIND.vote);
  if (info.proposal_count || info.proposal_cert_count) extra.push(TX_KIND.proposal);
  if (info.committee_hot_count) extra.push(TX_KIND.committeeHot);
  if (info.committee_cold_count) extra.push(TX_KIND.committeeCold);
  if (info.mir_count) extra.push(TX_KIND.mir);
  if (info.asset_burn_count) extra.push(TX_KIND.burn);
  else if (info.asset_mint_or_burn_count || info.asset_mint_count) {
    extra.push(TX_KIND.mint);
  }
  if (info.stake_unreg_count) extra.push(TX_KIND.unstake);
  else if (info.stake_reg_count) extra.push(TX_KIND.stake);
  else if (info.stake_cert_count) {
    extra.push(toInt(info.deposit) < 0 ? TX_KIND.unstake : TX_KIND.stake);
  }
  if (info.pool_retire_count) extra.push(TX_KIND.poolRetire);
  if (info.pool_update_count) extra.push(TX_KIND.poolUpdate);
  if (info.withdrawal_count) extra.push(TX_KIND.withdrawal);

  if (metadataHasLabels(metadataItems, CIP36_METADATA_LABELS)) {
    extra.push(TX_KIND.catalystVote);
  }
  if (metadataLooksLikeSwap(metadataItems)) extra.push(TX_KIND.swap);

  if (info.redeemer_count) extra.push(TX_KIND.contract);
  else if (txType === 'multisig') extra.push(TX_KIND.multisig);

  const hasNativeAssets = options.hasNativeAssets === true;
  if (
    hasNativeAssets &&
    !extra.includes(TX_KIND.mint) &&
    !extra.includes(TX_KIND.burn)
  ) {
    if (txType === 'externalOut' || txType === 'internalOut') {
      extra.push(TX_KIND.assetSend);
    } else if (txType === 'externalIn' || txType === 'internalIn') {
      extra.push(TX_KIND.assetReceive);
    } else if (txType === 'self' || txType === 'multisig') {
      extra.push(TX_KIND.assetSelf);
    }
  }

  return extra;
};

/**
 * Single list-row kind: certificates / votes beat payment flow, matching Yoroi.
 */
export const primaryTxKind = (extra = [], flowType = '') => {
  const kinds = Array.isArray(extra) ? extra : [];
  for (const kind of KIND_PRIORITY) {
    if (kinds.includes(kind)) return kind;
  }
  return flowType || '';
};

export const historyCategoryLabel = (extra = [], flowType = '') => {
  const primary = primaryTxKind(extra, flowType);
  return (
    TX_KIND_LABEL[primary] ||
    TX_FLOW_LABEL[primary] ||
    'Transaction'
  );
};

export const formatTxKindLabels = (extra = []) =>
  extra
    .map((kind) => TX_KIND_LABEL[kind])
    .filter(Boolean)
    .join(', ');
