const fs = require('fs');
const path = require('path');

describe('CSL unsigned transaction builder ordering', () => {
  test('adds outputs before running coin selection', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../api/tx/csl-unsigned-tx.js'),
      'utf8'
    );
    const loopStart = src.indexOf('for (let attempt = 0; attempt < FEE_ALIGN_MAX_ATTEMPTS');
    const loopBody = src.slice(loopStart, src.indexOf('const txBody = txBuilder.build();', loopStart));

    expect(loopBody.indexOf('txBuilder.add_output')).toBeGreaterThan(-1);
    expect(loopBody.indexOf('txBuilder.add_inputs_from')).toBeGreaterThan(-1);
    expect(loopBody.indexOf('txBuilder.add_output')).toBeLessThan(
      loopBody.indexOf('txBuilder.add_inputs_from')
    );
  });
});
