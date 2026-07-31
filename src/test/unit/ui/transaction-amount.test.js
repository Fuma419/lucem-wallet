/**
 * @jest-environment node
 */

const mockCSL = require('@emurgo/cardano-serialization-lib-nodejs');

jest.mock('../../../api/loader', () => ({ __esModule: true, default: { Cardano: mockCSL } }));
jest.mock('../../../api/util', () => ({
  compileOutputs: (outputList) => {
    const compiled = [];
    for (const output of outputList) {
      for (const amount of output.amount) {
        const entry = compiled.find((c) => c.unit === amount.unit);
        if (entry) {
          entry.quantity = (BigInt(entry.quantity) + BigInt(amount.quantity)).toString();
        } else {
          compiled.push({ unit: amount.unit, quantity: String(amount.quantity) });
        }
      }
    }
    return compiled;
  },
  hexToAscii: (hex) => hex,
}));

const {
  calculateAmount,
  matchesAnyCredential,
  getAddressCredentials,
  getTxType,
  getCounterparty,
  truncateMiddle,
} = require('../../../ui/app/components/transaction');

function makeBaseAddress(paymentKeyHex, stakeKeyHex, networkId = 0) {
  const paymentHash = mockCSL.Ed25519KeyHash.from_hex(paymentKeyHex);
  const stakeHash = mockCSL.Ed25519KeyHash.from_hex(stakeKeyHex);
  return mockCSL.BaseAddress.new(
    networkId,
    mockCSL.Credential.from_keyhash(paymentHash),
    mockCSL.Credential.from_keyhash(stakeHash)
  )
    .to_address()
    .to_bech32();
}

const PAYMENT_KEY_0 = 'a'.repeat(56);
const STAKE_KEY_0 = 'b'.repeat(56);
const PAYMENT_KEY_1 = 'c'.repeat(56);
const STAKE_KEY_1 = 'd'.repeat(56);

const EXTERNAL_PAYMENT = 'e'.repeat(56);
const EXTERNAL_STAKE = 'f'.repeat(56);

let addr0, addr1, externalAddr;

beforeAll(() => {
  addr0 = makeBaseAddress(PAYMENT_KEY_0, STAKE_KEY_0);
  addr1 = makeBaseAddress(PAYMENT_KEY_1, STAKE_KEY_1);
  externalAddr = makeBaseAddress(EXTERNAL_PAYMENT, EXTERNAL_STAKE);
});

describe('matchesAnyCredential', () => {
  test('matches same address', () => {
    const [pay, stake] = getAddressCredentials(addr0);
    expect(matchesAnyCredential(addr0, [pay, stake])).toBe(true);
  });

  test('does not match different account address', () => {
    const [pay, stake] = getAddressCredentials(addr0);
    expect(matchesAnyCredential(addr1, [pay, stake])).toBe(false);
  });

  test('does not match external address', () => {
    const [pay, stake] = getAddressCredentials(addr0);
    expect(matchesAnyCredential(externalAddr, [pay, stake])).toBe(false);
  });

  test('matches same payment cred even with different stake cred', () => {
    const samePayDiffStake = makeBaseAddress(PAYMENT_KEY_0, STAKE_KEY_1);
    const [pay, stake] = getAddressCredentials(addr0);
    expect(matchesAnyCredential(samePayDiffStake, [pay, stake])).toBe(true);
  });
});

describe('calculateAmount — internal send (account 0 -> account 1)', () => {
  test('shows non-zero sent amount for internal transfer', () => {
    const uTxOList = {
      inputs: [
        { address: addr0, value: '10000000', asset_list: [], tx_hash: 'aa'.repeat(32), tx_index: 0 },
      ],
      outputs: [
        { address: addr1, value: '5000000', asset_list: [], tx_hash: 'bb'.repeat(32), tx_index: 0 },
        { address: addr0, value: '4829879', asset_list: [], tx_hash: 'bb'.repeat(32), tx_index: 1 },
      ],
    };

    const amounts = calculateAmount(addr0, uTxOList, true);
    const lovelace = amounts.find((a) => a.unit === 'lovelace');
    expect(lovelace).toBeDefined();
    expect(BigInt(lovelace.quantity)).toBeLessThan(0n);
    expect(BigInt(lovelace.quantity)).toBe(-5170121n);
  });
});

