# Koios Migration Guide

This document outlines the migration of Lucem wallet from Blockfrost API to Koios API and the removal of Blaze SDK.

## Overview

Lucem has been successfully migrated from Blockfrost to Koios API and removed the Blaze SDK dependency to provide:
- Better performance and reliability
- No API key requirements for basic usage
- Enhanced caching and response handling
- More comprehensive Cardano API coverage
- **Lightweight architecture** - No heavy SDK dependencies
- **Direct control** - Full control over transaction building
- **Better maintainability** - Simpler codebase with fewer dependencies

## Key Changes

### 1. API Endpoints

| Blockfrost | Koios | Description |
|------------|-------|-------------|
| `/blocks/latest` | `/blocks/latest` | Latest block information |
| `/epochs/latest/parameters` | `/epoch_params/latest` | Protocol parameters |
| `/addresses/{address}/transactions` | `/addresses/{address}/transactions` | Address transactions |
| `/addresses/{address}/utxos` | `/addresses/{address}/utxos` | Address UTXOs |
| `/accounts/{stake_address}` | `/accounts/{stake_address}` | Stake account info |
| `/txs/{tx_hash}` | `/txs/{tx_hash}` | Transaction details |
| `/txs/{tx_hash}/utxos` | `/txs/{tx_hash}/utxos` | Transaction UTXOs |
| `/txs/{tx_hash}/metadata` | `/txs/{tx_hash}/metadata` | Transaction metadata |
| `/assets/{asset}` | `/assets/{asset}` | Asset information |
| `/pools/{pool_id}/metadata` | `/pools/{pool_id}/metadata` | Pool metadata |

### 2. Architecture Changes

#### Before (Blockfrost + Blaze)
```javascript
// Used Blaze SDK for transaction building
const blaze = await getBlazeProvider();
const tx = blaze.newTransaction()
  .addOutput(output)
  .setChangeAddress(address);
const result = await tx.complete();
```

#### After (Koios + Direct Cardano Serialization)
```javascript
// Direct Cardano serialization library usage
const txBuilder = Loader.Cardano.TransactionBuilder.new(config);
txBuilder.add_input(address, input, amount);
txBuilder.add_output(output);
txBuilder.add_change_if_needed(changeAddress);
const txBody = txBuilder.build();
const tx = Loader.Cardano.Transaction.new(txBody, witnessSet);
```

### 3. Dependencies Removed

- `@blaze-cardano/sdk` - Replaced with direct Cardano serialization
- `@blaze-cardano/wallet` - No longer needed
- `@blaze-cardano/core` - Replaced with direct Cardano serialization

### 4. Dependencies Added/Enhanced

- Direct usage of `@emurgo/cardano-serialization-lib-browser`
- Enhanced Koios API integration
- Environment variable support for API keys

## Implementation Details

### 1. Transaction Building

#### New Direct Approach
```javascript
export const buildTx = async (account, utxos, outputs, protocolParameters) => {
  const txBuilder = Loader.Cardano.TransactionBuilder.new(config);
  
  // Add inputs
  for (const utxo of utxos) {
    const txInput = Loader.Cardano.TransactionInput.new(
      Loader.Cardano.TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, 'hex')),
      utxo.tx_index
    );
    txBuilder.add_input(account.paymentAddr, txInput, utxo.amount);
  }
  
  // Add outputs
  for (const output of outputs) {
    const txOutput = Loader.Cardano.TransactionOutput.new(
      Loader.Cardano.Address.from_bech32(output.address),
      output.amount
    );
    txBuilder.add_output(txOutput);
  }
  
  // Build transaction
  const txBody = txBuilder.build();
  const tx = Loader.Cardano.Transaction.new(txBody, witnessSet);
  
  return toCanonicalTx(tx);
};
```

### 2. Benefits of Direct Approach

- **Performance**: Faster transaction building without SDK overhead
- **Control**: Full control over transaction construction
- **Size**: Smaller bundle size without Blaze dependencies
- **Maintainability**: Simpler codebase with fewer abstractions
- **Flexibility**: Easy to customize transaction building logic

## Benefits of Koios Migration

### 1. Performance
- Faster response times
- Better caching mechanisms
- Optimized for Cardano queries
- **Reduced bundle size** - No Blaze SDK

### 2. Reliability
- No API key requirements
- Higher rate limits
- Better uptime
- **Direct control** - No SDK abstraction layer

### 3. Features
- More comprehensive API coverage
- Better support for advanced Cardano features
- Enhanced transaction handling
- **Custom transaction building** - Full control over logic

### 4. Cost
- No API key costs
- No usage-based pricing
- Free for all usage levels
- **Reduced dependency costs** - Fewer third-party packages

## Migration Checklist

- [x] Update API endpoints
- [x] Implement response format conversion
- [x] Update configuration files
- [x] Remove Blaze SDK dependencies
- [x] Implement direct transaction building
- [x] Test all network connections
- [x] Verify transaction functionality
- [x] Update documentation
- [x] Test backward compatibility
- [x] Performance testing
- [x] Bundle size optimization

## Future Enhancements

### 1. Advanced Koios Features
- Implement Koios-specific optimizations
- Add support for advanced querying
- Utilize Koios-specific endpoints

### 2. Performance Optimizations
- Implement intelligent caching
- Add request batching
- Optimize for high-frequency operations
- **Transaction building optimizations**

### 3. Monitoring
- Add Koios API monitoring
- Implement health checks
- Add performance metrics
- **Bundle size monitoring**

## Conclusion

The migration to Koios API and removal of Blaze SDK provides significant improvements in performance, reliability, cost-effectiveness, and maintainability while maintaining full backward compatibility with existing Lucem wallet functionality. The direct approach gives us complete control over transaction building and reduces dependencies. 