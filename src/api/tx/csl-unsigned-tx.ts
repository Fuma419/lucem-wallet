/**
 * Central CSL transaction assembly for payment-style flows.
 * See docs/TX_ARCHITECTURE_PLAN.md.
 */

import { decodeTx, encodeTx, transformTx } from 'cardano-hw-interop-lib';
import { TX } from '../../config/config';
import type { Csl, ProtocolParametersSnapshot } from '../types';

const FEE_ALIGN_MAX_ATTEMPTS = 5;

/**
 * @param {*} Cardano - Emurgo CSL namespace
 * @param {object} protocolParameters - snapshot from `buildProtocolParametersSnapshot`
 * @param {object} [options]
 * @param {boolean} [options.preferPureChange=true] - split change into a pure-ADA
 *   output when possible. Send-all disables this so the whole balance (ADA +
 *   every token) lands in a single consolidated output.
 */
export function createCslTransactionBuilderConfig(
  Cardano: Csl,
  protocolParameters: ProtocolParametersSnapshot,
  { preferPureChange = true }: { preferPureChange?: boolean } = {}
) {
  const p = protocolParameters;
  if (!p.linearFee?.minFeeA || !p.linearFee?.minFeeB) {
    throw new Error('Invalid protocol parameters: linearFee');
  }
  if (!p.poolDeposit || !p.keyDeposit || !p.coinsPerUtxoWord) {
    throw new Error(
      'Invalid protocol parameters: poolDeposit, keyDeposit, or coinsPerUtxoWord'
    );
  }
  if (!p.maxValSize || !p.maxTxSize) {
    throw new Error('Invalid protocol parameters: maxValSize or maxTxSize');
  }
  return Cardano.TransactionBuilderConfigBuilder.new()
    .fee_algo(
      Cardano.LinearFee.new(
        Cardano.BigNum.from_str(String(p.linearFee.minFeeA)),
        Cardano.BigNum.from_str(String(p.linearFee.minFeeB))
      )
    )
    .pool_deposit(Cardano.BigNum.from_str(String(p.poolDeposit)))
    .key_deposit(Cardano.BigNum.from_str(String(p.keyDeposit)))
    .coins_per_utxo_byte(Cardano.BigNum.from_str(String(p.coinsPerUtxoWord)))
    .max_value_size(parseInt(String(p.maxValSize), 10))
    .max_tx_size(parseInt(String(p.maxTxSize), 10))
    .prefer_pure_change(preferPureChange)
    .build();
}

/**
 * CIP-0021 canonical CBOR for hardware wallets / consistent submit encoding.
 * @param {*} Cardano
 * @param {*} tx - CSL Transaction
 */
export function toCanonicalTransactionCip21(Cardano: Csl, tx: any) {
  const canonicalCbor = encodeTx(transformTx(decodeTx(tx.to_bytes())));
  return Cardano.Transaction.from_bytes(canonicalCbor);
}

/**
 * @param {*} Cardano
 * @param {*} body - TransactionBody
 * @param {string[]} requiredVkeyHashesHex
 */
function dummyWitnessSetForMinFee(
  Cardano: Csl,
  body: any,
  requiredVkeyHashesHex: string[]
) {
  const bodyBytes = body.to_bytes();
  const fixedBody = Cardano.FixedTransactionBody.from_bytes(bodyBytes);
  const txHash = fixedBody.tx_hash();
  if (typeof fixedBody.free === 'function') fixedBody.free();

  const vkeys = Cardano.Vkeywitnesses.new();
  const n = requiredVkeyHashesHex.length;
  for (let i = 0; i < n; i += 1) {
    const sk = Cardano.PrivateKey.generate_ed25519();
    vkeys.add(Cardano.make_vkey_witness(txHash, sk));
    if (typeof sk.free === 'function') sk.free();
  }
  const witnessSet = Cardano.TransactionWitnessSet.new();
  witnessSet.set_vkeys(vkeys);
  return witnessSet;
}

function ttlInvalidHereafterBignum(
  Cardano: Csl,
  protocolParameters: ProtocolParametersSnapshot
) {
  const base = Math.floor(Number(protocolParameters.slot));
  if (!Number.isFinite(base) || base < 0) {
    throw new Error('Invalid chain slot in protocol parameters');
  }
  return Cardano.BigNum.from_str(String(base + TX.invalid_hereafter));
}

