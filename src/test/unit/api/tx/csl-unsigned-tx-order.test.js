const fs = require('fs');
const path = require('path');

describe('CSL unsigned transaction builder ordering', () => {
  test('adds outputs before coin selection + change', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../api/tx/csl-unsigned-tx.ts'),
      'utf8'
    );
    const loopStart = src.indexOf(
      'for (let attempt = 0; attempt < FEE_ALIGN_MAX_ATTEMPTS'
    );
    const loopBody = src.slice(
      loopStart,
      src.indexOf('const txBody = txBuilder.build();', loopStart)
    );

    expect(loopBody.indexOf('txBuilder.add_output')).toBeGreaterThan(-1);
    expect(loopBody.indexOf('add_inputs_from_and_change')).toBeGreaterThan(-1);
    expect(loopBody.indexOf('txBuilder.add_output')).toBeLessThan(
      loopBody.indexOf('add_inputs_from_and_change')
    );
    // TTL/aux before change so fee sizing includes them
    expect(loopBody.indexOf('set_ttl_bignum')).toBeLessThan(
      loopBody.indexOf('add_inputs_from_and_change')
    );
  });
});
