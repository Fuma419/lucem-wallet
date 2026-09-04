// webpack.config.js
var webpack = require('webpack'),
  path = require('path'),
  fileSystem = require('fs-extra'),
  env = require('./utils/env'),
  { CleanWebpackPlugin } = require('clean-webpack-plugin'),
  CopyWebpackPlugin = require('copy-webpack-plugin'),
  HtmlWebpackPlugin = require('html-webpack-plugin'),
  TerserPlugin = require('terser-webpack-plugin'),
  CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin'),
  NodePolyfillPlugin = require('node-polyfill-webpack-plugin');

// Use only this import for EsbuildPlugin.
const { EsbuildPlugin } = require('esbuild-loader');
console.log("EsbuildPlugin:", EsbuildPlugin);

require('dotenv').config();

const ASSET_PATH = process.env.ASSET_PATH || '/';

let alias = {};

// load the secrets
var secretsPath = path.join(__dirname, 'secrets.' + env.NODE_ENV + '.js');

require('dotenv-defaults').config({
  path: './.env',
  encoding: 'utf8',
});

let fileExtensions = [
  'jpg',
  'webp',
  'jpeg',
  'png',
  'gif',
  'eot',
  'otf',
  'svg',
  'ttf',
  'woff',
  'woff2',
];

if (fileSystem.existsSync(secretsPath)) {
  alias['secrets'] = secretsPath;
}

const isDevelopment = process.env.NODE_ENV === 'development';

// Inline these into the browser bundle. Blockfrost project ids live in `.env`
// (or the host CI/Vercel env); without exposing them here `process.env.*` is
// undefined at runtime and provider.js falls back to the dummy Koios secrets,
// which forces governance/voting to always drop to the Koios API.
// Empty-string defaults keep builds green when a key is not configured.
const envsToExpose = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  BLOCKFROST_PROJECT_ID_MAINNET: '',
  BLOCKFROST_MAINNET_PROJECT_ID: '',
  BLOCKFROST_PROJECT_ID_TESTNET: '',
  BLOCKFROST_TESTNET_PROJECT_ID: '',
  BLOCKFROST_PROJECT_ID_PREPROD: '',
  BLOCKFROST_PREPROD_PROJECT_ID: '',
  BLOCKFROST_PROJECT_ID_PREVIEW: '',
  BLOCKFROST_PREVIEW_PROJECT_ID: '',
};

const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');


// Preloadable assets
const preloadImages = `
  <link rel="preload" as="image" href="/assets/img/background-cyan.webp">
  <link rel="preload" as="image" href="/assets/img/background-purple.webp">
  <link rel="preload" as="image" href="/assets/img/background-green.webp">
  <link rel="preload" as="image" href="/assets/img/logoWhite.png">
`;