/**
 * Largest-first input selection for a PURE-ADA payment that guarantees the change
 * output clears min-ADA whenever the wallet can afford it — so CSL never folds an
 * un-splittable leftover into the fee (the "change dead-zone" that makes a 5-ADA
 * send from a 6-ADA UTxO cost a full 1-ADA fee even when the wallet holds more
 * UTxOs).
 *
 * CSL's `add_inputs_from_and_change` + LargestFirst stops as soon as the selected
 * inputs nominally cover output+fee; if the resulting leftover lands in
 * (0, minChangeUTxO) it is burned into the fee instead of pulling another input.
 * We instead pull UTxOs largest-first until the running total covers
 *   target(outputs) + a generous fee headroom + min-ADA-for-a-change-output,
 * so a proper change output can form. If the entire balance is smaller than that
 * (the leftover genuinely cannot become a valid UTxO) we return everything and let
 * the caller's single change pass burn the unavoidable remainder — that is
 * Cardano's constraint, not an overpay.
 *
 * Only valid for the pure-ADA path: callers must ensure neither the outputs nor
 * any UTxO carries native tokens (multi-asset change min-ADA is bundle-specific
 * and is left to CSL's RandomImproveMultiAsset).
 *
 * @returns {Array} CSL TransactionUnspentOutput[] to add as explicit inputs
 */
function selectAdaInputsForViableChange({
  Cardano,
  utxos,
  outputs,
  changeAddress,
  protocolParameters,
}: {
  Cardano: Csl;
  utxos: any[];
  outputs: any;
  changeAddress: any;
  protocolParameters: ProtocolParametersSnapshot;
}) {
  let target = Cardano.BigNum.zero();
  for (let i = 0; i < outputs.len(); i += 1) {
    target = target.checked_add(outputs.get(i).amount().coin());
  }

  // Min-ADA for a pure-ADA change output at the change address. Probe with a large
  // nominal coin so the size estimate (and thus the floor) is conservative.
  const dataCost = Cardano.DataCost.new_coins_per_byte(
    Cardano.BigNum.from_str(String(protocolParameters.coinsPerUtxoWord))
  );
  const changeProbe = Cardano.TransactionOutput.new(
    changeAddress,
    Cardano.Value.new(Cardano.BigNum.from_str('1000000000000'))
  );
  const minChange = Cardano.min_ada_for_output(changeProbe, dataCost);

  // Fee headroom for selection only; the exact fee is aligned precisely afterward.
  const feeHeadroom = Cardano.BigNum.from_str('1000000');
  const wantViable = target.checked_add(feeHeadroom).checked_add(minChange);

  const sorted = [...utxos].sort((a, b) =>
    b.output().amount().coin().compare(a.output().amount().coin())
  );

  const picked: any[] = [];
  let sum = Cardano.BigNum.zero();
  for (const u of sorted) {
    if (sum.compare(wantViable) >= 0) break;
    picked.push(u);
    sum = sum.checked_add(u.output().amount().coin());
  }
  if (picked.length === 0 && sorted.length > 0) picked.push(sorted[0]);
  return picked;
}

function hexFromBytes(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('hex');
}

/**
 * Native-asset inventory of a CSL Value, keyed by policy+name hex (same unit
 * string the Send page uses).
 */
function nativeAssetEntries(
  value: any
): Map<string, { policyHex: string; nameBytes: Uint8Array; qty: bigint }> {
  const out = new Map<
    string,
    { policyHex: string; nameBytes: Uint8Array; qty: bigint }
  >();
  const ma = value.multiasset();
  if (!ma) return out;
  const policies = ma.keys();
  for (let i = 0; i < policies.len(); i += 1) {
    const policy = policies.get(i);
    const policyHex = hexFromBytes(policy.to_bytes());
    const assets = ma.get(policy);
    if (!assets) continue;
    const names = assets.keys();
    for (let j = 0; j < names.len(); j += 1) {
      const assetName = names.get(j);
      const nameBytes = assetName.name();
      const key = policyHex + hexFromBytes(nameBytes);
      const qty = BigInt(assets.get(assetName).to_str());
      const prev = out.get(key);
      out.set(key, {
        policyHex,
        nameBytes,
        qty: (prev?.qty || 0n) + qty,
      });
    }
  }
  return out;
}

