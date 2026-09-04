const fs = require('fs');
const path = require('path');

describe('governance page and wallet network button wiring', () => {
  test('account tray FAB CSS matches translucent circular treatment', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/styles.css'),
      'utf8'
    );

    expect(css).toMatch(/\.button\.fab-account[\s\S]*opacity:\s*0\.85/);
    expect(css).toMatch(/\.button\.fab-account[\s\S]*border-radius:\s*9999px/);
    expect(css).toMatch(
      /\.button\.fab-account\[data-active\][\s\S]*opacity:\s*1\s*!important/
    );
    expect(css).toMatch(
      /html\[data-theme='light'\]\s*\.button\.fab-account[\s\S]*box-shadow/
    );
    // Network FAB styles are gone now that network selection lives in Settings.
    expect(css).not.toContain('.button.network-mainnet');
    expect(css).not.toContain('.button.network-preprod');
  });

  test('account tray glow is yellow and, when open, exclusive to the selected account', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/styles.css'),
      'utf8'
    );

    // The shared base rule applies to EVERY account option (selected or not).
    // It must carry no box-shadow, so non-selected options never glow while the
    // tray is open — the glow is reserved for the selected account below.
    const base = css.match(
      /\.button\.fab-account,\s*\.button\.fab-account-toggle \{([\s\S]*?)\}/
    );
    expect(base).toBeTruthy();
    expect(base[1]).not.toContain('box-shadow');
    // Ring is a clean yellow (255, 238, 0), not orange/gold.
    expect(base[1]).toMatch(/rgba\(255,\s*238,\s*0/);

    // Selected account glows yellow.
    expect(css).toMatch(
      /\.button\.fab-account\[data-active\][\s\S]*?box-shadow[\s\S]*?rgba\(255,\s*238,\s*0/
    );
    // The toggle anchors the tray and keeps a yellow glow.
    expect(css).toMatch(
      /\.button\.fab-account-toggle \{[\s\S]*?box-shadow[\s\S]*?rgba\(255,\s*238,\s*0/
    );
    // Neither the old orange (255,140,0) nor the too-bright gold (255,214,0)
    // drive the account selector any more.
    expect(base[1]).not.toContain('rgba(255, 140, 0');
    expect(css).not.toContain('rgba(255, 214, 0');

    // Brightness is dialed to match the actions tray: the account glow never
    // exceeds that tray's alpha (0.9), so the old 0.95 hot-spots are gone.
    const toggleRule = css.match(
      /\.button\.fab-account-toggle \{([\s\S]*?)\}/
    );
    expect(toggleRule).toBeTruthy();
    expect(toggleRule[1]).not.toContain('0.95');
  });

  test('wallet account tray buttons use circular labeled avatar FABs with no shadow', () => {
    const traysSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/walletTrays.jsx'),
      'utf8'
    );

    expect(traysSrc).toContain('TrayLabeledButton');
    expect(traysSrc).toContain('accountEntries.map');
    expect(traysSrc).toContain('className="button fab-account"');
    expect(traysSrc).toContain('data-active=');
    expect(traysSrc).toMatch(/shadow:\s*'none'/);
    expect(traysSrc).toContain('wallet-tray-backdrop');
    expect(traysSrc).toContain('blackAlpha.700');
    expect(traysSrc).toMatch(/isAccountTrayOpen \|\| isTrayOpen/);
  });

  test('wallet shows colored testnet banner and hides it on mainnet', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/wallet.jsx'),
      'utf8'
    );
    const css = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/styles.css'),
      'utf8'
    );

    expect(walletSrc).toContain('testnetBanner');
    expect(walletSrc).toContain('NETWORK_ID.mainnet');
    expect(walletSrc).toContain('wallet-network-banner');
    expect(walletSrc).toMatch(/network-banner-\$\{testnetBanner\.id\}/);
    expect(walletSrc).toContain('lucem-wallet-header');
    expect(walletSrc).toContain('safe-area-inset-top');
    expect(walletSrc).not.toContain('lucem-wallet-network-row');
    // In the orb row, after safe-area padding — not a second band and not
    // absolutely pinned into the camera / status-bar line.
    expect(css).toMatch(/\.network-banner[\s\S]*position:\s*relative/);
    expect(css).not.toMatch(/\.network-banner[\s\S]*position:\s*absolute/);
    expect(css).not.toMatch(/\.network-banner[\s\S]*top:\s*0\.75rem/);
    expect(css).toMatch(/\.network-banner[\s\S]*width:\s*auto/);
    // Label centered in the badge (flex + equal vertical pad; letter-spacing offset)
    expect(css).toMatch(/\.network-banner[\s\S]*display:\s*flex/);
    expect(css).toMatch(/\.network-banner[\s\S]*align-items:\s*center/);
    expect(css).toMatch(
      /\.network-banner[\s\S]*padding:\s*0\.34rem\s+calc\(0\.9rem\s*-\s*0\.09em\)\s+0\.34rem\s+calc\(0\.9rem\s*\+\s*0\.09em\)/
    );
    // Rounded badge matching the Send/Receive button shape (not the old U-shape/rectangle)
    expect(css).toMatch(/\.network-banner[\s\S]*border-top:\s*thin\s+solid/);
    expect(css).toMatch(/\.network-banner[\s\S]*border-radius:\s*1rem/);
    // Testnet indicators: blue (preprod) and emerald (preview) — distinct from
    // Send (purple) / Receive (cyan), mainnet lime, and Accounts orange
    expect(css).toMatch(/\.network-banner-mainnet[\s\S]*rgba\(206,\s*250,\s*0/);
    expect(css).toMatch(/\.network-banner-preprod[\s\S]*rgba\(0,\s*122,\s*255/);
    expect(css).toMatch(/\.network-banner-preview[\s\S]*rgba\(0,\s*230,\s*118/);
  });

  test('governance page uses API-backed governance loading and confirm modal signing flow', () => {
    const governanceSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/governance.jsx'),
      'utf8'
    );

    expect(governanceSrc).toContain('fetchGovernanceOverview');
    expect(governanceSrc).toContain('ConfirmModal');
    expect(governanceSrc).toContain('voteDelegationTx');
    expect(governanceSrc).toContain("source === 'blockfrost'");
    expect(governanceSrc).toContain('signAndSubmitHW');
    expect(governanceSrc).toContain('signAndSubmit(');
    expect(governanceSrc).toContain('Delegate Voting Power');
    expect(governanceSrc).toContain('Active Governance Proposals');
    expect(governanceSrc).toContain('Learn governance action types');
    expect(governanceSrc).toContain('Read full proposal text');
    expect(governanceSrc).toContain('Copy ID');
    expect(governanceSrc).toContain('useSurfaceColors');
    expect(governanceSrc).toContain('bg={pageBg}');
    expect(governanceSrc).toContain('bg={panelBg}');
    expect(governanceSrc).toContain('lucem-equal-width-actions');
    expect(governanceSrc).toContain('data-testid="governance-delegate-actions"');
    expect(governanceSrc).toContain('data-testid="governance-vote-actions"');
    expect(governanceSrc).toContain('data-testid="governance-drep-id-input"');
    expect(governanceSrc).toContain('drep1… or 56-character hex key hash');
    expect(governanceSrc).not.toContain('noOfLines={2}');
    const delegateSection = governanceSrc.slice(
      governanceSrc.indexOf('Delegate Voting Power')
    );
    expect(delegateSection.indexOf('Delegate to a specific DRep')).toBeLessThan(
      delegateSection.indexOf('Always Abstain')
    );
  });
});