describe('calculateAmount — external send', () => {
  test('shows negative amount for outgoing tx', () => {
    const uTxOList = {
      inputs: [
        { address: addr0, value: '10000000', asset_list: [], tx_hash: 'aa'.repeat(32), tx_index: 0 },
      ],
      outputs: [
        { address: externalAddr, value: '5000000', asset_list: [], tx_hash: 'bb'.repeat(32), tx_index: 0 },
        { address: addr0, value: '4829879', asset_list: [], tx_hash: 'bb'.repeat(32), tx_index: 1 },
      ],
    };
    const amounts = calculateAmount(addr0, uTxOList, true);
    const lovelace = amounts.find((a) => a.unit === 'lovelace');
    expect(BigInt(lovelace.quantity)).toBe(-5170121n);
  });
});

describe('calculateAmount — receive', () => {
  test('shows positive amount for incoming tx', () => {
    const uTxOList = {
      inputs: [
        { address: externalAddr, value: '10000000', asset_list: [], tx_hash: 'aa'.repeat(32), tx_index: 0 },
      ],
      outputs: [
        { address: addr0, value: '5000000', asset_list: [], tx_hash: 'bb'.repeat(32), tx_index: 0 },
        { address: externalAddr, value: '4829879', asset_list: [], tx_hash: 'bb'.repeat(32), tx_index: 1 },
      ],
    };
    const amounts = calculateAmount(addr0, uTxOList, true);
    const lovelace = amounts.find((a) => a.unit === 'lovelace');
    expect(BigInt(lovelace.quantity)).toBe(5000000n);
  });
});

describe('getCounterparty', () => {
  test('returns external recipient (To) for an outgoing tx, skipping change', () => {
    const detail = {
      utxos: {
        inputs: [{ address: addr0 }],
        outputs: [{ address: externalAddr }, { address: addr0 }],
      },
    };
    const cp = getCounterparty('externalOut', detail, addr0, [addr0, addr1]);
    expect(cp).toEqual({ direction: 'To', addresses: [externalAddr] });
  });

  test('returns external sender (From) for an incoming tx', () => {
    const detail = {
      utxos: {
        inputs: [{ address: externalAddr }],
        outputs: [{ address: addr0 }, { address: externalAddr }],
      },
    };
    const cp = getCounterparty('externalIn', detail, addr0, [addr0, addr1]);
    expect(cp).toEqual({ direction: 'From', addresses: [externalAddr] });
  });

  test('returns null for a self transfer', () => {
    const detail = {
      utxos: { inputs: [{ address: addr0 }], outputs: [{ address: addr0 }] },
    };
    expect(getCounterparty('self', detail, addr0, [addr0])).toBeNull();
  });

  test('dedupes repeated counterparty addresses', () => {
    const detail = {
      utxos: {
        inputs: [{ address: addr0 }],
        outputs: [
          { address: externalAddr },
          { address: externalAddr },
          { address: addr0 },
        ],
      },
    };
    const cp = getCounterparty('externalOut', detail, addr0, [addr0]);
    expect(cp.addresses).toEqual([externalAddr]);
  });
});

describe('truncateMiddle', () => {
  test('shortens long strings with an ellipsis', () => {
    const hash = 'a'.repeat(64);
    const out = truncateMiddle(hash, 12, 8);
    expect(out).toBe(`${'a'.repeat(12)}…${'a'.repeat(8)}`);
  });

  test('leaves short strings unchanged', () => {
    expect(truncateMiddle('short')).toBe('short');
  });
});

describe('getTxType', () => {
  test('self transfer', () => {
    const uTxOList = {
      inputs: [{ address: addr0 }],
      outputs: [{ address: addr0 }],
    };
    expect(getTxType(addr0, [addr0, addr1], uTxOList)).toBe('self');
  });

  test('internal out', () => {
    const uTxOList = {
      inputs: [{ address: addr0 }],
      outputs: [{ address: addr1 }, { address: addr0 }],
    };
    expect(getTxType(addr0, [addr0, addr1], uTxOList)).toBe('internalOut');
  });

  test('external out', () => {
    const uTxOList = {
      inputs: [{ address: addr0 }],
      outputs: [{ address: externalAddr }, { address: addr0 }],
    };
    expect(getTxType(addr0, [addr0, addr1], uTxOList)).toBe('externalOut');
  });

  test('external in', () => {
    const uTxOList = {
      inputs: [{ address: externalAddr }],
      outputs: [{ address: addr0 }],
    };
    expect(getTxType(addr0, [addr0, addr1], uTxOList)).toBe('externalIn');
  });

  test('internal in', () => {
    const uTxOList = {
      inputs: [{ address: addr1 }],
      outputs: [{ address: addr0 }],
    };
    expect(getTxType(addr0, [addr0, addr1], uTxOList)).toBe('internalIn');
  });
});