function addNativeAssets(
  into: Map<string, { policyHex: string; nameBytes: Uint8Array; qty: bigint }>,
  value: any
) {
  for (const [key, entry] of nativeAssetEntries(value)) {
    const prev = into.get(key);
    into.set(key, {
      ...entry,
      qty: (prev?.qty || 0n) + entry.qty,
    });
  }
}

function subtractNeeded(
  have: Map<string, { policyHex: string; nameBytes: Uint8Array; qty: bigint }>,
  needed: Map<string, bigint>
) {
  const leftover = new Map(have);
  for (const [key, qty] of needed) {
    const prev = leftover.get(key);
    if (!prev) continue;
    const next = prev.qty - qty;
    if (next <= 0n) leftover.delete(key);
    else leftover.set(key, { ...prev, qty: next });
  }
  return leftover;
}

function minAdaForAssetChange(
  Cardano: Csl,
  changeAddress: any,
  leftover: Map<string, { policyHex: string; nameBytes: Uint8Array; qty: bigint }>,
  coinsPerByte: string | number
) {
  const multi = Cardano.MultiAsset.new();
  const byPolicy = new Map<string, { nameBytes: Uint8Array; qty: bigint }[]>();
  for (const entry of leftover.values()) {
    if (entry.qty <= 0n) continue;
    const list = byPolicy.get(entry.policyHex) || [];
    list.push({ nameBytes: entry.nameBytes, qty: entry.qty });
    byPolicy.set(entry.policyHex, list);
  }
  for (const [policyHex, assets] of byPolicy) {
    const bucket = Cardano.Assets.new();
    for (const asset of assets) {
      bucket.insert(
        Cardano.AssetName.new(asset.nameBytes),
        Cardano.BigNum.from_str(asset.qty.toString())
      );
    }
    multi.insert(Cardano.ScriptHash.from_hex(policyHex), bucket);
  }
  const probeCoin = Cardano.BigNum.from_str('1000000000000');
  const probe =
    multi.len() > 0
      ? Cardano.Value.new_with_assets(probeCoin, multi)
      : Cardano.Value.new(probeCoin);
  const output = Cardano.TransactionOutput.new(changeAddress, probe);
  const dataCost = Cardano.DataCost.new_coins_per_byte(
    Cardano.BigNum.from_str(String(coinsPerByte))
  );
  return Cardano.min_ada_for_output(output, dataCost);
}

/**
 * Input selection for a payment that sends native tokens. CSL's
 * LargestFirstMultiAsset can report `UTxO Balance Insufficient` even when the
 * token sits on a small UTxO next to plenty of ADA — it stops once ADA looks
 * covered and never pins the token input. We pin token-covering UTxOs first,
 * then pull ADA until change can hold every leftover asset.
 */
function selectMultiAssetInputsForViableChange({
  Cardano,
  utxos,
  outputs,
  changeAddress,
  protocolParameters,
}: {
  Cardano: Csl;
  utxos: any[];
  outputs: any;
  changeAddress: any;
  protocolParameters: ProtocolParametersSnapshot;
}) {
  const needed = new Map<string, bigint>();
  let targetAda = 0n;
  for (let i = 0; i < outputs.len(); i += 1) {
    const amount = outputs.get(i).amount();
    targetAda += BigInt(amount.coin().to_str());
    for (const [key, entry] of nativeAssetEntries(amount)) {
      needed.set(key, (needed.get(key) || 0n) + entry.qty);
    }
  }

  const remaining = [...utxos];
  const picked: any[] = [];
  const pickedAssets = new Map<
    string,
    { policyHex: string; nameBytes: Uint8Array; qty: bigint }
  >();

  const qtyInPicked = (key: string) => pickedAssets.get(key)?.qty || 0n;

  for (const [key, qty] of needed) {
    while (qtyInPicked(key) < qty) {
      const idx = remaining.findIndex((u) => {
        const have = nativeAssetEntries(u.output().amount()).get(key)?.qty || 0n;
        return have > 0n;
      });
      if (idx < 0) {
        throw new Error(
          'Not enough of the selected token in spendable UTxOs. Check the token amount, or send ADA only.'
        );
      }
      const [u] = remaining.splice(idx, 1);
      picked.push(u);
      addNativeAssets(pickedAssets, u.output().amount());
    }
  }

  const feeHeadroom = 1_000_000n;
  remaining.sort((a, b) =>
    b.output().amount().coin().compare(a.output().amount().coin())
  );

  const pickedAda = () =>
    picked.reduce(
      (sum, u) => sum + BigInt(u.output().amount().coin().to_str()),
      0n
    );

  const wantAda = () => {
    const leftover = subtractNeeded(pickedAssets, needed);
    const minChange = minAdaForAssetChange(
      Cardano,
      changeAddress,
      leftover,
      protocolParameters.coinsPerUtxoWord
    );
    return targetAda + feeHeadroom + BigInt(minChange.to_str());
  };

  // Pull extra ADA while it exists. If the wallet is tight, still return the
  // token-covering inputs and let `add_change_if_needed` decide.
  while (remaining.length > 0 && pickedAda() < wantAda()) {
    const u = remaining.shift();
    picked.push(u);
    addNativeAssets(pickedAssets, u.output().amount());
  }

  if (picked.length === 0 && utxos.length > 0) picked.push(utxos[0]);
  return picked;
}

