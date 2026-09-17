const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const {
  TX_KIND,
  TX_KIND_LABEL,
  classifyCslTx,
  extraFromKoiosInfo,
  formatTxKindLabels,
  historyCategoryLabel,
  koiosKindCounts,
  primaryTxKind,
} = require('../../../../api/tx/tx-kind');

const stakeHex = '11'.repeat(28);
const poolHex = '22'.repeat(28);
const drepHex = '33'.repeat(28);

const stakeCred = () =>
  CSL.Credential.from_keyhash(
    CSL.Ed25519KeyHash.from_bytes(Buffer.from(stakeHex, 'hex'))
  );

const poolHash = () =>
  CSL.Ed25519KeyHash.from_bytes(Buffer.from(poolHex, 'hex'));

const drep = () =>
  CSL.DRep.new_key_hash(
    CSL.Ed25519KeyHash.from_bytes(Buffer.from(drepHex, 'hex'))
  );

const txWithCerts = (...certs) => {
  const list = CSL.Certificates.new();
  for (const cert of certs) list.add(cert);
  return {
    body: () => ({
      certs: () => list,
      voting_procedures: () => null,
      withdrawals: () => null,
      mint: () => null,
    }),
  };
};

describe('tx-kind classification', () => {
  test('labels cover the history categories we surface', () => {
    expect(TX_KIND_LABEL[TX_KIND.delegation]).toBe('Stake delegation');
    expect(TX_KIND_LABEL[TX_KIND.vote]).toBe('Governance vote');
    expect(TX_KIND_LABEL[TX_KIND.drepDelegation]).toBe('DRep delegation');
    expect(TX_KIND_LABEL[TX_KIND.assetSend]).toBe('Send assets');
    expect(TX_KIND_LABEL[TX_KIND.catalystVote]).toBe('Catalyst vote');
    expect(formatTxKindLabels(['delegation', 'vote'])).toBe(
      'Stake delegation, Governance vote'
    );
  });

  test('classifies stake delegation certs', () => {
    const extra = classifyCslTx(
      txWithCerts(
        CSL.Certificate.new_stake_delegation(
          CSL.StakeDelegation.new(stakeCred(), poolHash())
        )
      )
    );
    expect(extra).toContain(TX_KIND.delegation);
    expect(extra).not.toContain(TX_KIND.drepDelegation);
  });

  test('classifies DRep (vote) delegation certs', () => {
    const extra = classifyCslTx(
      txWithCerts(
        CSL.Certificate.new_vote_delegation(
          CSL.VoteDelegation.new(stakeCred(), drep())
        )
      )
    );
    expect(extra).toContain(TX_KIND.drepDelegation);
    expect(extra).not.toContain(TX_KIND.vote);
  });

  test('classifies DRep deregistration certs', () => {
    const extra = classifyCslTx(
      txWithCerts(
        CSL.Certificate.new_drep_deregistration(
          CSL.DRepDeregistration.new(stakeCred(), CSL.BigNum.from_str('500000000'))
        )
      )
    );
    expect(extra).toContain(TX_KIND.drepDeregistration);
  });

  test('classifies governance votes from voting_procedures', () => {
    const extra = classifyCslTx({
      body: () => ({
        certs: () => null,
        voting_procedures: () => ({ len: () => 1 }),
        withdrawals: () => null,
        mint: () => null,
      }),
    });
    expect(extra).toEqual([TX_KIND.vote]);
  });

  test('classifies Catalyst CIP-36 metadata as a vote', () => {
    const extra = classifyCslTx({
      body: () => ({
        certs: () => null,
        voting_procedures: () => null,
        withdrawals: () => null,
        mint: () => null,
      }),
      auxiliary_data: () => ({
        metadata: () => ({
          keys: () => ({
            len: () => 1,
            get: () => ({ to_str: () => '61284' }),
          }),
        }),
      }),
    });
    expect(extra).toContain(TX_KIND.catalystVote);
  });

  test('classifies governance proposals from voting_proposals', () => {
    const extra = classifyCslTx({
      body: () => ({
        certs: () => null,
        voting_procedures: () => null,
        voting_proposals: () => ({ len: () => 1 }),
        withdrawals: () => null,
        mint: () => null,
      }),
    });
    expect(extra).toContain(TX_KIND.proposal);
  });
});

describe('koiosKindCounts / extraFromKoiosInfo', () => {
  test('maps pool delegation, DRep delegation, and votes separately', () => {
    const counts = koiosKindCounts({
      certificates: [
        { cert_type: 'delegation' },
        { cert_type: 'vote_deleg' },
      ],
      voting_procedures: [{ vote: 'yes' }],
      withdrawals: [],
      assets_minted: [],
      plutus_contracts: [],
    });
    expect(counts.delegationCount).toBe(1);
    expect(counts.drepDelegationCount).toBe(1);
    expect(counts.voteCount).toBe(1);

    const extra = extraFromKoiosInfo({
      delegation_count: 1,
      drep_delegation_count: 1,
      vote_count: 1,
    });
    expect(extra).toEqual([
      TX_KIND.delegation,
      TX_KIND.drepDelegation,
      TX_KIND.vote,
    ]);
  });

  test('internal send with no certs has no extras', () => {
    expect(extraFromKoiosInfo({}, 'internalOut')).toEqual([]);
  });

  test('labels native-asset sends from the net token delta', () => {
    expect(
      extraFromKoiosInfo({}, 'externalOut', { hasNativeAssets: true })
    ).toEqual([TX_KIND.assetSend]);
    expect(
      extraFromKoiosInfo({}, 'externalIn', { hasNativeAssets: true })
    ).toEqual([TX_KIND.assetReceive]);
  });

  test('detects Catalyst metadata and Conway DRep unregistration', () => {
    const extra = extraFromKoiosInfo(
      {
        drep_deregistration_count: 1,
        metadata: { '61284': { '1': 'vote' } },
      },
      'self'
    );
    expect(extra).toContain(TX_KIND.drepDeregistration);
    expect(extra).toContain(TX_KIND.catalystVote);
  });

  test('uses stake unreg count instead of deposit sign', () => {
    expect(
      extraFromKoiosInfo({ stake_unreg_count: 1, deposit: '2000000' })
    ).toContain(TX_KIND.unstake);
    expect(
      extraFromKoiosInfo({ stake_reg_count: 1, deposit: '-2000000' })
    ).toContain(TX_KIND.stake);
  });
});

describe('primary history label', () => {
  test('prefers a governance vote over a generic send', () => {
    expect(primaryTxKind(['vote', 'assetSend'], 'externalOut')).toBe(
      TX_KIND.vote
    );
    expect(historyCategoryLabel(['vote'], 'externalOut')).toBe(
      'Governance vote'
    );
  });

  test('prefers stake delegation over stake registration', () => {
    expect(primaryTxKind(['stake', 'delegation'], 'self')).toBe(
      TX_KIND.delegation
    );
  });

  test('falls back to payment flow', () => {
    expect(historyCategoryLabel([], 'externalOut')).toBe('Send');
    expect(historyCategoryLabel(['assetSend'], 'externalOut')).toBe(
      'Send assets'
    );
  });
});
