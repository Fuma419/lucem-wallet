/**
 * Send builder: when UTxOs cannot cover amount + fee, attach a full reward
 * withdrawal so the home headline (UTxO + rewards) is actually spendable.
 *
 * Seeded e2e wallet: 95 ADA UTxO + 5 ADA withdrawable → a 97 ADA send must
 * build; a send that still exceeds 100 ADA must fail.
 */
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');

jest.mock('../../../api/tx/protocol-params', () => {
  const actual = jest.requireActual('../../../api/tx/protocol-params');
  return {
    __esModule: true,
    ...actual,
    fetchKoiosTipSlot: jest.fn().mockResolvedValue(50_000_000),
  };
});
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
jest.mock('../../../api/tx/csl-unsigned-tx', () => {
  const actual = jest.requireActual('../../../api/tx/csl-unsigned-tx');
  return {
    __esModule: true,
    ...actual,
    buildUnsignedSimpleTx: jest.fn((...args) =>
      actual.buildUnsignedSimpleTx(...args)
    ),
  };
});

import { paymentKeyHashesForSigning } from '../../../api/extension/addresses';
import {
  buildTx,
  keyHashesForTx,
  rewardWithdrawalLovelaceFromTx,
} from '../../../api/extension/wallet';
import { buildUnsignedSimpleTx } from '../../../api/tx/csl-unsigned-tx';

const TEST_ADDR =
  'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';
const STAKE_KEY_HASH = 'aa'.repeat(28);
const PAYMENT_KEY_HASH = 'ab'.repeat(28);

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
  return CSL.RewardAddress.new(
    CSL.NetworkInfo.testnet_preprod().network_id(),
    CSL.Credential.from_keyhash(
      CSL.Ed25519KeyHash.from_bytes(Buffer.from(stakeHashHex, 'hex'))
    )
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

function makeOutputs(coin) {
  const outputs = CSL.TransactionOutputs.new();
  outputs.add(
    CSL.TransactionOutput.new(
      CSL.Address.from_bech32(TEST_ADDR),
      CSL.Value.new(CSL.BigNum.from_str(String(coin)))
    )
  );
  return outputs;
}

function withdrawalCount(tx) {
  const w = tx.body().withdrawals();
  return w ? w.len() : 0;
}

beforeEach(() => {
  paymentKeyHashesForSigning.mockResolvedValue([]);
  buildUnsignedSimpleTx.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore?.();
});

describe('buildTx — auto-withdraw rewards to cover an ADA gap', () => {
  test('e2e seed: 97 ADA send from 95 UTxO + 5 ADA rewards attaches a full withdrawal and requires the stake witness', async () => {
    const tx = await buildTx(
      ACCOUNT,
      [makeUtxo(95_000_000)],
      makeOutputs(97_000_000),
      PROTOCOL_PARAMS,
      null,
      { delegation: { rewards: '5000000' } }
    );

    expect(withdrawalCount(tx)).toBe(1);
    expect(rewardWithdrawalLovelaceFromTx(tx)).toBe('5000000');

    const withWithdrawal = buildUnsignedSimpleTx.mock.calls.find(
      ([opts]) => opts.withdrawal
    );
    expect(withWithdrawal).toBeTruthy();
    expect(withWithdrawal[0].withdrawal.amountLovelace).toBe('5000000');
    expect(withWithdrawal[0].requiredVkeyHashesHex).toContain(STAKE_KEY_HASH);

    const hashes = keyHashesForTx(tx, [PAYMENT_KEY_HASH], STAKE_KEY_HASH);
    expect(hashes).toContain(PAYMENT_KEY_HASH);
    expect(hashes).toContain(STAKE_KEY_HASH);
  });

  test('no gap: spend that fits in UTxOs does not withdraw rewards', async () => {
    const tx = await buildTx(
      ACCOUNT,
      [makeUtxo(95_000_000)],
      makeOutputs(50_000_000),
      PROTOCOL_PARAMS,
      null,
      { delegation: { rewards: '5000000' } }
    );

    expect(withdrawalCount(tx)).toBe(0);
    expect(rewardWithdrawalLovelaceFromTx(tx)).toBe('0');
    expect(keyHashesForTx(tx, [PAYMENT_KEY_HASH], STAKE_KEY_HASH)).toEqual([
      PAYMENT_KEY_HASH,
    ]);
    expect(
      buildUnsignedSimpleTx.mock.calls.some(([opts]) => opts.withdrawal)
    ).toBe(false);
  });

  test('gap larger than spendable + rewards fails with insufficient funds', async () => {
    await expect(
      buildTx(
        ACCOUNT,
        [makeUtxo(95_000_000)],
        makeOutputs(101_000_000),
        PROTOCOL_PARAMS,
        null,
        { delegation: { rewards: '5000000' } }
      )
    ).rejects.toThrow(/including staking rewards/i);
  });
});
