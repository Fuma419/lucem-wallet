import {
  Icon,
  Box,
  Text,
  Button,
  useDisclosure,
  Input,
  InputGroup,
  InputRightElement,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  useBreakpointValue,
} from '@chakra-ui/react';
import React from 'react';
import { MdQrCode2, MdUsb } from 'react-icons/md';
import { indexToHw, initHW, isHW } from '../../../api/extension';
import { ERROR, HW } from '../../../config/config';

const ConfirmModal = React.forwardRef(
  (
    {
      ready,
      onConfirm,
      sign,
      onCloseBtn,
      title,
      info,
      onHwKeystone,
      allowEmptyPassword,
    },
    ref
  ) => {
    const {
      isOpen: isOpenNormal,
      onOpen: onOpenNormal,
      onClose: onCloseNormal,
    } = useDisclosure();
    const {
      isOpen: isOpenHW,
      onOpen: onOpenHW,
      onClose: onCloseHW,
    } = useDisclosure();
    const props = {
      ready,
      onConfirm,
      sign,
      onCloseBtn,
      title,
      info,
      allowEmptyPassword: Boolean(allowEmptyPassword),
    };
    const [hw, setHw] = React.useState('');

    React.useImperativeHandle(ref, () => ({
      openModal(accountIndex) {
        if (isHW(accountIndex)) {
          const parsed = indexToHw(accountIndex);
          if (
            parsed.device === HW.keystone &&
            typeof onHwKeystone === 'function'
          ) {
            setHw(parsed);
            void Promise.resolve(onHwKeystone(parsed));
            return;
          }
          setHw(parsed);
          onOpenHW();
        } else {
          onOpenNormal();
        }
      },
      closeModal() {
        onCloseNormal();
        onCloseHW();
      },
    }));

    return (
      <>
        <ConfirmModalHw
          props={props}
          isOpen={isOpenHW}
          onClose={onCloseHW}
          hw={hw}
        />
        <ConfirmModalNormal
          props={props}
          isOpen={isOpenNormal}
          onClose={onCloseNormal}
        />
      </>
    );
  }
);

