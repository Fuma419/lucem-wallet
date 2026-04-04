import React from 'react';
import {
  Box,
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalContent,
  useColorModeValue,
  useDisclosure,
} from '@chakra-ui/react';
import { LazyLoadComponent } from 'react-lazy-load-image-component';
import Asset from './asset';

const AssetsModal = React.forwardRef((props, ref) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [data, setData] = React.useState({
    title: '',
    assets: [],
    background: '',
    color: 'inherit',
  });
  const background = useColorModeValue('blue.100', 'gray.900');

  const abs = (big) => {
    return big < 0 ? BigInt(big) * BigInt(-1) : big;
  };

  React.useImperativeHandle(ref, () => ({
    openModal(data) {
      setData(data);
      onOpen();
    },
  }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      blockScrollOnMount={false}
    >
      <ModalContent
        m={0}
        rounded="none"
        overflow="hidden"
        background={background}
        display="flex"
        flexDirection="column"
        sx={{
          width: '100vw',
          maxW: '100vw',
          maxHeight: '100dvh',
          height: '100vh',
          '@supports (height: 100dvh)': {
            height: '100dvh',
          },
          '@supports not (height: 100dvh)': {
            maxHeight: '100vh',
          },
        }}
      >
        <ModalBody
          p={0}
          flex="1"
          minH={0}
          display="flex"
          flexDirection="column"
          overflow="hidden"
        >
          <Box
            flex="1"
            minH={0}
            overflowY="auto"
            w="full"
            sx={{ WebkitOverflowScrolling: 'touch' }}
          >
            <Box
              width="full"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexDirection="column"
            >
              <Box h={8} />
              <Box
                fontSize="xl"
                fontWeight="bold"
                maxWidth="240px"
                textAlign="center"
              >
                {data.title}
              </Box>
              <Box h={6} />
              {data.assets.map((asset, index) => {
                asset = {
                  ...asset,
                  quantity: abs(asset.quantity).toString(),
                };
                return (
                  <Box key={index} width="full" px={4} my={2}>
                    <LazyLoadComponent>
                      <Box
                        width="full"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        key={index}
                      >
                        <Asset
                          asset={asset}
                          background={data.background}
                          color={data.color}
                        />
                      </Box>
                    </LazyLoadComponent>
                  </Box>
                );
              })}
              <Box h={6} />
            </Box>
          </Box>
          <Flex
            flexShrink={0}
            w="full"
            py={4}
            pb="calc(1rem + env(safe-area-inset-bottom, 0px))"
            borderTopWidth="1px"
            borderTopColor="whiteAlpha.200"
            background={background}
            align="center"
            justify="center"
          >
            <Button onClick={onClose} width="180px" maxW="calc(100% - 2rem)">
              Back
            </Button>
          </Flex>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
});

export default AssetsModal;
