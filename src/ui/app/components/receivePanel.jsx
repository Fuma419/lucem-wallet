import React from 'react';
import {
  Box,
  Button,
  Flex,
  Link,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { CopyIcon, ExternalLinkIcon } from '@chakra-ui/icons';
import { getNetwork } from '../../../api/extension';
import Copy from './copy';
import QrCode from './qrCode';
import { explorerAddressUrl } from './explorerUrl';
import useSurfaceColors from '../hooks/useSurfaceColors';

/**
 * Receive card: scannable QR, full address, copy, and explorer.
 * Used in the wallet Receive popover.
 */
const ReceivePanel = ({ address, accountName }) => {
  const { mutedFg, pageFg, cyanLink, insetBg } = useSurfaceColors();
  const [explorerUrl, setExplorerUrl] = React.useState(
    explorerAddressUrl('mainnet', address)
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const network = await getNetwork();
      if (cancelled) return;
      setExplorerUrl(explorerAddressUrl(network?.id, address));
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const addressFg = useColorModeValue('gray.800', 'whiteAlpha.900');

  return (
    <Flex
      direction="column"
      align="center"
      textAlign="center"
      gap={4}
      w="full"
      data-testid="receive-panel"
    >
      <Box w="full">
        <Text
          fontSize="xl"
          fontWeight="bold"
          color={pageFg}
          data-testid="receive-title"
        >
          Receive
        </Text>
        {accountName ? (
          <Text fontSize="sm" color={mutedFg} mt={0.5} noOfLines={1}>
            {accountName}
          </Text>
        ) : null}
        <Text fontSize="sm" color={mutedFg} mt={1}>
          Share this address to get ADA and native tokens.
        </Text>
      </Box>

      <QrCode value={address} explorerUrl={explorerUrl} />

      <Box
        className="lucem-inset-surface"
        rounded="2xl"
        px={3}
        py={3}
        w="full"
        bg={insetBg}
        data-testid="receive-address-card"
      >
        <Text
          fontFamily="mono"
          fontSize="xs"
          lineHeight="1.45"
          color={addressFg}
          wordBreak="break-all"
          data-testid="receive-address"
        >
          {address}
        </Text>
        <Copy label="Copied address" copy={address}>
          <Button
            mt={3}
            w="full"
            size="sm"
            rounded="2xl"
            colorScheme="cyan"
            leftIcon={<CopyIcon />}
            data-testid="receive-copy-address"
          >
            Copy address
          </Button>
        </Copy>
      </Box>

      <Link
        href={explorerUrl}
        isExternal
        fontSize="sm"
        fontWeight="semibold"
        color={cyanLink}
        data-testid="receive-explorer-link"
        onClick={(e) => {
          e.preventDefault();
          if (!address) return;
          window.open(explorerUrl, '_blank', 'noopener,noreferrer');
        }}
      >
        View on explorer <ExternalLinkIcon mx="4px" mb="2px" />
      </Link>
    </Flex>
  );
};

export default ReceivePanel;
