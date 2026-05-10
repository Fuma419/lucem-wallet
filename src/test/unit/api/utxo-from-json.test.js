/**
 * Real-CSL tests for utxoFromJson.
 * Catches CSL API changes like TransactionInput.new() expecting number vs BigNum.
 */
import { utxoFromJson } from '../../../api/util';
import Loader from '../../../api/loader';

const TEST_ADDR =
  'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';
const DUMMY_TX_HASH = 'aa'.repeat(32);

beforeAll(async () => {
  await Loader.load();
});

test('output_index 0 produces correct TransactionInput index', async () => {
  const utxo = await utxoFromJson(
    {
      tx_hash: DUMMY_TX_HASH,
      output_index: 0,
      amount: [{ unit: 'lovelace', quantity: '5000000' }],
    },
    TEST_ADDR
  );
  expect(utxo.input().index()).toBe(0);
  expect(utxo.output().amount().coin().to_str()).toBe('5000000');
});

test('output_index > 0 produces correct TransactionInput index', async () => {
  const utxo = await utxoFromJson(
    {
      tx_hash: DUMMY_TX_HASH,
      output_index: 3,
      amount: [{ unit: 'lovelace', quantity: '2000000' }],
    },
    TEST_ADDR
  );
  expect(utxo.input().index()).toBe(3);
});

test('output_index as string is parsed correctly', async () => {
  const utxo = await utxoFromJson(
    {
      tx_hash: DUMMY_TX_HASH,
      output_index: '7',
      amount: [{ unit: 'lovelace', quantity: '1000000' }],
    },
    TEST_ADDR
  );
  expect(utxo.input().index()).toBe(7);
});

test('multi-asset UTxO preserves token value', async () => {
  const policyId = 'bb'.repeat(28);
  const assetName = Buffer.from('testToken').toString('hex');
  const utxo = await utxoFromJson(
    {
      tx_hash: DUMMY_TX_HASH,
      output_index: 1,
      amount: [
        { unit: 'lovelace', quantity: '3000000' },
        { unit: policyId + assetName, quantity: '42' },
      ],
    },
    TEST_ADDR
  );
  expect(utxo.input().index()).toBe(1);
  expect(utxo.output().amount().coin().to_str()).toBe('3000000');
  const multiAsset = utxo.output().amount().multiasset();
  expect(multiAsset).toBeDefined();
  expect(multiAsset.len()).toBe(1);
});

test('transaction hash round-trips correctly', async () => {
  const utxo = await utxoFromJson(
    {
      tx_hash: DUMMY_TX_HASH,
      output_index: 0,
      amount: [{ unit: 'lovelace', quantity: '1000000' }],
    },
    TEST_ADDR
  );
  const hashHex = Buffer.from(utxo.input().transaction_id().to_bytes()).toString('hex');
  expect(hashHex).toBe(DUMMY_TX_HASH);
});
