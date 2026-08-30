const fs = require('fs');
const path = require('path');

describe('README user and CIP-30 integrator contract', () => {
  const root = path.join(__dirname, '../../..');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

  test('documents current product facts for users and dApp authors', () => {
    expect(readme).toMatch(/Node 24/);
    expect(readme).toMatch(/CIP-95/);
    expect(readme).toMatch(/Keystone/);
    expect(readme).toMatch(/hex/);
    expect(readme).toMatch(/Preview/);
    expect(readme).toMatch(/Preprod/);
  });

  test('does not document obsolete Nami-era facts', () => {
    expect(readme).not.toMatch(/Node 18\+/);
    expect(readme).not.toMatch(/ongoing PR 148/i);
    expect(readme).not.toMatch(/CIPs\/pull\/148/);
  });

  test('embeds the four CI product screenshots', () => {
    const shots = [
      '01-welcome',
      '04-hw-connect',
      '12-send-page',
      '16-governance',
    ];
    shots.forEach((name) => {
      expect(readme).toContain(`${name}.png`);
      expect(
        fs.existsSync(path.join(root, 'docs/screenshots', `${name}.png`))
      ).toBe(true);
    });
  });
});
