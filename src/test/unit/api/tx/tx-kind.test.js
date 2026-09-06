const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const {
  TX_KIND,
  TX_KIND_LABEL,
  classifyCslTx,
  extraFromKoiosInfo,
  formatTxKindLabels,
  koiosKindCounts,
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
    expect(TX_KIND_LABEL[TX_KIND.vote]).toBe('Vote');
    expect(TX_KIND_LABEL[TX_KIND.drepDelegation]).toBe('DRep delegation');
    expect(formatTxKindLabels(['delegation', 'vote'])).toBe(
      'Stake delegation, Vote'
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
});