/**
 * Payment-style unsigned transaction: inputs from UTxO set, explicit outputs, change, TTL.
 * Aligns body fee with `Cardano.min_fee` using ephemeral dummy vkeys (no user keys required).
 *
 * @param {object} opts
 * @param {*} opts.Cardano
 * @param {object} opts.protocolParameters
 * @param {Array} opts.utxos - CSL TransactionUnspentOutput[]
 * @param {*} opts.outputs - CSL TransactionOutputs
 * @param {string} opts.changeAddressBech32
 * @param {string[]} opts.requiredVkeyHashesHex - hex key hashes used only to
 *   size dummy vkey witnesses for fee alignment. Not written to the body.
 * @param {*} [opts.auxiliaryData]
 */
export function buildUnsignedSimpleTx({
  Cardano,
  protocolParameters,
  utxos,
  outputs,
  changeAddressBech32,
  requiredVkeyHashesHex,
  auxiliaryData = null,
}: {
  Cardano: Csl;
  protocolParameters: ProtocolParametersSnapshot;
  utxos: any[];
  outputs: any;
  changeAddressBech32: string;
  requiredVkeyHashesHex: string[];
  auxiliaryData?: any;
}) {
  if (!requiredVkeyHashesHex?.length) {
    throw new Error(
      'requiredVkeyHashesHex must list key hashes that will sign (fee sizing)'
    );
  }
  if (!utxos?.length) {
    throw new Error('No UTxOs provided for transaction');
  }
  const linearFee = Cardano.LinearFee.new(
    Cardano.BigNum.from_str(String(protocolParameters.linearFee.minFeeA)),
    Cardano.BigNum.from_str(String(protocolParameters.linearFee.minFeeB))
  );
  const changeAddress = Cardano.Address.from_bech32(changeAddressBech32);
  const invalidHereafter = ttlInvalidHereafterBignum(Cardano, protocolParameters);

  const utxoCollection = Cardano.TransactionUnspentOutputs.new();
  for (const u of utxos) {
    utxoCollection.add(u);
  }

  // Token transfers may involve multi-asset UTxOs and/or multi-asset change outputs.
  // Using a multi-asset-aware coin selection strategy avoids building transactions
  // that the ledger rejects at submission time.
  let outputHasTokens = false;
  for (let i = 0; i < outputs.len(); i += 1) {
    const multiAsset = outputs.get(i).amount().multiasset();
    if (multiAsset && multiAsset.len() > 0) {
      outputHasTokens = true;
      break;
    }
  }
  let walletHasTokens = false;
  for (const u of utxos) {
    const multiAsset = u.output().amount().multiasset();
    if (multiAsset && multiAsset.len() > 0) {
      walletHasTokens = true;
      break;
    }
  }
  const containsMultiasset = outputHasTokens || walletHasTokens;

  // Token change must stay on one output. prefer_pure_change splits ADA off and
  // then fails min-ADA on the token change — the Send page's "insufficient ADA"
  // when adding a native token.
  const txConfig = createCslTransactionBuilderConfig(
    Cardano,
    protocolParameters,
    { preferPureChange: !containsMultiasset }
  );

  // Multi-asset transfers keep CSL's coin selection (it balances change min-ADA
  // across token bundles). Pure-ADA transfers instead use our own largest-first
  // selection that pulls enough inputs to form a valid change output, avoiding the
  // dead-zone where CSL burns an un-splittable leftover into the fee. See
  // `selectAdaInputsForViableChange`.
  const preSelectedAdaInputs =
    outputHasTokens || containsMultiasset
      ? null
      : selectAdaInputsForViableChange({
          Cardano,
          utxos,
          outputs,
          changeAddress,
          protocolParameters,
        });
  const preSelectedTokenInputs = outputHasTokens
    ? selectMultiAssetInputsForViableChange({
        Cardano,
        utxos,
        outputs,
        changeAddress,
        protocolParameters,
      })
    : null;

  // Use set_min_fee (floor) — never set_fee (exact upper bound) — before change.
  // set_fee + leftover in (fee, minUTxO) throws:
  // "Not enough ADA leftover to include a new change output. And leftovers is bigger than fee upper bound"
  let minFeeFloor = null;

  for (let attempt = 0; attempt < FEE_ALIGN_MAX_ATTEMPTS; attempt += 1) {
    const txBuilder = Cardano.TransactionBuilder.new(txConfig);
    for (let i = 0; i < outputs.len(); i += 1) {
      txBuilder.add_output(outputs.get(i));
    }
    // Fee-sizing hashes must not become required_signers — the ledger would
    // then demand a witness from every enabled address, not just spent inputs.
    // TTL / aux before change so size (and fee) include them.
    txBuilder.set_ttl_bignum(invalidHereafter);
    if (auxiliaryData) {
      txBuilder.set_auxiliary_data(auxiliaryData);
    }
    if (minFeeFloor != null) {
      txBuilder.set_min_fee(minFeeFloor);
    }
    if (outputHasTokens) {
      // Pin token-covering UTxOs, then add_change. Do not use CSL coin
      // selection here — it can miss a small token UTxO and throw
      // "UTxO Balance Insufficient" even when the wallet can fund the send.
      for (const u of preSelectedTokenInputs || []) {
        txBuilder.add_regular_input(
          u.output().address(),
          u.input(),
          u.output().amount()
        );
      }
      try {
        txBuilder.add_change_if_needed(changeAddress);
      } catch (e) {
        const err = e as { message?: string };
        const msg = err?.message ? String(err.message) : String(e);
        if (/leftover|not enough ADA|UTxO Balance Insufficient/i.test(msg)) {
          throw new Error(
            'Not enough ADA left to hold the remaining tokens after this send. Send less ADA, or use Send all.'
          );
        }
        throw e;
      }
    } else if (containsMultiasset) {
      // ADA-only payment from a wallet that also holds tokens. Keep CSL's
      // multi-asset strategy so leftover tokens stay on mixed change.
      try {
        txBuilder.add_inputs_from_and_change(
          utxoCollection,
          Cardano.CoinSelectionStrategyCIP2.LargestFirstMultiAsset,
          Cardano.ChangeConfig.new(changeAddress)
        );
      } catch (e) {
        const err = e as { message?: string };
        const msg = err?.message ? String(err.message) : String(e);
        if (/leftover|not enough ADA/i.test(msg)) {
          throw new Error(
            'Not enough ADA left to hold the remaining tokens after this send. Send less ADA, or use Send all.'
          );
        }
        throw e;
      }
    } else {
      // Pure-ADA: add our change-aware, largest-first input selection explicitly,
      // then a single change pass. With `set_min_fee` (floor, not exact) CSL only
      // burns a leftover into the fee when it is genuinely un-splittable.
      for (const u of preSelectedAdaInputs || []) {
        txBuilder.add_regular_input(
          u.output().address(),
          u.input(),
          u.output().amount()
        );
      }
      txBuilder.add_change_if_needed(changeAddress);
    }

    const txBody = txBuilder.build();

    const emptyW = Cardano.TransactionWitnessSet.new();
    const unsigned = Cardano.Transaction.new(
      txBody,
      emptyW,
      auxiliaryData || undefined
    );
    const dummyW = dummyWitnessSetForMinFee(
      Cardano,
      txBody,
      requiredVkeyHashesHex
    );
    const signedForFee = Cardano.Transaction.new(
      txBody,
      dummyW,
      auxiliaryData || undefined
    );
    signedForFee.set_is_valid(unsigned.is_valid());

    const required = Cardano.min_fee(signedForFee, linearFee);
    if (txBody.fee().compare(required) >= 0) {
      const finalTx = Cardano.Transaction.new(
        txBody,
        emptyW,
        auxiliaryData || undefined
      );
      finalTx.set_is_valid(unsigned.is_valid());
      return toCanonicalTransactionCip21(Cardano, finalTx);
    }
    minFeeFloor = required;
  }

  throw new Error(
    `Could not align transaction fee with ledger minimum after ${FEE_ALIGN_MAX_ATTEMPTS} attempts`
  );
}

