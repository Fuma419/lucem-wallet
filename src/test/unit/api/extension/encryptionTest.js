// Manual test script for encryptWithPassword function
const {
  encryptWithPassword,
  decryptWithPassword
} = require('../../../../api/extension');

const Loader = require('../../../../api/loader').default;

async function testEncryption() {
  console.log('Starting encryption test...');
  
  try {
    await Loader.load();
    
    // Create test data
    const testPassword = 'testPassword123';
    const testData = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    
    console.log('Test data:', testData);
    
    // Encrypt the data
    const encrypted = await encryptWithPassword(testData, testPassword);
    console.log('Encrypted data:', encrypted);
    
    // Try to decrypt the data
    const decrypted = await decryptWithPassword(testPassword, encrypted);
    console.log('Decrypted data:', decrypted);
    
    // Verify the result
    if (decrypted === testData) {
      console.log('TEST PASSED: Decrypted data matches original data');
    } else {
      console.error('TEST FAILED: Decrypted data does not match original data');
      console.error('Expected:', testData);
      console.error('Actual:', decrypted);
    }
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

testEncryption().catch(error => {
  console.error('Unhandled error in test:', error);
}); 