/**
 * Branded money-path types. A `string` lovelace amount must not be assigned
 * to a slot, and a hex key hash must not be treated as an ADA quantity.
 */

declare const LovelaceBrand: unique symbol;
declare const SlotBrand: unique symbol;
declare const HexStringBrand: unique symbol;

/** Decimal digit string of lovelace (1 ADA = 1_000_000). */
export type Lovelace = string & { readonly [LovelaceBrand]: 'Lovelace' };

/** Absolute chain slot (non-negative integer). */
export type Slot = number & { readonly [SlotBrand]: 'Slot' };

/** Even-length hex string (no 0x prefix). */
export type HexString = string & { readonly [HexStringBrand]: 'HexString' };

export type NetworkKey = 'mainnet' | 'testnet' | 'preview' | 'preprod';

export type KoiosRequestEnhanced = (
  path: string,
  headers?: Record<string, string>,
  body?: unknown,
  signal?: AbortSignal,
  networkOverride?: { id?: string; name?: string }
) => Promise<unknown>;

export type KoiosTipRow = {
  abs_slot?: string | number;
  absolute_slot?: string | number;
  slot?: string | number;
};

export type BlockfrostAmount = {
  unit: string;
  quantity: string;
};

export type BlockfrostUtxo = {
  tx_hash: string;
  output_index: number;
  amount?: BlockfrostAmount[];
  address?: string;
  stake_address?: string;
  data_hash?: string | null;
  inline_datum?: string | null;
  reference_script_hash?: string | null;
};

export type KoiosAsset = {
  policy_id: string;
  asset_name: string;
  quantity: string;
};

export type KoiosUtxoRow = {
  tx_hash: string;
  tx_index: number;
  output_index: number;
  value: string;
  asset_list: KoiosAsset[];
  address?: string | null;
  stake_addr?: string | null;
  datum_hash?: string | null;
  inline_datum?: { value: string } | null;
  reference_script?: { hash: string } | null;
};

export type KoiosAccountInfoRow = {
  stake_address: string;
  registered: boolean;
  active?: boolean;
  pool_id: string | null;
  delegated_drep?: string | null;
  drep_id?: string | null;
  withdrawable_amount: string;
  rewards_available: string;
  controlled_amount: string;
  utxo: string;
  total_balance: string;
  status: string;
};

export type KoiosEpochParamsRow = {
  min_fee_a?: string | number;
  min_fee_b?: string | number;
  pool_deposit?: string | number;
  key_deposit?: string | number;
  coins_per_utxo_size?: string | number;
  max_val_size?: string | number;
  max_tx_size?: string | number;
  price_mem?: number;
  price_step?: number;
  min_fee_ref_script_cost_per_byte?: number;
  collateral_percent?: string | number;
  max_collateral_inputs?: string | number;
};

export type ProtocolParametersSnapshot = {
  linearFee: { minFeeA: Lovelace; minFeeB: Lovelace };
  minUtxo: Lovelace;
  poolDeposit: Lovelace;
  keyDeposit: Lovelace;
  coinsPerUtxoWord: Lovelace;
  maxValSize: string | number;
  priceMem?: number;
  priceStep?: number;
  minFeeRefScriptCostPerByte: number;
  maxTxSize: number;
  slot: Slot;
  collateralPercentage: number;
  maxCollateralInputs: number;
};

/** Emurgo CSL namespace after `Loader.load()`. Typed loosely — WASM has no .d.ts in-browser. */
export type Csl = any;

export function asLovelace(value: string | number | bigint): Lovelace {
  const s =
    typeof value === 'bigint'
      ? value.toString()
      : typeof value === 'number'
        ? String(Math.trunc(value))
        : String(value);
  if (!/^\d+$/.test(s)) {
    throw new Error(`Invalid lovelace amount: ${s}`);
  }
  return s as Lovelace;
}

export function asSlot(value: number): Slot {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid slot: ${value}`);
  }
  return value as Slot;
}

export function asHexString(value: string): HexString {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]*$/.test(value) || value.length % 2 !== 0) {
    throw new Error(`Invalid hex string: ${value}`);
  }
  return value as HexString;
}

export function asNetworkKey(value: unknown): NetworkKey {
  if (
    value === 'mainnet' ||
    value === 'testnet' ||
    value === 'preview' ||
    value === 'preprod'
  ) {
    return value;
  }
  return 'mainnet';
}
