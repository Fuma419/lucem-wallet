const runIntegration = process.env.LUCEM_RUN_INTEGRATION === '1';
// Parallel Jest workers + CSL/Keystone native modules occasionally SIGSEGV on
// the Jenkins agent (flake across unrelated suites). Serialize there only.
const isCi = Boolean(
  process.env.CI || process.env.JENKINS_URL || process.env.GITHUB_ACTIONS
);

// Coverage gate for the money-path modules (tx assembly + wallet orchestration).
// Enforced in CI only so local `npx jest` stays fast; thresholds sit just below
// the current numbers so they pass today and can be ratcheted up over time.
// This turns the "string-grep gives false confidence" finding into an
// executable floor: these modules can never silently lose real test coverage.
//
// The floor is owned by the FULL unit run (`npm test`), whose suites exercise
// these modules. The integration run (`npm run test:integration`,
// LUCEM_RUN_INTEGRATION=1) is a narrow live-send smoke that legitimately touches
// only a slice of the money path, so it is exempt — otherwise a green live send
// would still fail CI on unrelated coverage math.
const coverageGate =
  isCi && !runIntegration
    ? {
      collectCoverage: true,
      collectCoverageFrom: [
        'src/api/tx/**/*.js',
        'src/api/extension/wallet.js',
      ],
      coverageReporters: ['text-summary'],
      coverageThreshold: {
        './src/api/tx/': {
          statements: 75,
          branches: 60,
          functions: 85,
          lines: 75,
        },
        './src/api/extension/wallet.js': {
          statements: 55,
          branches: 45,
          functions: 55,
          lines: 55,
        },
      },
    }
  : {};

module.exports = {
  ...(isCi ? { maxWorkers: 1 } : {}),
  ...coverageGate,
  testPathIgnorePatterns: [
    '/node_modules/',
    '/yoroi-frontend/',
    '/koios-artifacts/',
    '/e2e/',
    ...(runIntegration ? [] : ['/src/test/integration/']),
  ],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/src/test/__mocks__/fileMock.js',
    '\\.(css|less)$': '<rootDir>/src/test/__mocks__/styleMock.js',
    '@emurgo/cardano-serialization-lib-browser':
      '@emurgo/cardano-serialization-lib-nodejs',
    '^(.*)../wasm/cardano_message_signing/cardano_message_signing.generated(.*)$':
      '$1../wasm/cardano_message_signing/nodejs/cardano_message_signing.generated$2',
    secrets: '../../secrets.testing.js',
  },
  transform: {
    '^.+\\.(ts|tsx)?$': 'ts-jest',
    '^.+\\.(js|jsx)$': ['babel-jest', { configFile: './babel.config.js' }],
    'src/wasm/cardano_multiplatform_lib/cardano_multiplatform_lib.generated\\.js$': ['babel-jest', { configFile: './babel.config.js' }],
  },

  transformIgnorePatterns: [
    '/node_modules/(?!crypto-random-string|@dicebear|@babel/runtime)',
  ],
  setupFilesAfterEnv: ['./jest.setup.js'],
};
