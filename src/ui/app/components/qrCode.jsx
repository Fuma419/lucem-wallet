import React from 'react';
import QRCodeStyling from 'qr-code-styling';
import Ada from '../../../assets/img/ada.png';
import { useTheme, useColorModeValue, Box } from '@chakra-ui/react';
import { getNetwork } from '../../../api/extension';
import { explorerAddressUrl } from './explorerUrl';

export { explorerAddressUrl, NETWORK_EXPLORERS } from './explorerUrl';

const qrCode = new QRCodeStyling({
  width: 280,
  height: 280,
  image: Ada,
  dotsOptions: {
    color: '#111827',
    type: 'dots',
  },
  cornersSquareOptions: { type: 'extra-rounded', color: '#0891b2' },
  backgroundOptions: {
    color: '#ffffff',
  },
  imageOptions: {
    crossOrigin: 'anonymous',
    margin: 10,
  },
});

const QrCode = ({ value, explorerUrl: explorerUrlProp }) => {
  const ref = React.useRef(null);
  const theme = useTheme();
  const [fetchedUrl, setFetchedUrl] = React.useState(
    explorerAddressUrl('mainnet', value)
  );

  React.useEffect(() => {
    if (explorerUrlProp) return undefined;
    let cancelled = false;
    (async () => {
      const network = await getNetwork();
      if (cancelled) return;
      setFetchedUrl(explorerAddressUrl(network?.id, value));
    })();
    return () => {
      cancelled = true;
    };
  }, [value, explorerUrlProp]);

  const explorerUrl = explorerUrlProp || fetchedUrl;
  const cornerColor = useColorModeValue(
    theme.colors.cyan[600],
    theme.colors.purple[400]
  );

  React.useEffect(() => {
    qrCode.append(ref.current);
  }, []);

  React.useEffect(() => {
    qrCode.update({
      data: explorerUrl,
      backgroundOptions: { color: '#ffffff' },
      dotsOptions: { color: '#111827' },
      cornersSquareOptions: { color: cornerColor },
    });
  }, [explorerUrl, cornerColor]);

  const openExplorer = (e) => {
    if (e) e.preventDefault();
    if (!value) return;
    window.open(explorerUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Box
      as="button"
      type="button"
      aria-label="Open address on explorer"
      onClick={openExplorer}
      bg="white"
      rounded="2xl"
      p={3}
      ref={ref}
      width="100%"
      maxWidth="17.5rem"
      data-testid="receive-qr"
      boxShadow="0 8px 28px rgba(15, 23, 42, 0.12)"
      sx={{
        '& canvas': {
          width: '100% !important',
          height: 'auto !important',
          display: 'block',
          borderRadius: '0.75rem',
        },
        '& svg': {
          width: '100% !important',
          height: 'auto !important',
          display: 'block',
        },
      }}
    />
  );
};

export default QrCode;