describe('staking and governance theme surfaces', () => {
  test('shared surface hook uses true light/dark page chrome (not mid-tone gray.100/900)', () => {
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/hooks/useSurfaceColors.js'),
      'utf8'
    );
    expect(hookSrc).toContain("useColorModeValue('#f4f6fb', '#080808')");
    expect(hookSrc).toContain('panelShadow');
    // panelBorder used to be transparent in both modes, which left cards with no
    // edge at all against a near-black page. See dark-surface-contrast.test.js.
    expect(hookSrc).toContain('panelBorder');
    expect(hookSrc).not.toContain("useColorModeValue('transparent', 'transparent')");
    expect(hookSrc).toContain('cyanLink');
    expect(hookSrc).toContain("useColorModeValue('cyan.600', 'cyan.300')");
  });

  test('stake center page uses theme-aware page and panel backgrounds', () => {
    const stakingSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/staking.jsx'),
      'utf8'
    );
    expect(stakingSrc).toContain('useSurfaceColors');
    expect(stakingSrc).toContain('bg={pageBg}');
    expect(stakingSrc).toContain('color={pageFg}');
    expect(stakingSrc).toContain('bg={panelBg}');
    expect(stakingSrc).not.toMatch(/bg="black"/);
    expect(stakingSrc).not.toContain("useColorModeValue('gray.900', 'gray.900')");
  });

  test('voting center uses cyan accents matching the Vote FAB', () => {
    const governanceSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/governance.jsx'),
      'utf8'
    );
    expect(governanceSrc).toContain('cyanLink');
    expect(governanceSrc).toContain('colorScheme="cyan"');
    expect(governanceSrc).toContain('bg="cyan.400"');
    expect(governanceSrc).toContain('rgba(0, 245, 255');
    expect(governanceSrc).not.toContain('accentLink');
  });
});

