/**
 * Behavioral coverage for the transaction builders that power the Staking and
 * Voting (governance) pages. Unlike the source-string-grep UI tests, these
 * exercise the REAL wallet.js builders end-to-end with the actual CSL WASM, so
 * a broken certificate/voting/withdrawal path fails here instead of silently
 * shipping.
 *
 * `getUtxos` and other leaf-module side effects are mocked; everything
 * else (CSL assembly, CIP-21 canonicalization) runs for real.
 */
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');

jest.mock('../../../api/extension/chain-reads', () => ({
  __esModule: true,
  getUtxos: jest.fn(),
}));
jest.mock('../../../api/extension/storage', () => ({
  __esModule: true,
  getNetwork: jest.fn().mockResolvedValue({ id: 'preprod' }),
}));
jest.mock('../../../api/extension/addresses', () => ({
  __esModule: true,
  paymentKeyHashesForSigning: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../api/extension/signing', () => ({
  __esModule: true,
  signTx: jest.fn(),
  signTxHW: jest.fn(),
  submitTx: jest.fn(),
}));

import { getUtxos } from '../../../api/extension/chain-reads';
import { signTxHW, submitTx } from '../../../api/extension/signing';
import {
  delegationTx,
  withdrawalTx,
  undelegateTx,
  voteDelegationTx,
  voteTx,
  signAndSubmitHW,
  wrapSubmitError,
} from '../../../api/extension/wallet';
import { ERROR, isSubmitError, submitErrorMessage } from '../../../config/config';

const TEST_ADDR =
  'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';
const STAKE_KEY_HASH = 'aa'.repeat(28);
const PAYMENT_KEY_HASH = 'ab'.repeat(28);
const POOL_KEY_HASH = 'bb'.repeat(28);
const DREP_KEY_HASH = 'cc'.repeat(28);
const PROPOSAL_TX_HASH = 'dd'.repeat(32);

const PROTOCOL_PARAMS = {
  linearFee: { minFeeA: '44', minFeeB: '155381' },
  poolDeposit: '500000000',
  keyDeposit: '2000000',
  coinsPerUtxoWord: '4310',
  maxValSize: 5000,
  maxTxSize: 16384,
  slot: 50000000,
};

function rewardAddrFor(stakeHashHex) {
  const cred = CSL.Credential.from_keyhash(
    CSL.Ed25519KeyHash.from_bytes(Buffer.from(stakeHashHex, 'hex'))
  );
  return CSL.RewardAddress.new(
    CSL.NetworkInfo.testnet_preprod().network_id(),
    cred
  )
    .to_address()
    .to_bech32();
}

const ACCOUNT = {
  index: 0,
  paymentAddr: TEST_ADDR,
  rewardAddr: rewardAddrFor(STAKE_KEY_HASH),
  stakeKeyHash: STAKE_KEY_HASH,
  paymentKeyHash: PAYMENT_KEY_HASH,
};

function makeUtxo(coin, index = 0) {
  return CSL.TransactionUnspentOutput.new(
    CSL.TransactionInput.new(
      CSL.TransactionHash.from_hex('cc'.repeat(32)),
      index
    ),
    CSL.TransactionOutput.new(
      CSL.Address.from_bech32(TEST_ADDR),
      CSL.Value.new(CSL.BigNum.from_str(String(coin)))
    )
  );
}

function dummyMinFee(tx, vkeyCount) {
  const linearFee = CSL.LinearFee.new(
    CSL.BigNum.from_str(PROTOCOL_PARAMS.linearFee.minFeeA),
    CSL.BigNum.from_str(PROTOCOL_PARAMS.linearFee.minFeeB)
  );
  const body = tx.body();
  const dummyW = CSL.TransactionWitnessSet.new();
  const vkeys = CSL.Vkeywitnesses.new();
  const fixedBody = CSL.FixedTransactionBody.from_bytes(body.to_bytes());
  const txHash = fixedBody.tx_hash();
  for (let i = 0; i < vkeyCount; i += 1) {
    const seed = new Uint8Array(32).fill(0x5c);
    seed[31] = i & 0xff;
    const sk = CSL.PrivateKey.from_normal_bytes(seed);
    vkeys.add(CSL.make_vkey_witness(txHash, sk));
  }
  dummyW.set_vkeys(vkeys);
  return CSL.min_fee(CSL.Transaction.new(body, dummyW), linearFee);
}

