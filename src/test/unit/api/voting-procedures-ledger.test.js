/**
 * Ledger encoding of Conway voting procedures (DRep votes).
 */
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const {
  VoteOption,
  VoterType,
} = require('@cardano-foundation/ledgerjs-hw-app-cardano');
const { votingProceduresToLedger } = require('../../../api/util');

const DREP_HASH = 'cc'.repeat(28);
const ACTION_HASH = 'dd'.repeat(32);
const DREP_PATH = [0x80000000 + 1852, 0x80000000 + 1815, 0x80000000, 3, 0];

function votingBody(voteKind = CSL.VoteKind.Yes, index = 2) {
  const credential = CSL.Credential.from_keyhash(
    CSL.Ed25519KeyHash.from_bytes(Buffer.from(DREP_HASH, 'hex'))
  );
  const voter = CSL.Voter.new_drep_credential(credential);
  const actionId = CSL.GovernanceActionId.new(
    CSL.TransactionHash.from_bytes(Buffer.from(ACTION_HASH, 'hex')),
    index
  );
  const builder = CSL.VotingBuilder.new();
  builder.add(voter, actionId, CSL.VotingProcedure.new(voteKind));
  const procedures = builder.build();
  return { voting_procedures: () => procedures };
}

describe('votingProceduresToLedger', () => {
  test('maps an owned DRep vote to KEY_PATH so Ledger witnesses role 3', () => {
    const rows = votingProceduresToLedger(votingBody(CSL.VoteKind.Yes, 2), {
      drep: { hash: DREP_HASH, path: DREP_PATH },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].voter).toEqual({
      type: VoterType.DREP_KEY_PATH,
      keyPath: DREP_PATH,
    });
    expect(rows[0].votes).toEqual([
      {
        govActionId: { txHashHex: ACTION_HASH, govActionIndex: 2 },
        votingProcedure: { vote: VoteOption.YES },
      },
    ]);
  });

  test('maps a foreign DRep as KEY_HASH', () => {
    const rows = votingProceduresToLedger(votingBody(CSL.VoteKind.No), {
      drep: { hash: 'aa'.repeat(28), path: DREP_PATH },
    });
    expect(rows[0].voter).toEqual({
      type: VoterType.DREP_KEY_HASH,
      keyHashHex: DREP_HASH,
    });
    expect(rows[0].votes[0].votingProcedure.vote).toBe(VoteOption.NO);
  });

  test('returns null when the body has no voting procedures', () => {
    expect(votingProceduresToLedger({ voting_procedures: () => null }, {})).toBe(
      null
    );
  });
});
