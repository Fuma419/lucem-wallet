/**
 * Guard the Receive popover refresh so it stays a scannable card with
 * copy + explorer, not the old cyan QR blob and tiny address line.
 */
const fs = require('fs');
const path = require('path');
const {
  explorerAddressUrl,
  NETWORK_EXPLORERS,
} = require('../../../ui/app/components/explorerUrl');

const read = (rel) =>
  fs.readFileSync(path.join(__dirname, '../../../', rel), 'utf8');

const walletSrc = read('ui/app/pages/wallet.jsx');
const panelSrc = read('ui/app/components/receivePanel.jsx');
const qrSrc = read('ui/app/components/qrCode.jsx');

describe('Receive UI refresh — structural contracts', () => {
  test('wallet Receive popover uses the inset receive panel', () => {
    expect(walletSrc).toContain("from '../components/receivePanel'");
    expect(walletSrc).toContain('data-testid="receive-popover"');
    expect(walletSrc).toContain('lucem-inset-surface');
    expect(walletSrc).toContain('rounded="3xl"');
    expect(walletSrc).toContain('<ReceivePanel');
    expect(walletSrc).not.toContain("from '../components/qrCode'");
  });

  test('panel has a title, helper copy, copy button, and explorer link', () => {
    expect(panelSrc).toContain('data-testid="receive-title"');
    expect(panelSrc).toContain('Share this address to get ADA and native tokens.');
    expect(panelSrc).toContain('data-testid="receive-copy-address"');
    expect(panelSrc).toContain('Copy address');
    expect(panelSrc).toContain('data-testid="receive-explorer-link"');
    expect(panelSrc).toContain('View on explorer');
    expect(panelSrc).toContain('window.open');
  });

  test('QR uses a light quiet zone instead of a cyan glow canvas', () => {
    expect(qrSrc).toContain("color: '#ffffff'");
    expect(qrSrc).toContain("color: '#111827'");
    expect(qrSrc).toContain('data-testid="receive-qr"');
    expect(qrSrc).not.toContain('modal-glow-cyan');
    expect(qrSrc).not.toContain('background={theme.colors.cyan[600]}');
    expect(qrSrc).toContain("backgroundOptions: { color: '#ffffff' }");
  });

  test('explorerAddressUrl maps Cardano networks to Cexplorer', () => {
    expect(NETWORK_EXPLORERS.preview).toMatch(/preview\.cexplorer/);
    expect(explorerAddressUrl('preview', 'addr_test1abc')).toBe(
      'https://preview.cexplorer.io/address/addr_test1abc'
    );
    expect(explorerAddressUrl('midnight', 'addr1xyz')).toBe(
      'https://cexplorer.io/address/addr1xyz'
    );
  });
});
