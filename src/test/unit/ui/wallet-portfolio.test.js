const fs = require('fs');
const path = require('path');

describe('wallet portfolio chain strip', () => {
  const walletSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/pages/wallet.jsx'),
    'utf8'
  );
  const listSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/components/portfolioChainList.jsx'),
    'utf8'
  );
  const css = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/components/styles.css'),
    'utf8'
  );

  test('home mounts the portfolio strip from assemblePortfolio', () => {
    expect(walletSrc).toContain("from '../../../portfolio/balance'");
    expect(walletSrc).toContain('assemblePortfolio');
    expect(walletSrc).toContain('cardanoAdaPosition');
    expect(walletSrc).toContain('PortfolioChainList');
    expect(walletSrc).toContain('quantity={displayTotalAda}');
    expect(walletSrc).toContain('portfolio.fiatCents');
  });

  test('Bitcoin and Solana are disconnected placeholders, not Cardano imports', () => {
    expect(listSrc).toContain('data-testid="wallet-portfolio"');
    expect(listSrc).toContain('Not imported');
    expect(listSrc).not.toContain('koios');
    expect(listSrc).not.toContain('cardano-serialization-lib');
    expect(css).toContain('.lucem-portfolio-chain[data-status=\'disconnected\']');
  });
});