function expectFeeCoversDummyVkeys(tx, vkeyCount) {
  expect(tx.body().fee().compare(dummyMinFee(tx, vkeyCount))).toBeGreaterThanOrEqual(
    0
  );
  const rs = tx.body().required_signers();
  expect(!rs || rs.len() === 0).toBe(true);
}

beforeEach(() => {
  getUtxos.mockReset();
  getUtxos.mockResolvedValue([makeUtxo(50_000_000)]);
  signTxHW.mockReset();
  submitTx.mockReset();
});

describe('staking page — delegationTx', () => {
  test('unregistered stake key includes registration + delegation certs', async () => {
    const tx = await delegationTx(
      ACCOUNT,
      { registered: false, active: false },
      PROTOCOL_PARAMS,
      POOL_KEY_HASH
    );
    const certs = tx.body().certs();
    expect(certs).toBeDefined();
    expect(certs.len()).toBe(2);
    expectFeeCoversDummyVkeys(tx, 2);
  });

  test('already-registered stake key includes only the delegation cert', async () => {
    const tx = await delegationTx(
      ACCOUNT,
      { registered: true, active: true },
      PROTOCOL_PARAMS,
      POOL_KEY_HASH
    );
    expect(tx.body().certs().len()).toBe(1);
    expectFeeCoversDummyVkeys(tx, 2);
  });
});

describe('staking page — withdrawalTx', () => {
  test('builds a withdrawal for the reward address when rewards exist', async () => {
    const tx = await withdrawalTx(
      ACCOUNT,
      { rewards: '3450000', delegatedDrep: 'drep_always_abstain' },
      PROTOCOL_PARAMS,
      [makeUtxo(50_000_000)]
    );
    const withdrawals = tx.body().withdrawals();
    expect(withdrawals).toBeDefined();
    expect(withdrawals.len()).toBe(1);
    expectFeeCoversDummyVkeys(tx, 2);
  });

  test('refuses to build a withdrawal without vote delegation', async () => {
    await expect(
      withdrawalTx(
        ACCOUNT,
        { rewards: '3450000' },
        PROTOCOL_PARAMS,
        [makeUtxo(50_000_000)]
      )
    ).rejects.toThrow(/vote delegation/i);
  });
});

describe('staking page — undelegateTx (unstake)', () => {
  test('includes a stake deregistration certificate', async () => {
    const tx = await undelegateTx(
      ACCOUNT,
      { registered: true, active: true, rewards: '0' },
      PROTOCOL_PARAMS
    );
    const certs = tx.body().certs();
    expect(certs).toBeDefined();
    expect(certs.len()).toBe(1);
    expectFeeCoversDummyVkeys(tx, 2);
  });
});

describe('voting page — voteDelegationTx', () => {
  test('delegates voting power to Always Abstain', async () => {
    const tx = await voteDelegationTx(
      ACCOUNT,
      { registered: true },
      PROTOCOL_PARAMS,
      'always_abstain'
    );
    const certs = tx.body().certs();
    expect(certs).toBeDefined();
    expect(certs.len()).toBe(1);
    expectFeeCoversDummyVkeys(tx, 2);
  });

  test('delegates voting power to a specific DRep key hash', async () => {
    const tx = await voteDelegationTx(
      ACCOUNT,
      { registered: true },
      PROTOCOL_PARAMS,
      'key_hash',
      DREP_KEY_HASH
    );
    expect(tx.body().certs().len()).toBe(1);
    expectFeeCoversDummyVkeys(tx, 2);
  });
});

