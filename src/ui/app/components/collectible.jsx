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
        width="160px"
        height="160px"
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
          width="180%"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          {!token ? (
            <Skeleton width="210px" height="210px" />
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
            bottom={0}
            left={0}
            style={{
              transition: '0.2s',
              bottom: showInfo ? '130px' : '0',
            }}
          >
            <Box
              position="absolute"
              width="full"
              height="130px"
              background="white"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexDirection="column"
              color="black"
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
    <Box position="relative" width="210px" height="210px">
      <Avatar
        position="absolute"
        inset={0}
        width="210px"
        height="210px"
        name={name}
        rounded="sm"
      />
      {resolvedSrc && (
        <Image
          position="absolute"
          inset={0}
          width="210px"
          height="210px"
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
