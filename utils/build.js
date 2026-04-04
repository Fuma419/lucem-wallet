// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'production';
process.env.NODE_ENV = 'production';
process.env.ASSET_PATH = '/';

var fs = require('fs'),
  path = require('path'),
  spawn = require('child_process').spawn;

/**
 * `serve` reads serve.json from the directory being served (build/).
 * Cardano Serialization Lib’s browser WASM uses wasm-bindgen helpers that call
 * `new Function(...)`, which MV3 extension CSP blocks; a normal http://localhost
 * tab needs an explicit policy that allows it (extension manifest CSP cannot).
 */
function writeLocalPreviewServeConfig(buildDir) {
  var csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com blob:",
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src https: http: ws: wss: data: blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' https://connect.trezor.io",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  var cfg = {
    headers: [
      {
        source: '**',
        headers: [{ key: 'Content-Security-Policy', value: csp }],
      },
    ],
  };
  fs.writeFileSync(
    path.join(buildDir, 'serve.json'),
    JSON.stringify(cfg, null, 2)
  );
}

function startLocalPwaPreview() {
  var env = require('./env');
  var root = path.join(__dirname, '..');
  var port = String(process.env.PORT || env.PORT || 3000);
  var walletUrl = 'http://localhost:' + port + '/mainPopup.html';
  var serveMain;
  try {
    serveMain = require.resolve('serve/build/main.js');
  } catch (e) {
    console.error(
      'Could not resolve `serve`. Install devDependencies: NODE_ENV=development npm install'
    );
    process.exit(1);
  }
  console.log('🌐 PWA (production build) — open the wallet UI at:');
  console.log('   ' + walletUrl);
  console.log(
    '   (The `serve` line below may show only http://localhost:' +
      port +
      ' — use /mainPopup.html for the app.)'
  );
  console.log('📦 Chrome extension: chrome://extensions → Load unpacked → select build/');
  console.log(
    '   MV3 extension pages cannot run CSL WASM helpers (new Function); if you see CSP/eval errors'
  );
  console.log(
    '   on create-wallet tabs, open the same HTML from the URL above (e.g. …/createWalletTab.html?…).'
  );
  console.log('   Stop the preview server with Ctrl+C.\n');
  console.log('   (Set CI=true or LUCEM_SKIP_SERVE=1 to skip serving.)\n');
  var child = spawn(process.execPath, [serveMain, 'build', '-l', port], {
    cwd: root,
    stdio: 'inherit',
  });
  child.on('error', function (err) {
    console.error('Failed to start preview server:', err);
    process.exit(1);
  });
  child.on('exit', function (code, signal) {
    if (signal) {
      process.exit(1);
    }
    process.exit(code == null ? 1 : code);
  });
}

// Auto-generate secrets.production.js before webpack config is loaded,
// since webpack.config.js checks for this file at require-time.
var secretsProdPath = path.join(__dirname, '..', 'secrets.production.js');
if (!fs.existsSync(secretsProdPath)) {
  var secretsTemplatePath = path.join(__dirname, '..', 'secrets.testing.js');
  if (fs.existsSync(secretsTemplatePath)) {
    fs.copyFileSync(secretsTemplatePath, secretsProdPath);
    console.log('Generated secrets.production.js from secrets.testing.js template');
  }
}

var webpack = require('webpack'),
  config = require('../webpack.config');

delete config.chromeExtensionBoilerplate;

config.mode = 'production';

const buildStartTime = new Date();
console.log(`Build started at: ${buildStartTime.toLocaleString()}`);

webpack(config, function (err, stats) {
  if (err) {
    console.error('Webpack error:', err);
    throw err;
  }

  if (stats && stats.hasErrors()) {
    console.log(
      stats.toString({
        colors: true,
      })
    );
    process.exit(1);
  } else {
    const buildEndTime = new Date();
    const buildDuration = (buildEndTime - buildStartTime) / 1000; // in seconds
    
    const buildInfo = {
      completedAt: buildEndTime.toISOString(),
      formattedTime: buildEndTime.toLocaleString(),
      duration: `${buildDuration.toFixed(2)} seconds`,
      version: require('../package.json').version
    };
    
    // Save to a file in the build directory
    const buildInfoPath = './build/build-info.json';
    fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
    writeLocalPreviewServeConfig(path.join(__dirname, '..', 'build'));

    // Clear console and show build completion message
    console.clear();
    console.log('\n');
    console.log('✅ Build completed successfully!');
    console.log(`📅 Time: ${buildInfo.formattedTime}`);
    console.log(`⏱️  Duration: ${buildInfo.duration}`);
    console.log(`📂 Version: ${buildInfo.version}`);
    console.log('\n');
    console.log('✨ Build information saved to build/build-info.json');
    console.log(
      '🔒 Local preview CSP: build/serve.json (allows WASM bindgen new Function for http://localhost only)'
    );
    console.log('\n');

    if (!process.env.CI && process.env.LUCEM_SKIP_SERVE !== '1') {
      startLocalPwaPreview();
    }
  }
});
