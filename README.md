<p align="center"><img width="200px" src="./src/assets/img/bannerBlack.svg"></img></p>

# Lucem

Lucem is a browser based wallet extension to interact with the Cardano blockchain. It's an open-source project forked from Nami, which is maintained by [**IOG**](https://iohk.io/en/blog/posts/2023/11/01/nami-has-a-new-home/).

## Features

- **Direct Koios Integration**: Uses Koios API directly without Blaze SDK
- **Hardware Wallet Support**: Ledger and Trezor integration
- **CIP-30 Compliant**: Full dApp connector support
- **Multi-Account Support**: Manage multiple accounts
- **Token Management**: Native token support
- **Staking**: Delegate to stake pools
- **Cross-Platform**: Chrome, Firefox, Edge support
- **Lightweight**: No heavy SDK dependencies

## Testnet

Download and extract the zip attached to the latest [Release](https://github.com/Fuma419/lucem-wallet/releases). Then go to `chrome://extensions`, click Load unpacked at the top left and select the build folder.

## API Integration

### Koios API

Lucem uses Koios API for blockchain data. Koios provides:
- Real-time Cardano blockchain data
- Comprehensive API coverage
- High performance and reliability
- No API key required for basic usage

### Supported Networks

- **Mainnet**: `https://api.koios.rest/api/v1`
- **Testnet**: `https://testnet.koios.rest/api/v1`
- **Preview**: `https://preview.koios.rest/api/v1`
- **Preprod**: `https://preprod.koios.rest/api/v1`

## Injected API

Since Lucem is a browser extension, it can inject content inside the web context, which means you can connect the wallet to any website.
The exposed API follows [CIP-0030](https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030). The returned types are in `cbor`/`bytes` format. A helpful library for serializing and de-serializing these low-level data structures is the [serialization-lib](https://github.com/Emurgo/cardano-serialization-lib). To verify a signature returned from `cardano.dataSign(address, payload)` the [message-signing](https://github.com/Emurgo/message-signing) library helps.

#### Basic Usage

- Detect the Cardano provider (`window.cardano`) and detect Lucem (`window.cardano.lucem`)
- Request the `api` from `window.cardano.lucem.enable()`
- Detect which Cardano network the user is connected to (ID 1 = Mainnet, ID 0 = Testnet)
- Get the user's Cardano account

#### Methods

The full list of methods can be found in [CIP-0030](https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030).
For the wallet namespace Lucem uses `lucem`.

**Note:** Lucem follows the ongoing [PR](https://github.com/cardano-foundation/CIPs/pull/148) for the `dataSign` endpoint. (Very similar to the previous `dataSign` endpoint from Nami).

Lucem also uses a few custom endpoints, which are available under `api.experimental`:

##### api.experimental.getCollateral()

```
cardano.getCollateral() : [TransactionUnspentOutput]
```

##### api.experimental.on(eventName, callback)

Register events coming from Lucem. Available events are:

```
accountChange: ((addresses : [BaseAddress]) => void)
networkChange: ((network : number) => void)
```

##### api.experimental.off(eventName, callback)

Deregister the events (works also with anonymous functions).

---

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. **Set up environment variables:**
   ```bash
   # Copy the example environment file
   cp .env.example .env
   
   # Edit .env and add your Koios API keys (optional)
   # KOIOS_API_KEY_MAINNET=your-actual-api-key
   # KOIOS_API_KEY_TESTNET=your-actual-api-key
   # KOIOS_API_KEY_PREVIEW=your-actual-api-key
   # KOIOS_API_KEY_PREPROD=your-actual-api-key
   ```
4. Build the extension: `npm run build`

### Environment Variables

The wallet uses environment variables for configuration. Create a `.env` file in the root directory:

```bash
# Koios API Keys (optional - wallet works without them)
KOIOS_API_KEY_MAINNET=your-koios-api-key-here
KOIOS_API_KEY_TESTNET=your-koios-api-key-here
KOIOS_API_KEY_PREVIEW=your-koios-api-key-here
KOIOS_API_KEY_PREPROD=your-koios-api-key-here

# Other environment variables
NAMI_HEADER=dummy
```

**Note:** Koios API keys are optional. The wallet will work perfectly without them, but you'll get enhanced rate limits and features if you provide them.

### Koios Migration

Lucem has been migrated from Blockfrost to Koios API. Key changes:

- **API Endpoints**: Updated to use Koios endpoints
- **Response Format**: Added compatibility layer for response formats
- **No API Keys Required**: Koios doesn't require API keys for basic usage
- **Enhanced Performance**: Better caching and response handling
- **Environment Variables**: Support for .env file configuration

### Build

```bash
npm run build
```

The built extension will be in the `build/` directory.

## License

[Apache-2.0](LICENSE)
