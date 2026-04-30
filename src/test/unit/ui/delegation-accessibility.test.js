const fs = require('fs');
const path = require('path');

describe('delegation modal accessibility and typography normalization', () => {
  test('confirm modal uses keyboard-safe mobile scrolling behavior', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/confirmModal.jsx'),
      'utf8'
    );

    expect(src).toContain('scrollBehavior="inside"');
    expect(src).toContain('isCentered={!isMobile}');
    expect(src).toContain('maxHeight');
    expect(src).toContain('100dvh');
  });

  test('delegation flow applies +2pt typography and passes it to pool search', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/transactionBuilder.jsx'),
      'utf8'
    );

    expect(src).toContain('const addTwoPoint');
    expect(src).toContain('delegationTextSize');
    expect(src).toContain('inputFontSize={delegationTextSize.sm}');
    expect(src).toContain('fontSize={delegationTextSize.sm}');
  });

  test('pool search accepts delegated font-size props', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/poolSearch.jsx'),
      'utf8'
    );

    expect(src).toContain('inputFontSize = \'sm\'');
    expect(src).toContain('bodyFontSize = \'sm\'');
    expect(src).toContain('metaFontSize = \'xs\'');
  });

  test('global styles enable system/browser text-size scaling', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/styles.css'),
      'utf8'
    );

    expect(src).toContain('--lucem-font-scale: 1');
    expect(src).toContain('-webkit-text-size-adjust: 100%');
    expect(src).toContain('text-size-adjust: 100%');
  });

  test('chakra theme font sizes are normalized via css scale variable', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../ui/theme.jsx'),
      'utf8'
    );

    expect(src).toContain('const scaledFont');
    expect(src).toContain('fontSizes:');
    expect(src).toContain('var(--lucem-font-scale, 1)');
  });
});