describe('voting page — voteTx (DRep casts a vote)', () => {
  test.each([
    ['yes', CSL.VoteKind.Yes],
    ['no', CSL.VoteKind.No],
    ['abstain', CSL.VoteKind.Abstain],
  ])('records a %s vote in the voting procedures', async (voteKind) => {
    const tx = await voteTx(ACCOUNT, PROTOCOL_PARAMS, {
      drepKeyHashHex: DREP_KEY_HASH,
      proposalTxHash: PROPOSAL_TX_HASH,
      proposalIndex: 0,
      voteKind,
    });
    const votingProcedures = tx.body().voting_procedures();
    expect(votingProcedures).toBeDefined();
    expectFeeCoversDummyVkeys(tx, 3);
  });

  test('rejects a proposal missing its governance action id', async () => {
    await expect(
      voteTx(ACCOUNT, PROTOCOL_PARAMS, {
        drepKeyHashHex: DREP_KEY_HASH,
        proposalTxHash: '',
        proposalIndex: null,
        voteKind: 'yes',
      })
    ).rejects.toThrow(/governance action id/i);
  });
});

describe('shared assembler — all five builders', () => {
  test('each builder produces a canonical body hash', async () => {
    const builders = [
      () =>
        delegationTx(
          ACCOUNT,
          { registered: true, active: true },
          PROTOCOL_PARAMS,
          POOL_KEY_HASH
        ),
      () =>
        withdrawalTx(
          ACCOUNT,
          { rewards: '3450000', delegatedDrep: 'drep_always_abstain' },
          PROTOCOL_PARAMS,
          [makeUtxo(50_000_000)]
        ),
      () =>
        undelegateTx(
          ACCOUNT,
          { registered: true, active: true, rewards: '0' },
          PROTOCOL_PARAMS
        ),
      () =>
        voteDelegationTx(
          ACCOUNT,
          { registered: true },
          PROTOCOL_PARAMS,
          'always_abstain'
        ),
      () =>
        voteTx(ACCOUNT, PROTOCOL_PARAMS, {
          drepKeyHashHex: DREP_KEY_HASH,
          proposalTxHash: PROPOSAL_TX_HASH,
          proposalIndex: 0,
          voteKind: 'yes',
        }),
    ];

    for (const build of builders) {
      const tx = await build();
      const hash = Buffer.from(
        CSL.FixedTransactionBody.from_bytes(tx.body().to_bytes())
          .tx_hash()
          .to_bytes()
      ).toString('hex');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('signAndSubmitHW submit errors', () => {
  test('wrapSubmitError keeps ERROR.submit as code and the provider message', () => {
    const wrapped = wrapSubmitError(new Error('ValueNotConservedUTxO'));
    expect(isSubmitError(wrapped)).toBe(true);
    expect(wrapped.code).toBe(ERROR.submit);
    expect(wrapped.message).toBe('ValueNotConservedUTxO');
    expect(submitErrorMessage(wrapped)).toBe('ValueNotConservedUTxO');
  });

  test('wrapSubmitError humanizes FeeTooSmallUTxO', () => {
    const wrapped = wrapSubmitError(
      new Error('Koios API error: 400 — FeeTooSmallUTxO Mismatch (RelGTEQ)')
    );
    expect(isSubmitError(wrapped)).toBe(true);
    expect(wrapped.message).toMatch(/fee was too small/);
  });

  test('wrapSubmitError humanizes ConwayWdrlNotDelegatedToDRep', () => {
    const wrapped = wrapSubmitError(
      new Error(
        'Transaction submission failed: Koios API error: 400  — {"contents":{"era":"ShelleyBasedEraConway","error":["ConwayWdrlNotDelegatedToDRep (KeyHash {unKeyHash = \\"d2cfce07\\"}"]}'
      )
    );
    expect(isSubmitError(wrapped)).toBe(true);
    expect(wrapped.message).toMatch(/vote delegation/i);
  });

  test('signAndSubmitHW surfaces the provider submit message', async () => {
    const tx = await delegationTx(
      ACCOUNT,
      { registered: true, active: true },
      PROTOCOL_PARAMS,
      POOL_KEY_HASH
    );
    signTxHW.mockResolvedValue(CSL.TransactionWitnessSet.new());
    submitTx.mockRejectedValue(new Error('fee too small'));

    await expect(
      signAndSubmitHW(tx, {
        keyHashes: [PAYMENT_KEY_HASH],
        account: ACCOUNT,
        hw: { device: 'ledger', account: 0 },
      })
    ).rejects.toMatchObject({
      code: ERROR.submit,
      message: 'fee too small',
    });
  });
});
