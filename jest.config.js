const runIntegration = process.env.LUCEM_RUN_INTEGRATION === '1';

module.exports = {
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