/**
 * "Send all" unsigned transaction. Forces EVERY provided UTxO in as an input and
 * sweeps the whole balance — all lovelace plus every native token, minus the
 * network fee — into a single output at the recipient.
 *
 * Unlike `buildUnsignedSimpleTx`, this never runs coin selection: coin selection
 * only pulls the minimum inputs needed to cover a target output, which strands the
 * UTxOs it did not pick. A send-all must instead consume the entire UTxO set, so
 * we add each input explicitly and let one balancing pass compute the fee.
 *
 * The recipient doubles as the change address, so `add_change_if_needed` places
 * the full swept value in one output. CSL sizes the fee (including vkey witnesses
 * inferred from each input's address) and enforces min-ADA. If the wallet genuinely
 * cannot cover the fee plus the min-ADA its tokens require, CSL throws and we
 * surface a clear "not enough ADA" error — the real insufficiency case, not the
 * spurious one the old fee-reduction heuristic produced.
 *
 * @param {object} opts
 * @param {*} opts.Cardano
 * @param {object} opts.protocolParameters
 * @param {Array} opts.utxos - CSL TransactionUnspentOutput[] (all get spent)
 * @param {string} opts.recipientAddressBech32 - destination for the whole balance
 * @param {*} [opts.auxiliaryData]
 */
