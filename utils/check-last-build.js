#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const buildInfoPath = path.join(__dirname, '../build/build-info.json');

try {
  // Check if the build info file exists
  if (fs.existsSync(buildInfoPath)) {
    const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
    
    // Calculate time since last build
    const buildTime = new Date(buildInfo.completedAt);
    const now = new Date();
    const timeSinceBuild = (now - buildTime) / 1000; // in seconds
    
    let timeAgo;
    if (timeSinceBuild < 60) {
      timeAgo = `${Math.floor(timeSinceBuild)} seconds ago`;
    } else if (timeSinceBuild < 3600) {
      timeAgo = `${Math.floor(timeSinceBuild / 60)} minutes ago`;
    } else if (timeSinceBuild < 86400) {
      timeAgo = `${Math.floor(timeSinceBuild / 3600)} hours ago`;
    } else {
      timeAgo = `${Math.floor(timeSinceBuild / 86400)} days ago`;
    }
    
    console.log('\n');
    console.log('🔍 Last build information:');
    console.log('------------------------');
    console.log(`📅 Time: ${buildInfo.formattedTime} (${timeAgo})`);
    console.log(`⏱️  Duration: ${buildInfo.duration}`);
    console.log(`📂 Version: ${buildInfo.version}`);
    console.log('\n');
  } else {
    console.log('\n');
    console.log('❌ No build information found.');
    console.log('Run "npm run build" to create a build with timestamp.');
    console.log('\n');
  }
} catch (error) {
  console.error('Error reading build information:', error.message);
} 