// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'development';
process.env.NODE_ENV = 'development';
process.env.ASSET_PATH = '/';

var ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
var WebpackDevServer = require('webpack-dev-server'),
  webpack = require('webpack'),
  config = require('../webpack.config'),
  env = require('./env'),
  path = require('path');

var options = config.chromeExtensionBoilerplate || {};
var excludeEntriesToHotReload = options.notHotReload || [];

for (var entryName in config.entry) {
  if (excludeEntriesToHotReload.indexOf(entryName) === -1) {
    config.entry[entryName] = [
      'webpack-dev-server/client?http://localhost:' + env.PORT,
      'webpack/hot/dev-server',
    ].concat(config.entry[entryName]);
  }
}

config.plugins = [
  new webpack.HotModuleReplacementPlugin(),
  new ReactRefreshWebpackPlugin(),
].concat(config.plugins || []);

delete config.chromeExtensionBoilerplate;

var compiler = webpack(config);

const server = new WebpackDevServer({
  server: {
    type: 'http', // Changed from https: false to server: { type: 'http' }
  },
  hot: true, // Keep hot reloading enabled
  client: {
    overlay: false, // Disable overlay in the browser for runtime errors
  },
  devMiddleware: {
    publicPath: `http://localhost:${env.PORT}/`, // Public path to serve files
    writeToDisk: true, // Write files to disk
  },
  liveReload: false, // Disable live reloading (not necessary with hot reloading)
  port: env.PORT, // Port number for the dev server
  static: {
    directory: path.join(__dirname, '../build'), // Directory to serve static files from
  },
  headers: {
    'Access-Control-Allow-Origin': '*', // Set headers to allow cross-origin requests
  },
  allowedHosts: 'all', // Allow all hosts to connect
}, compiler);

// Start the server using the new async `startCallback` method
server.startCallback(() => {
  console.log(`Dev server is running at http://localhost:${env.PORT}`);
});

// Ensure Hot Module Replacement works in development
if (process.env.NODE_ENV === 'development' && module.hot) {
  module.hot.accept();
}
