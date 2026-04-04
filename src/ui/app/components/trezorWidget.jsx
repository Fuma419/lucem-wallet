import { CloseIcon } from '@chakra-ui/icons';
import { Box, Modal, ModalContent, ModalOverlay, useDisclosure } from '@chakra-ui/react';
import React from 'react';

const getTrezorUrl = () => {
  try {
    return chrome.runtime.getURL('Trezor/popup.html');
  } catch (_) {
    return 'Trezor/popup.html';
  }
};

const TrezorWidget = React.forwardRef((props, ref) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  React.useImperativeHandle(ref, () => ({
    openModal() {
      onOpen();
    },
    closeModal() {
      onClose();
    },
  }));
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnOverlayClick={false}
      isCentered
    >
      <ModalOverlay />
      <ModalContent
        background="transparent"
        shadow="none"
        m={0}
        display="flex"
        alignItems="center"
        justifyContent="center"
        width="full"
        maxW="100vw"
        px={2}
      >
        <Box
          w={{ base: 'min(370px, 100%)', md: '370px' }}
          maxW="370px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          position="relative"
        >
          <CloseIcon
            cursor="pointer"
            onClick={onClose}
            position="absolute"
            top="calc(20px + env(safe-area-inset-top, 0px))"
            right="calc(12px + env(safe-area-inset-right, 0px))"
            color="black"
            zIndex={1}
          />
          <Box rounded="3xl" overflow="hidden" background="white" w="full" maxW="360px">
            <iframe
              src={getTrezorUrl()}
              id="trezorPopupLucem"
              title="Trezor"
              style={{
                width: '100%',
                maxWidth: 360,
                height: 'min(560px, calc(100vh - 3rem))',
                border: 'none',
                display: 'block',
              }}
            />
          </Box>
        </Box>
      </ModalContent>
    </Modal>
  );
});

export default TrezorWidget;
