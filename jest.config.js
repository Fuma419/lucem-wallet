module.exports = {
  moduleNameMapper: {
    // mock out the browser version of WASM bindings with the nodejs bindings
    '@dcspark/cardano-multiplatform-lib-browser':
      '@dcspark/cardano-multiplatform-lib-nodejs',
    '^(.*)../wasm/cardano_message_signing/cardano_message_signing.generated(.*)$':
      '$1../wasm/cardano_message_signing/nodejs/cardano_message_signing.generated$2',
    // blockfrost keys
    secrets: '../../secrets.testing.js',
  },
  transform: {
    '^.+\\.(ts|tsx)?$': 'ts-jest',
    '^.+\\.js$': ['babel-jest', { configFile: './babel.config.js' }],
    'src/wasm/cardano_multiplatform_lib/cardano_multiplatform_lib.generated\\.js$': ['babel-jest', { configFile: './babel.config.js' }],
  },

  transformIgnorePatterns: [
    '/node_modules/(?!crypto-random-string|@dicebear/core|@dicebear/collection|@dicebear/adventurer|@dicebear/avatars|@babel/runtime)', // Include @babel/runtime
  ],
  setupFilesAfterEnv: ['./jest.setup.js'],
};
