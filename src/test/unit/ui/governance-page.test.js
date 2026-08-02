const fs = require('fs');
const path = require('path');

describe('governance page and wallet network button wiring', () => {
  test('network button CSS matches translucent FAB tray treatment', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/styles.css'),
      'utf8'
    );

    expect(css).toMatch(/\.button\.network-mainnet[\s\S]*opacity:\s*0\.85/);
    expect(css).toMatch(
      /\.button\.network-mainnet\s*\{[\s\S]*radial-gradient\([\s\S]*rgba\(206,\s*250,\s*0/
    );
    expect(css).toMatch(
      /\.button\.network-preprod\s*\{[\s\S]*radial-gradient\([\s\S]*rgba\(0,\s*122,\s*255/
    );
    expect(css).toMatch(
      /\.button\.network-preview[\s\S]*radial-gradient\([\s\S]*rgba\(0,\s*230,\s*118/
    );
    expect(css).toMatch(
      /\.button\.network-mainnet\[data-active\][\s\S]*opacity:\s*1\s*!important/
    );
    expect(css).toMatch(
      /html\[data-theme='light'\]\s*\.button\.network-mainnet[\s\S]*color:\s*white/
    );
    expect(css).toMatch(
      /html\[data-theme='light'\]\s*\.button\.network-mainnet\s*\{[\s\S]*radial-gradient/
    );
  });

  test('wallet network tray buttons use circular labeled FABs with no shadow', () => {
    const traysSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/walletTrays.jsx'),
      'utf8'
    );

    expect(traysSrc).toContain('TrayNetworkButton');
    expect(traysSrc).toContain('networkOptions.map((networkOption)');
    expect(traysSrc).toMatch(/className=\{`button network-\$\{networkOption\.id\}/);
    expect(traysSrc).toContain('data-active=');
    expect(traysSrc).toMatch(/shadow="none"/);
    expect(traysSrc).toContain('label={networkOption.label}');
    expect(traysSrc).toContain('wallet-tray-backdrop');
    expect(traysSrc).toContain('blackAlpha.700');
    expect(traysSrc).toMatch(/isNetworkTrayOpen \|\| isTrayOpen/);
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
    expect(css).toMatch(/\.network-banner[\s\S]*position:\s*absolute/);
    expect(css).toMatch(/\.network-banner[\s\S]*width:\s*auto/);
    // Label centered in the badge (flex + equal vertical pad; letter-spacing offset)
    expect(css).toMatch(/\.network-banner[\s\S]*display:\s*flex/);
    expect(css).toMatch(/\.network-banner[\s\S]*align-items:\s*center/);
    expect(css).toMatch(
      /\.network-banner[\s\S]*padding:\s*0\.34rem\s+calc\(0\.9rem\s*-\s*0\.09em\)\s+0\.34rem\s+calc\(0\.9rem\s*\+\s*0\.09em\)/
    );
    // Rounded badge matching the Send/Receive button shape (not the old U-shape/rectangle)
    expect(css).toMatch(/\.network-banner[\s\S]*border-top:\s*thin\s+solid/);
    expect(css).toMatch(/\.network-banner[\s\S]*border-radius:\s*0\.5rem/);
    // Testnet indicators: blue (preprod) and emerald (preview) — distinct from
    // Send (purple) / Receive (cyan), mainnet lime, and Accounts orange
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
    expect(hookSrc).toContain("useColorModeValue('transparent', 'transparent')");
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

