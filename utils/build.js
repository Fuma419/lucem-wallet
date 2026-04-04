// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'production';
process.env.NODE_ENV = 'production';
process.env.ASSET_PATH = '/';

var fs = require('fs'),
  path = require('path'),
  spawn = require('child_process').spawn;

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
    
    // Clear console and show build completion message
    console.clear();
    console.log('\n');
    console.log('✅ Build completed successfully!');
    console.log(`📅 Time: ${buildInfo.formattedTime}`);
    console.log(`⏱️  Duration: ${buildInfo.duration}`);
    console.log(`📂 Version: ${buildInfo.version}`);
    console.log('\n');
    console.log('✨ Build information saved to build/build-info.json');
    console.log('\n');

    if (!process.env.CI && process.env.LUCEM_SKIP_SERVE !== '1') {
      startLocalPwaPreview();
    }
  }
});