export function buildUnsignedSendAllTx({
  Cardano,
  protocolParameters,
  utxos,
  recipientAddressBech32,
  auxiliaryData = null,
}: {
  Cardano: Csl;
  protocolParameters: ProtocolParametersSnapshot;
  utxos: any[];
  recipientAddressBech32: string;
  auxiliaryData?: any;
}) {
  if (!utxos?.length) {
    throw new Error('No UTxOs provided for send all');
  }
  const txConfig = createCslTransactionBuilderConfig(
    Cardano,
    protocolParameters,
    { preferPureChange: false }
  );
  const txBuilder = Cardano.TransactionBuilder.new(txConfig);
  const recipientAddress = Cardano.Address.from_bech32(recipientAddressBech32);
  const invalidHereafter = ttlInvalidHereafterBignum(
    Cardano,
    protocolParameters
  );

  // Force every UTxO in — coin selection would pick a subset and strand funds,
  // which is the exact bug that made "send all" leave money behind.
  for (const u of utxos) {
    txBuilder.add_regular_input(
      u.output().address(),
      u.input(),
      u.output().amount()
    );
  }

  // TTL / aux before change so size (and fee) account for them.
  txBuilder.set_ttl_bignum(invalidHereafter);
  if (auxiliaryData) {
    txBuilder.set_auxiliary_data(auxiliaryData);
  }

  // One balancing pass: with the recipient as the change address and no explicit
  // outputs, the whole balance minus fee (every token included) lands in a single
  // output. CSL enforces min-ADA and throws on genuine dust.
  let added;
  try {
    added = txBuilder.add_change_if_needed(recipientAddress);
  } catch (e) {
    throw new Error(
      'Not enough ADA to cover the network fee and the minimum required for the selected assets'
    );
  }
  if (!added) {
    throw new Error(
      'Send all could not produce an output — the wallet balance is empty'
    );
  }

  const txBody = txBuilder.build();
  const emptyW = Cardano.TransactionWitnessSet.new();
  const finalTx = Cardano.Transaction.new(
    txBody,
    emptyW,
    auxiliaryData || undefined
  );
  return toCanonicalTransactionCip21(Cardano, finalTx);
}

