// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'production';
process.env.NODE_ENV = 'production';
process.env.ASSET_PATH = '/';

var webpack = require('webpack'),
  config = require('../webpack.config'),
  fs = require('fs');

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
  }
});
