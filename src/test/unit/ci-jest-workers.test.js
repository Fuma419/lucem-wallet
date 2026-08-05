/**
 * Guard: Jenkins unit stage must serialize Jest to avoid WASM SIGSEGV flakes.
 */
const fs = require('fs');
const path = require('path');

describe('jest CI worker serialization', () => {
  test('jest.config uses maxWorkers 1 under CI/Jenkins', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../jest.config.js'),
      'utf8'
    );
    expect(src).toMatch(/maxWorkers:\s*1/);
    expect(src).toMatch(/JENKINS_URL/);
  });

  test('Jenkinsfile exports CI=1 for unit tests', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../Jenkinsfile'),
      'utf8'
    );
    expect(src).toMatch(/export CI=1/);
    expect(src).toMatch(/SIGSEGV/);
  });
});
