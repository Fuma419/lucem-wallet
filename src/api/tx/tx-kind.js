/**
 * History categories for a Cardano tx: payment flow (send/receive/internal)
 * plus certificate / vote extras (stake, DRep, governance vote, …).
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
  vote: 'vote',
  drepDelegation: 'drepDelegation',
  drepRegistration: 'drepRegistration',
};

export const TX_KIND_LABEL = {
  withdrawal: 'Reward withdrawal',
  delegation: 'Stake delegation',
  stake: 'Stake registration',
  unstake: 'Stake deregistration',
  poolUpdate: 'Pool update',
  poolRetire: 'Pool retire',
  mint: 'Minting',
  multisig: 'Multi-signature',
  contract: 'Contract',
  vote: 'Vote',
  drepDelegation: 'DRep delegation',
  drepRegistration: 'DRep registration',
};

const certTypeOf = (cert) =>
  String(cert?.cert_type || cert?.type || '').toLowerCase();

const isPoolDelegationCert = (type) =>
  type === 'delegation' ||
  type === 'deleg_reg' ||
  type === 'stake_delegation' ||
  type.includes('stake_reg_deleg') ||
  type.includes('stake_and_vote') ||
  type.includes('stake_vote');

const isDrepDelegationCert = (type) =>
  type.includes('vote_deleg') ||
  type.includes('vote_reg_deleg') ||
  type.includes('stake_and_vote') ||
  type.includes('stake_vote');

const isStakeRegCert = (type) =>
  type === 'stake_registration' ||
  type === 'stake_reg' ||
  type === 'reg_cert' ||
  type.includes('stake_reg_deleg') ||
  type.includes('vote_reg_deleg') ||
  type.includes('stake_vote_reg');

const isStakeUnregCert = (type) =>
  type === 'stake_deregistration' ||
  type === 'stake_dereg' ||
  type === 'unreg_cert';

const isDrepRegCert = (type) =>
  type === 'drep_reg' ||
  type === 'drep_registration' ||
  type === 'drep_update';

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

/**
 * Classify extras from a CSL Transaction (used right after submit, before Koios).
 * @param {object} tx
 * @returns {string[]}
 */
export const classifyCslTx = (tx) => {
  const extra = [];
  if (!tx || typeof tx.body !== 'function') return extra;
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
        if (
          certLooks(cert, 'as_drep_registration') ||
          certLooks(cert, 'as_drep_update')
        ) {
          pushUnique(extra, TX_KIND.drepRegistration);
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

  return {
    delegationCount: types.filter(isPoolDelegationCert).length,
    drepDelegationCount: types.filter(isDrepDelegationCert).length,
    drepRegistrationCount: types.filter(isDrepRegCert).length,
    stakeCertCount: types.filter(
      (t) => isStakeRegCert(t) || isStakeUnregCert(t)
    ).length,
    stakeUnregCount: types.filter(isStakeUnregCert).length,
    poolRetireCount: types.filter(
      (t) => t === 'pool_retirement' || t === 'pool_retire'
    ).length,
    poolUpdateCount: types.filter(
      (t) => t === 'pool_registration' || t === 'pool_update'
    ).length,
    withdrawalCount: withdrawals.length,
    assetMintOrBurnCount: assetsMinted.length,
    voteCount: Array.isArray(votingProcedures) ? votingProcedures.length : 0,
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
 * @returns {string[]}
 */
export const extraFromKoiosInfo = (info = {}, txType = '') => {
  const extra = [];
  if (info.redeemer_count) {
    extra.push(TX_KIND.contract);
  } else if (txType === 'multisig') {
    extra.push(TX_KIND.multisig);
  }
  if (info.withdrawal_count && txType === 'self') extra.push(TX_KIND.withdrawal);
  if (info.delegation_count) extra.push(TX_KIND.delegation);
  if (info.drep_delegation_count) extra.push(TX_KIND.drepDelegation);
  if (info.drep_registration_count) extra.push(TX_KIND.drepRegistration);
  if (info.vote_count) extra.push(TX_KIND.vote);
  if (info.asset_mint_or_burn_count) extra.push(TX_KIND.mint);
  if (info.stake_cert_count && parseInt(info.deposit, 10) >= 0) {
    extra.push(TX_KIND.stake);
  }
  if (info.stake_cert_count && parseInt(info.deposit, 10) < 0) {
    extra.push(TX_KIND.unstake);
  }
  if (info.pool_retire_count) extra.push(TX_KIND.poolRetire);
  if (info.pool_update_count) extra.push(TX_KIND.poolUpdate);
  return extra;
};

export const formatTxKindLabels = (extra = []) =>
  extra
    .map((kind) => TX_KIND_LABEL[kind])
    .filter(Boolean)
    .join(', ');