const options = {
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename]
    }
  },
  devtool: 'source-map',
  experiments: {
    asyncWebAssembly: true,
  },
  mode: process.env.NODE_ENV || 'development',
  entry: {
    mainPopup: path.join(__dirname, 'src', 'ui', 'indexMain.jsx'),
    internalPopup: path.join(__dirname, 'src', 'ui', 'indexInternal.jsx'),
    hwTab: path.join(__dirname, 'src', 'ui', 'app', 'tabs', 'hw.jsx'),
    createWalletTab: path.join(__dirname, 'src', 'ui', 'app', 'tabs', 'createWallet.jsx'),
    keystoneTx: path.join(__dirname, 'src', 'ui', 'app', 'tabs', 'keystoneTx.jsx'),
    background: path.join(__dirname, 'src', 'pages', 'Background', 'index.js'),
    contentScript: path.join(__dirname, 'src', 'pages', 'Content', 'index.js'),
    injected: path.join(__dirname, 'src', 'pages', 'Content', 'injected.js'),
  },
  chromeExtensionBoilerplate: {
    notHotReload: ['contentScript', 'devtools', 'injected'],
  },
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: '[name].bundle.js',
    publicPath: ASSET_PATH,
  },
  module: {
    rules: [
      {
        resourceQuery: /raw/,
        type: 'asset/source',
      },
      {
        test: /\.(js|jsx|ts|tsx)$/,
        loader: 'swc-loader',
        options: {
          jsc: {
            parser: {
              syntax: 'typescript',
              tsx: true,
            },
            target: 'es2019',
            loose: false,
            transform: {
              react: {
                development: isDevelopment,
                refresh: isDevelopment,
              },
            },
          },
        },
        resolve: {
          fullySpecified: false,
        },
      },
      {
        test: /\.(css|scss)$/,
        use: [
          {
            loader: 'style-loader',
          },
          {
            loader: 'css-loader',
          },
          {
            loader: 'sass-loader',
            options: {
              sourceMap: true,
            },
          },
        ],
      },
      {
        test: /\.(woff|woff2)$/,
        loader: 'file-loader',
        options: { name: '[name].[ext]' },
      },
      {
        test: new RegExp('.(' + fileExtensions.join('|') + ')$'),
        loader: 'file-loader',
        options: {
          name: '[name].[ext]',
        },
        exclude: /node_modules/,
      },
      {
        test: /\.html$/,
        loader: 'html-loader',
        options: {
          sources: {
            urlFilter: (attribute, value) => {
              if (
                value.startsWith('/assets/') ||
                value.startsWith('/manifest') ||
                value.startsWith('/favicon')
              ) {
                return false;
              }
              return true;
            },
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    alias: alias,
    extensions: fileExtensions
      .map((extension) => '.' + extension)
      .concat(['.js', '.jsx', '.css', '.ts', '.tsx']),
      fallback: {
        fs: false, // disable fs module for browser builds
        net: false,
        tls: false,
      },
  },
  plugins: [
    ...(isDevelopment ? [new ReactRefreshWebpackPlugin(), new webpack.HotModuleReplacementPlugin()] : []),
    new webpack.BannerPlugin({
      banner: () => {
        return 'globalThis.document={getElementsByTagName:()=>[],createElement:()=>({ setAttribute:()=>{}}),head:{appendChild:()=>{}}};';
      },
      test: /background.bundle.js/,
      raw: true,
    }),
    new NodePolyfillPlugin(),
    // Fail locally (case-insensitive macOS/Windows) on any import whose casing
    // does not match the file on disk, matching Vercel's case-sensitive Linux FS.
    new CaseSensitivePathsPlugin(),
    new webpack.ProgressPlugin(),
    new CleanWebpackPlugin({
      verbose: true,
      cleanStaleWebpackAssets: true,
    }),
    new webpack.EnvironmentPlugin(envsToExpose),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/assets/img',
          to: path.join(__dirname, 'build', 'assets', 'img'),
          force: true,
        },
        {
          from: 'src/manifest.webmanifest',
          to: path.join(__dirname, 'build'),
          force: true,
        },
        {
          from: 'src/assets/img/favicon-dark.ico',
          to: path.join(__dirname, 'build', 'favicon.ico'),
          force: true,
        },
        {
          from: 'src/manifest.json',
          to: path.join(__dirname, 'build'),
          force: true,
          transform: function (content) {
            // package.json is the single source of truth for version.
            // Spread the source manifest first, then overwrite version so a
            // stale/missing src/manifest.json version cannot win.
            const manifest = JSON.parse(content.toString());
            return Buffer.from(
              JSON.stringify({
                ...manifest,
                version: process.env.npm_package_version,
              })
            );
          },
        },
      ],
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Popup', 'internalPopup.html'),
      filename: 'internalPopup.html',
      chunks: ['internalPopup'],
      cache: false,
      inject: 'head',
      templateParameters: {
        preloadImages,
      },
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Popup', 'mainPopup.html'),
      filename: 'mainPopup.html',
      chunks: ['mainPopup'],
      cache: false,
      inject: 'head',
      templateParameters: {
        preloadImages,
      },
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Tab', 'hwTab.html'),
      filename: 'hwTab.html',
      chunks: ['hwTab'],
      cache: false,
      inject: 'head',
      templateParameters: {
        preloadImages,
      },
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Tab', 'createWalletTab.html'),
      filename: 'createWalletTab.html',
      chunks: ['createWalletTab'],
      cache: false,
      inject: 'head',
      templateParameters: {
        preloadImages,
      },
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Tab', 'keystoneTx.html'),
      filename: 'keystoneTx.html',
      chunks: ['keystoneTx'],
      cache: false,
      inject: 'head',
      templateParameters: {
        preloadImages,
      },
    }),
  ],
  infrastructureLogging: {
    level: 'info',
  },
  ignoreWarnings: [
    {
      message: /Failed to parse source map/,
    },
  ],
};

if (!isDevelopment) {
  options.optimization = {
    minimize: true,
    minimizer: [
      new EsbuildPlugin({
        target: 'esnext',
        legalComments: 'none'
      }),
    ],
  };
}

module.exports = options;
