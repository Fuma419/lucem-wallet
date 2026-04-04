module.exports = {
  testPathIgnorePatterns: [
    '/node_modules/',
    '/yoroi-frontend/',
    '/koios-artifacts/',
    '/e2e/',
  ],
  moduleNameMapper: {
    '@emurgo/cardano-serialization-lib-browser':
      '@emurgo/cardano-serialization-lib-nodejs',
    '^(.*)../wasm/cardano_message_signing/cardano_message_signing.generated(.*)$':
      '$1../wasm/cardano_message_signing/nodejs/cardano_message_signing.generated$2',
    secrets: '../../secrets.testing.js',
  },
  transform: {
    '^.+\\.(ts|tsx)?$': 'ts-jest',
    '^.+\\.js$': ['babel-jest', { configFile: './babel.config.js' }],
    'src/wasm/cardano_multiplatform_lib/cardano_multiplatform_lib.generated\\.js$': ['babel-jest', { configFile: './babel.config.js' }],
  },

  transformIgnorePatterns: [
    '/node_modules/(?!crypto-random-string|@dicebear|@babel/runtime)',
  ],
  setupFilesAfterEnv: ['./jest.setup.js'],
};
