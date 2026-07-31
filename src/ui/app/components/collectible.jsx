import {
  Box,
  Avatar,
  Image,
  Skeleton,
  useColorModeValue,
} from '@chakra-ui/react';
import React from 'react';
import './styles.css';
import { getAsset } from '../../../api/extension';
import provider from '../../../config/provider';
import { withIpfsGateway } from '../../../api/util';

const useIsMounted = () => {
  const isMounted = React.useRef(false);
  React.useEffect(() => {
    isMounted.current = true;
    return () => (isMounted.current = false);
  }, []);
  return isMounted;
};

const Collectible = React.forwardRef(({ asset }, ref) => {
  const isMounted = useIsMounted();
  const [token, setToken] = React.useState(null);
  const background = useColorModeValue('gray.300', 'white');
  const [showInfo, setShowInfo] = React.useState(false);

  const fetchMetadata = async () => {
    try {
      const detailedConstructedAsset = await getAsset(asset.unit);
      const detailedAsset = {
        ...detailedConstructedAsset,
        quantity: asset.quantity,
        fingerprint: asset.fingerprint ?? detailedConstructedAsset.fingerprint,
      };
      if (!isMounted.current) return;
      setToken(detailedAsset);
    } catch (error) {
      if (!isMounted.current) return;
      // Always leave a renderable tile — never hang on a skeleton.
      setToken({
        ...asset,
        name: asset.name || asset.displayName || '?',
        displayName: asset.displayName || asset.name || 'Asset',
        image: '',
      });
    }
  };

  React.useEffect(() => {
    fetchMetadata();
  }, [asset]);

  return (
    <>
      <Box
        onClick={() => {
          token && ref.current.openModal(token);
        }}
        position="relative"
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexDirection="column"
        width="100%"
        sx={{ aspectRatio: '1 / 1' }}
        overflow="hidden"
        rounded="3xl"
        background={background}
        border="solid 1px"
        borderColor={background}
        onMouseEnter={() => setShowInfo(true)}
        onMouseLeave={() => setShowInfo(false)}
        cursor="pointer"
        userSelect="none"
      >
        <Box
          filter={showInfo && 'brightness(0.6)'}
          position="absolute"
          top="50%"
          left="50%"
          transform="translate(-50%, -50%)"
          width="180%"
          height="180%"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          {!token ? (
            <Skeleton width="100%" height="100%" />
          ) : (
            <AssetIcon
              name={token.displayName || token.name}
              src={token.image}
            />
          )}
        </Box>
        {token && (
          <Box
            width="full"
            position="absolute"
            left={0}
            right={0}
            style={{
              transition: '0.2s',
              bottom: showInfo ? '0' : '-100%',
            }}
          >
            <Box
              width="full"
              minH="70%"
              py={4}
              background="white"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexDirection="column"
              color="black"
              position="relative"
            >
              <Box
                overflow="hidden"
                className="lineClamp3"
                fontSize={13}
                fontWeight="bold"
                color="GrayText"
                textAlign="center"
                width="80%"
              >
                {token.displayName}
              </Box>
              <Box
                color="gray.900"
                fontWeight="semibold"
                position="absolute"
                left="15px"
                bottom="10px"
              >
                x {token.quantity}
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </>
  );
});

/**
 * Always paints an identicon. When `src` is set, try the URL and rotate through
 * IPFS gateways on load error so the tile is never a blank shimmer forever.
 */
const AssetIcon = ({ name, src }) => {
  const gateways = provider.api.ipfsGateways || [provider.api.ipfs];
  const [gatewayIndex, setGatewayIndex] = React.useState(0);
  const [failed, setFailed] = React.useState(!src);

  React.useEffect(() => {
    setGatewayIndex(0);
    setFailed(!src);
  }, [src]);

  const resolvedSrc =
    src && !failed ? withIpfsGateway(src, gateways[gatewayIndex] || gateways[0]) : null;

  return (
    <Box position="relative" width="100%" height="100%">
      <Avatar
        position="absolute"
        inset={0}
        width="100%"
        height="100%"
        name={name}
        rounded="sm"
      />
      {resolvedSrc && (
        <Image
          position="absolute"
          inset={0}
          width="100%"
          height="100%"
          objectFit="cover"
          rounded="sm"
          src={resolvedSrc}
          onError={() => {
            if (gatewayIndex + 1 < gateways.length) {
              setGatewayIndex((i) => i + 1);
            } else {
              setFailed(true);
            }
          }}
        />
      )}
    </Box>
  );
};

export default Collectible;
