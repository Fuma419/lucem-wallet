/**
 * Blockfrost → Koios-shaped response adapter.
 *
 * `koiosRequest` prefers Blockfrost when a project id is present, then falls
 * back to Koios. This module owns the fetch + response mapping so both
 * providers share one schema at the wallet boundary.
 */

import {
  BLOCKFROST_BASE,
  blockfrostHeaders,
} from '../provider-http';
import type {
  BlockfrostAmount,
  BlockfrostUtxo,
  KoiosAccountInfoRow,
  KoiosEpochParamsRow,
  KoiosUtxoRow,
  NetworkKey,
} from '../types';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchBlockfrostJson(
  networkKey: NetworkKey,
  path: string,
  signal?: AbortSignal
): Promise<any> {
  const baseUrl = BLOCKFROST_BASE[networkKey] || BLOCKFROST_BASE.mainnet;
  const result = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: blockfrostHeaders(networkKey),
    signal,
  });
  const text = await result.text();
  if (!result.ok) {
    throw new Error(`Blockfrost ${result.status} ${result.statusText}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

export async function fetchBlockfrostAddressUtxos(
  networkKey: NetworkKey,
  address: string,
  signal?: AbortSignal
): Promise<BlockfrostUtxo[]> {
  const pageSize = 100;
  let page = 1;
  const rows: BlockfrostUtxo[] = [];
  while (page <= 50) {
    const payload = await fetchBlockfrostJson(
      networkKey,
      `/addresses/${address}/utxos?order=asc&count=${pageSize}&page=${page}`,
      signal
    );
    if (!Array.isArray(payload) || payload.length === 0) break;
    rows.push(...payload);
    if (payload.length < pageSize) break;
    page += 1;
  }
  return rows;
}

export function blockfrostUtxoToKoios(utxo: BlockfrostUtxo): KoiosUtxoRow {
  const amount = Array.isArray(utxo.amount) ? utxo.amount : [];
  const lovelace = amount.find((asset) => asset.unit === 'lovelace');
  const assetList = amount
    .filter((asset) => asset.unit !== 'lovelace')
    .map((asset) => ({
      policy_id: asset.unit.slice(0, 56),
      asset_name: asset.unit.slice(56),
      quantity: asset.quantity || '0',
    }));

  return {
    tx_hash: utxo.tx_hash,
    tx_index: utxo.output_index,
    output_index: utxo.output_index,
    value: lovelace?.quantity || '0',
    asset_list: assetList,
  };
}

export function toKoiosEpochParams(raw: Record<string, any>): KoiosEpochParamsRow {
  return {
    min_fee_a: raw.min_fee_a,
    min_fee_b: raw.min_fee_b,
    max_tx_size: raw.max_tx_size,
    max_val_size: raw.max_val_size,
    key_deposit: raw.key_deposit,
    pool_deposit: raw.pool_deposit,
    price_mem: raw.price_mem,
    price_step: raw.price_step,
    max_collateral_inputs: raw.max_collateral_inputs,
    collateral_percent: raw.collateral_percent,
    coins_per_utxo_size: raw.coins_per_utxo_size || raw.coins_per_utxo_word,
    min_fee_ref_script_cost_per_byte: raw.min_fee_ref_script_cost_per_byte || 0,
  };
}

export function amountListToKoiosValueAndAssets(amountList: BlockfrostAmount[] = []) {
  const lovelace = amountList.find((asset) => asset.unit === 'lovelace');
  const value = String(lovelace?.quantity || '0');
  const asset_list = amountList
    .filter((asset) => asset.unit !== 'lovelace')
    .map((asset) => ({
      policy_id: asset.unit.slice(0, 56),
      asset_name: asset.unit.slice(56),
      quantity: String(asset.quantity || '0'),
    }));
  return { value, asset_list };
}

export function blockfrostTxToKoiosTxInfo(txHash: string, txPayload: any) {
  const parsedDeposit = Number.parseInt(String(txPayload?.deposit || '0'), 10);
  return {
    tx_hash: txHash,
    block_height: txPayload?.block_height ?? null,
    tx_timestamp: txPayload?.block_time ?? null,
    tx_block_index: txPayload?.index ?? txPayload?.tx_index ?? null,
    tx_size: txPayload?.size ?? null,
    total_output: txPayload?.output_amount?.find((a: BlockfrostAmount) => a.unit === 'lovelace')?.quantity || '0',
    fee: txPayload?.fees || '0',
    deposit: Number.isFinite(parsedDeposit) ? String(parsedDeposit) : '0',
    invalid_before: txPayload?.valid_contract === false ? null : null,
    invalid_after: txPayload?.invalid_hereafter ?? null,
    collateral_inputs: [],
    collateral_output: null,
    reference_inputs: [],
    inputs: [],
    outputs: [],
    withdrawals: [],
    assets_minted: [],
    metadata: null,
    certificates: [],
    native_scripts: [],
    plutus_contracts: [],
    voting_procedures: [],
    proposal_procedures: [],
  };
}

function unregisteredAccount(stakeAddress: string): KoiosAccountInfoRow {
  return {
    stake_address: stakeAddress,
    registered: false,
    active: false,
    pool_id: null,
    withdrawable_amount: '0',
    rewards_available: '0',
    controlled_amount: '0',
    utxo: '0',
    total_balance: '0',
    status: 'unregistered',
  };
}

/**
 * Map a Koios-shaped endpoint + body onto Blockfrost REST and return the
 * Koios-compatible payload. `undefined` means this endpoint is not adapted —
 * the caller should fall through to Koios.
 */
export async function blockfrostKoiosCompatibleRequest(
  networkKey: NetworkKey,
  endpoint: string,
  body?: any,
  signal?: AbortSignal
): Promise<unknown> {
  if (endpoint === '/tip') {
    const latestBlock = await fetchBlockfrostJson(networkKey, '/blocks/latest', signal);
    return [
      {
        abs_slot: latestBlock?.slot,
        block_height: latestBlock?.height,
        hash: latestBlock?.hash,
      },
    ];
  }

  if (endpoint === '/epoch_params/latest' || endpoint === '/epoch_params') {
    const params = await fetchBlockfrostJson(networkKey, '/epochs/latest/parameters', signal);
    return [toKoiosEpochParams(params)];
  }

  if (endpoint === '/address_info' && body && Array.isArray(body._addresses)) {
    const rows = [];
    for (const address of body._addresses) {
      const utxos = await fetchBlockfrostAddressUtxos(networkKey, address, signal);
      const utxoSet = utxos.map(blockfrostUtxoToKoios);
      const totalLovelace = utxoSet.reduce(
        (sum, utxo) => sum + BigInt(utxo.value || '0'),
        BigInt(0)
      );
      rows.push({
        address,
        balance: totalLovelace.toString(),
        utxo_set: utxoSet,
      });
    }
    return rows;
  }

  if (endpoint === '/account_info' && body && Array.isArray(body._stake_addresses)) {
    const rows: KoiosAccountInfoRow[] = [];
    for (const stakeAddress of body._stake_addresses) {
      try {
        const account = await fetchBlockfrostJson(
          networkKey,
          `/accounts/${stakeAddress}`,
          signal
        );
        const controlled = account.controlled_amount || '0';
        const withdrawable = account.withdrawable_amount || '0';
        rows.push({
          stake_address: stakeAddress,
          registered: true,
          active: account.active,
          pool_id: account.pool_id || null,
          withdrawable_amount: withdrawable,
          rewards_available: withdrawable,
          controlled_amount: controlled,
          utxo: controlled,
          total_balance: controlled,
          status: 'registered',
        });
      } catch (error) {
        if (errorMessage(error).includes('404')) {
          rows.push(unregisteredAccount(stakeAddress));
          continue;
        }
        throw error;
      }
    }
    return rows;
  }

  if (endpoint === '/address_txs' && body && Array.isArray(body._addresses)) {
    const txs: { tx_hash: string }[] = [];
    for (const address of body._addresses) {
      const history = await fetchBlockfrostJson(
        networkKey,
        `/addresses/${address}/transactions?order=desc&count=100&page=1`,
        signal
      );
      if (Array.isArray(history)) {
        txs.push(...history.map((item: { tx_hash: string }) => ({ tx_hash: item.tx_hash })));
      }
    }
    return txs;
  }

  if (endpoint === '/tx_status' && body && Array.isArray(body._tx_hashes)) {
    const rows = [];
    for (const txHash of body._tx_hashes) {
      try {
        const tx = await fetchBlockfrostJson(networkKey, `/txs/${txHash}`, signal);
        rows.push({
          tx_hash: txHash,
          tx_index: tx.tx_index,
          block_height: tx.block_height,
          num_confirmations: tx.confirmations,
        });
      } catch (error) {
        if (!errorMessage(error).includes('404')) throw error;
      }
    }
    return rows;
  }

  if (endpoint === '/tx_info' && body && Array.isArray(body._tx_hashes)) {
    const rows = [];
    for (const txHash of body._tx_hashes) {
      const txPayload = await fetchBlockfrostJson(networkKey, `/txs/${txHash}`, signal);
      rows.push(blockfrostTxToKoiosTxInfo(txHash, txPayload));
    }
    return rows;
  }

  if (endpoint === '/tx_utxos' && body && Array.isArray(body._tx_hashes)) {
    const rows = [];
    for (const txHash of body._tx_hashes) {
      const txUtxos = await fetchBlockfrostJson(networkKey, `/txs/${txHash}/utxos`, signal);
      const inputs = Array.isArray(txUtxos?.inputs)
        ? txUtxos.inputs.map((input: any) => {
            const mapped = amountListToKoiosValueAndAssets(input.amount || []);
            return {
              tx_hash: input.tx_hash,
              tx_index: input.output_index,
              address: input.address,
              value: mapped.value,
              asset_list: mapped.asset_list,
            };
          })
        : [];
      const outputs = Array.isArray(txUtxos?.outputs)
        ? txUtxos.outputs.map((output: any) => {
            const mapped = amountListToKoiosValueAndAssets(output.amount || []);
            return {
              tx_hash: txHash,
              tx_index: output.output_index,
              address: output.address,
              value: mapped.value,
              asset_list: mapped.asset_list,
            };
          })
        : [];
      rows.push({ tx_hash: txHash, inputs, outputs });
    }
    return rows;
  }

  if (endpoint === '/tx_metadata' && body && Array.isArray(body._tx_hashes)) {
    const rows = [];
    for (const txHash of body._tx_hashes) {
      const metadata = await fetchBlockfrostJson(networkKey, `/txs/${txHash}/metadata`, signal);
      rows.push({ tx_hash: txHash, metadata: Array.isArray(metadata) ? metadata : [] });
    }
    return rows;
  }

  if (endpoint === '/block_info' && body && Array.isArray(body._block_hashes)) {
    const rows = [];
    for (const blockHash of body._block_hashes) {
      const block = await fetchBlockfrostJson(networkKey, `/blocks/${blockHash}`, signal);
      rows.push({
        hash: block.hash,
        block_height: block.height,
        epoch_no: block.epoch,
        epoch_slot: block.epoch_slot,
        absolute_slot: block.slot,
        block_time: block.time,
      });
    }
    return rows;
  }

  if (endpoint.startsWith('/blocks?')) {
    const query = endpoint.slice('/blocks?'.length);
    const queryParams = new URLSearchParams(query);
    const blockHeightParam = queryParams.get('block_height') || '';
    const blockHeight = blockHeightParam.startsWith('eq.')
      ? Number.parseInt(blockHeightParam.slice(3), 10)
      : Number.parseInt(blockHeightParam, 10);
    if (!Number.isFinite(blockHeight)) {
      return [];
    }
    const block = await fetchBlockfrostJson(networkKey, `/blocks/${blockHeight}`, signal);
    return [
      {
        hash: block.hash,
        block_height: block.height,
        epoch_no: block.epoch,
        epoch_slot: block.epoch_slot,
        absolute_slot: block.slot,
        block_time: block.time,
      },
    ];
  }

  if (endpoint.startsWith('/account_txs')) {
    const queryIndex = endpoint.indexOf('?');
    const query = queryIndex >= 0 ? endpoint.slice(queryIndex + 1) : '';
    const queryParams = new URLSearchParams(query);
    const stakeAddress = queryParams.get('_stake_address');
    const afterBlockHeight = Number.parseInt(
      queryParams.get('_after_block_height') || '0',
      10
    );
    const limit = Math.max(
      1,
      Math.min(Number.parseInt(queryParams.get('_limit') || '100', 10), 100)
    );
    if (!stakeAddress) {
      return [];
    }

    const txs = await fetchBlockfrostJson(
      networkKey,
      `/accounts/${stakeAddress}/addresses/transactions?order=desc&count=${limit}&page=1`,
      signal
    );
    if (!Array.isArray(txs)) {
      return [];
    }
    return txs
      .filter((row: any) => {
        const h = Number.parseInt(String(row?.block_height || '0'), 10);
        return Number.isFinite(h) && h >= afterBlockHeight;
      })
      .map((row: any) => ({
        tx_hash: row.tx_hash,
        block_height: row.block_height,
      }));
  }

  if (endpoint === '/account_addresses' && body && Array.isArray(body._stake_addresses)) {
    const rows = [];
    for (const stakeAddress of body._stake_addresses) {
      const addresses: string[] = [];
      let page = 1;
      while (page <= 20) {
        let batch;
        try {
          batch = await fetchBlockfrostJson(
            networkKey,
            `/accounts/${stakeAddress}/addresses?count=100&page=${page}`,
            signal
          );
        } catch (error) {
          if (errorMessage(error).includes('404')) {
            batch = [];
          } else {
            throw error;
          }
        }
        if (!Array.isArray(batch) || batch.length === 0) break;
        for (const item of batch) {
          const addr =
            typeof item === 'string'
              ? item
              : typeof item?.address === 'string'
                ? item.address
                : null;
          if (addr) addresses.push(addr);
        }
        if (batch.length < 100) break;
        page += 1;
      }
      rows.push({ stake_address: stakeAddress, addresses });
    }
    return rows;
  }

  if (endpoint === '/account_utxos' && body && Array.isArray(body._stake_addresses)) {
    const rows: KoiosUtxoRow[] = [];
    for (const stakeAddress of body._stake_addresses) {
      let page = 1;
      while (page <= 50) {
        let batch;
        try {
          batch = await fetchBlockfrostJson(
            networkKey,
            `/accounts/${stakeAddress}/utxos?count=100&page=${page}`,
            signal
          );
        } catch (error) {
          if (errorMessage(error).includes('404')) {
            batch = [];
          } else {
            throw error;
          }
        }
        if (!Array.isArray(batch) || batch.length === 0) break;
        for (const utxo of batch) {
          rows.push({
            ...blockfrostUtxoToKoios(utxo),
            address: utxo.address || null,
            stake_addr: stakeAddress,
          });
        }
        if (batch.length < 100) break;
        page += 1;
      }
    }
    return rows;
  }

  if (endpoint === '/asset_info' && body && Array.isArray(body._asset_list)) {
    const rows = [];
    for (const unit of body._asset_list) {
      try {
        const asset = await fetchBlockfrostJson(
          networkKey,
          `/assets/${unit}`,
          signal
        );
        if (asset) rows.push(asset);
      } catch (error) {
        if (!errorMessage(error).includes('404')) throw error;
      }
    }
    return rows;
  }

  if (endpoint === '/address_utxos' && body && Array.isArray(body._addresses)) {
    const rows: KoiosUtxoRow[] = [];
    for (const address of body._addresses) {
      const utxos = await fetchBlockfrostAddressUtxos(networkKey, address, signal);
      rows.push(...utxos.map((utxo) => ({
        ...blockfrostUtxoToKoios(utxo),
        address,
        stake_addr: utxo.stake_address || null,
        datum_hash: utxo.data_hash || null,
        inline_datum: utxo.inline_datum ? { value: utxo.inline_datum } : null,
        reference_script: utxo.reference_script_hash ? { hash: utxo.reference_script_hash } : null,
      })));
    }
    return rows;
  }

  if (endpoint === '/pool_info' && body && Array.isArray(body._pool_bech32_ids)) {
    const rows = [];
    for (const poolId of body._pool_bech32_ids) {
      try {
        const pool = await fetchBlockfrostJson(networkKey, `/pools/${poolId}`, signal);
        const meta = await fetchBlockfrostJson(networkKey, `/pools/${poolId}/metadata`, signal).catch(() => null);
        rows.push({
          pool_id_bech32: poolId,
          pool_id_hex: pool.hex || '',
          active_stake: String(pool.active_stake || '0'),
          live_saturation: String(pool.live_saturation || '0'),
          live_stake: String(pool.live_stake || '0'),
          fixed_cost: String(pool.fixed_cost || '0'),
          margin: String(pool.margin_cost ?? pool.margin ?? '0'),
          pledge: String(pool.declared_pledge || pool.pledge || '0'),
          block_count: pool.blocks_minted || 0,
          pool_status: pool.retirement?.length ? 'retiring' : 'registered',
          meta_json: meta ? {
            ticker: meta.ticker || '',
            name: meta.name || '',
            description: meta.description || '',
            homepage: meta.homepage || '',
          } : null,
        });
      } catch (error) {
        if (!errorMessage(error).includes('404')) throw error;
      }
    }
    return rows;
  }

  if (endpoint.startsWith('/pool_list')) {
    const queryIndex = endpoint.indexOf('?');
    const query = queryIndex >= 0 ? endpoint.slice(queryIndex + 1) : '';
    const queryParams = new URLSearchParams(query);
    const limit = Math.min(Number.parseInt(queryParams.get('limit') || '25', 10), 100);

    const pools = await fetchBlockfrostJson(
      networkKey,
      `/pools?order=asc&count=${limit}&page=1`,
      signal
    );
    if (!Array.isArray(pools)) return [];
    return pools.map((poolId: string) => ({ pool_id_bech32: poolId }));
  }

  return undefined;
}