const ConfirmModalNormal = ({ props, isOpen, onClose }) => {
  const [state, setState] = React.useState({
    password: '',
    show: false,
    name: '',
  });
  const [waitReady, setWaitReady] = React.useState(true);
  const inputRef = React.useRef();
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? false;

  React.useEffect(() => {
    setState({
      password: '',
      show: false,
      name: '',
    });
  }, [isOpen]);

  const confirmHandler = async () => {
    if (
      (!props.allowEmptyPassword && !state.password) ||
      props.ready === false ||
      !waitReady
    )
      return;
    try {
      setWaitReady(false);
      const signedMessage = await props.sign(state.password);
      await props.onConfirm(true, signedMessage);
    } catch (e) {
      if (e === ERROR.wrongPassword)
        setState((s) => ({ ...s, wrongPassword: true }));
      else await props.onConfirm(false, e);
    }
    setWaitReady(true);
  };

  return (
    <Modal
      size="xs"
      isOpen={isOpen}
      onClose={onClose}
      isCentered={!isMobile}
      initialFocusRef={inputRef}
      blockScrollOnMount={false}
      scrollBehavior="inside"
    >
      <ModalOverlay />
      <ModalContent
        mx={{ base: 2, md: 0 }}
        my={{ base: 'max(0.5rem, env(safe-area-inset-top, 0px))', md: 0 }}
        sx={{
          '@supports (height: 100dvh)': {
            maxHeight:
              'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1rem)',
          },
          '@supports not (height: 100dvh)': {
            maxHeight:
              'calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1rem)',
          },
        }}
      >
        <ModalHeader fontSize="md">
          {props.title ? props.title : 'Confirm with password'}
        </ModalHeader>
        <ModalBody overflowY="auto">
          {props.info}
          <InputGroup size="md">
            <Input
              ref={inputRef}
              focusBorderColor="yellow.600"
              variant="filled"
              isInvalid={state.wrongPassword === true}
              pr="4.5rem"
              type={state.show ? 'text' : 'password'}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="current-password"
              onChange={(e) =>
                setState((s) => ({ ...s, password: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key == 'Enter') confirmHandler();
              }}
              placeholder="Enter password"
            />
            <InputRightElement width="4.5rem">
              <Button
                h="1.75rem"
                size="sm"
                onClick={() => setState((s) => ({ ...s, show: !s.show }))}
              >
                {state.show ? 'Hide' : 'Show'}
              </Button>
            </InputRightElement>
          </InputGroup>
          {state.wrongPassword === true && (
            <Text color="red.300">Password is wrong</Text>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            mr={3}
            variant="ghost"
            onClick={() => {
              if (props.onCloseBtn) {
                props.onCloseBtn();
              }
              onClose();
            }}
          >
            Close
          </Button>
          <Button
            isDisabled={
              (!props.allowEmptyPassword && !state.password) ||
              props.ready === false ||
              !waitReady
            }
            isLoading={!waitReady}
            colorScheme="yellow"
            onClick={confirmHandler}
          >
            Confirm
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const ConfirmModalHw = ({ props, isOpen, onClose, hw }) => {
  const [waitReady, setWaitReady] = React.useState(true);
  const [error, setError] = React.useState('');
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? false;

  const confirmHandler = async () => {
    if (props.ready === false || !waitReady) return;
    try {
      setWaitReady(false);
      if (hw.device === HW.ledger) {
        const appAda = await initHW({ device: hw.device, id: hw.id });
        const signedMessage = await props.sign(null, { ...hw, appAda });
        await props.onConfirm(true, signedMessage);
      } else {
        await props.sign(null, hw);
        onClose();
        return;
      }
    } catch (e) {
      if (e === ERROR.submit) props.onConfirm(false, e);
      else {
        console.warn(e);
        setError('An error occured');
      }
    }
    setWaitReady(true);
  };

  React.useEffect(() => {
    setError('');
  }, [isOpen]);

  return (
    <>
      <Modal
        size="xs"
        isOpen={isOpen}
        onClose={onClose}
        isCentered={!isMobile}
        blockScrollOnMount={false}
        scrollBehavior="inside"
      >
        <ModalOverlay />
        <ModalContent
          mx={{ base: 2, md: 0 }}
          my={{ base: 'max(0.5rem, env(safe-area-inset-top, 0px))', md: 0 }}
          sx={{
            '@supports (height: 100dvh)': {
              maxHeight:
                'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1rem)',
            },
            '@supports not (height: 100dvh)': {
              maxHeight:
                'calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1rem)',
            },
          }}
        >
          <ModalHeader fontSize="md">
            {props.title ? props.title : `Confirm with device`}
          </ModalHeader>
          <ModalBody overflowY="auto">
            {props.info}
            <Box
              width="full"
              display="flex"
              justifyContent="center"
              alignItems="center"
              flexDirection="column"
            >
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                background={
                  hw.device === HW.ledger
                    ? 'blue.400'
                    : hw.device === HW.keystone
                      ? 'teal.500'
                      : 'gray'
                }
                rounded="xl"
                py={2}
                width="70%"
                color="white"
              >
                <Icon
                  as={hw.device === HW.keystone ? MdQrCode2 : MdUsb}
                  boxSize={5}
                  mr={2}
                />
                <Box fontSize="sm" textAlign="center" px={1}>
                  {hw.device === HW.keystone ? (
                    !waitReady ? (
                      <>Opening Keystone signing (QR)…</>
                    ) : (
                      <>
                        Keystone uses <b>QR only</b> (no USB). Tap Confirm to open
                        the signing tab.
                      </>
                    )
                  ) : !waitReady ? (
                    `Waiting for ${
                      hw.device === HW.ledger ? 'Ledger' : 'Trezor'
                    }`
                  ) : (
                    `Connect ${hw.device === HW.ledger ? 'Ledger' : 'Trezor'}`
                  )}
                </Box>
              </Box>
              {error && (
                <Text mt={2} color="red.300">
                  {error}
                </Text>
              )}
            </Box>
          </ModalBody>

          <ModalFooter>
            <Button
              mr={3}
              variant="ghost"
              onClick={() => {
                if (props.onCloseBtn) {
                  props.onCloseBtn();
                }
                onClose();
              }}
            >
              Close
            </Button>
            <Button
              isDisabled={props.ready === false || !waitReady}
              isLoading={!waitReady}
              colorScheme="blue"
              onClick={confirmHandler}
            >
              Confirm
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default ConfirmModal;