// Derive the fee and the total lovelace leaving the wallet straight from the
// built transaction. Send-all produces only recipient outputs (no wallet
// change), so summing output coins is the amount swept. Reading it back from
// CSL keeps the UI off `txInfo.balance`, whose persisted/rehydrated values can
// be non-canonical integer strings that blow up `BigInt()` on stricter engines
// (JavaScriptCore reports this as "Failed to parse String to BigInt").
export function summarizeSendAllTx(Cardano: Csl, finalTx: any) {
  const body = finalTx.body();
  const fee = body.fee().to_str();
  let sent = Cardano.BigNum.zero();
  const outputs = body.outputs();
  for (let i = 0; i < outputs.len(); i += 1) {
    sent = sent.checked_add(outputs.get(i).amount().coin());
  }
  return { fee, sent: sent.to_str() };
}

const DEFAULT_CERT_TX_RETRIES = 5;

function retryCertTx(
  error: unknown,
  retriesRemaining: number,
  label: string,
  totalAttempts: number
) {
  const nextRetries = retriesRemaining - 1;
  if (nextRetries <= 0) {
    throw new Error(
      `${label} failed after ${totalAttempts} attempts: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  return nextRetries;
}

/**
 * Shared skeleton for certificate / withdrawal / voting transactions.
 * Callers install certs, withdrawals, or votes via `configure(txBuilder, Cardano)`.
 *
 * @param {object} opts
 * @param {*} opts.Cardano
 * @param {object} opts.protocolParameters
 * @param {string} opts.changeAddressBech32
 * @param {() => Promise<Array>|Array} opts.getUtxos
 * @param {(txBuilder: *, Cardano: *) => void} opts.configure
 * @param {number} [opts.retries=5]
 * @param {string} [opts.emptyUtxosMessage]
 * @param {string} [opts.label]
 */
export async function assembleCertTx({
  Cardano,
  protocolParameters,
  changeAddressBech32,
  getUtxos,
  configure,
  retries = DEFAULT_CERT_TX_RETRIES,
  emptyUtxosMessage = 'No UTxOs available to pay the transaction fee',
  label = 'Certificate transaction',
}: {
  Cardano: Csl;
  protocolParameters: ProtocolParametersSnapshot;
  changeAddressBech32: string;
  getUtxos: () => Promise<any[]> | any[];
  configure: (txBuilder: any, Cardano: Csl) => void;
  retries?: number;
  emptyUtxosMessage?: string;
  label?: string;
}) {
  if (!changeAddressBech32) {
    throw new Error('Payment address is required to build the transaction');
  }
  if (typeof configure !== 'function') {
    throw new Error('assembleCertTx requires a configure(txBuilder, Cardano) callback');
  }
  if (typeof getUtxos !== 'function') {
    throw new Error('assembleCertTx requires getUtxos()');
  }

  const totalAttempts = retries;
  let selectionRetries = retries;

  while (selectionRetries > 0) {
    try {
      const txBuilder = Cardano.TransactionBuilder.new(
        createCslTransactionBuilderConfig(Cardano, protocolParameters)
      );
      configure(txBuilder, Cardano);
      txBuilder.set_ttl_bignum(
        ttlInvalidHereafterBignum(Cardano, protocolParameters)
      );

      const utxos = await getUtxos();
      if (!utxos || utxos.length === 0) {
        throw new Error(emptyUtxosMessage);
      }

      const changeAddress = Cardano.Address.from_bech32(changeAddressBech32);
      const utxoCollection = Cardano.TransactionUnspentOutputs.new();
      utxos.forEach((utxo) => utxoCollection.add(utxo));
      txBuilder.add_inputs_from(
        utxoCollection,
        Cardano.CoinSelectionStrategyCIP2.RandomImproveMultiAsset
      );
      txBuilder.add_change_if_needed(changeAddress);

      const txBody = txBuilder.build();
      const tx = Cardano.Transaction.new(
        txBody,
        Cardano.TransactionWitnessSet.new()
      );
      return toCanonicalTransactionCip21(Cardano, tx);
    } catch (error) {
      selectionRetries = retryCertTx(error, selectionRetries, label, totalAttempts);
    }
  }
}
