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
import { getBluetoothServiceUuids } from '@ledgerhq/devices';
import { indexToHw, initHW, isHW } from '../../../api/extension';
import { formatLedgerError } from '../../../api/extension/ledger-error';
import {
  isLedgerUsbId,
  listGrantedLedgerUsbPicks,
  listGrantedBluetoothDevices,
  pickLedgerUsbDevice,
  preferredGrantedLedgerUsbPick,
  preloadLedgerUsbTransports,
} from '../../../api/extension/ledger-transport';
import {
  ERROR,
  HW,
  TREZOR_UNSUPPORTED,
  isSubmitError,
} from '../../../config/config';

/** Device name for prompts; a stored Trezor account still shows its own name. */
const deviceLabel = (device) =>
  ({ [HW.ledger]: 'Ledger', [HW.keystone]: 'Keystone', [HW.trezor]: 'Trezor' })[
    device
  ] || 'device';

const ledgerBleRequestOptions = () => {
  const uuids = getBluetoothServiceUuids();
  return {
    filters: uuids.map((uuid) => ({ services: [uuid] })),
    optionalServices: uuids,
  };
};

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
      onHwKeystone,
      allowEmptyPassword: Boolean(allowEmptyPassword),
    };
    const [hw, setHw] = React.useState('');

    React.useImperativeHandle(ref, () => ({
      openModal(accountIndex) {
        if (isHW(accountIndex)) {
          const parsed = indexToHw(accountIndex);
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
  const [grantedUsbPick, setGrantedUsbPick] = React.useState(null);
  const [grantedBleDevice, setGrantedBleDevice] = React.useState(null);
  const [forceUsbPicker, setForceUsbPicker] = React.useState(false);
  const [forceBlePicker, setForceBlePicker] = React.useState(false);

  React.useEffect(() => {
    setError('');
    setForceUsbPicker(false);
    setForceBlePicker(false);
    setGrantedUsbPick(null);
    setGrantedBleDevice(null);
    if (!isOpen || !hw || hw.device !== HW.ledger) return undefined;
    let cancelled = false;
    if (isLedgerUsbId(hw.id)) {
      preloadLedgerUsbTransports().catch(() => {});
      listGrantedLedgerUsbPicks()
        .then((granted) => {
          if (!cancelled) {
            setGrantedUsbPick(preferredGrantedLedgerUsbPick(granted));
          }
        })
        .catch(() => {});
    } else {
      listGrantedBluetoothDevices()
        .then((devices) => {
          if (cancelled) return;
          const match =
            devices.find((d) => d && String(d.id) === String(hw.id)) || null;
          setGrantedBleDevice(match);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [isOpen, hw]);

  const confirmHandler = async () => {
    if (props.ready === false || !waitReady) return;
    try {
      if (
        hw.device === HW.keystone &&
        typeof props.onHwKeystone === 'function'
      ) {
        setWaitReady(false);
        await Promise.resolve(props.onHwKeystone(hw));
        onClose();
        return;
      }
      if (hw.device === HW.trezor) {
        throw new Error(TREZOR_UNSUPPORTED);
      }
      if (hw.device === HW.ledger) {
        let usbDevice;
        let hidDevice;
        let bleDevice;
        if (isLedgerUsbId(hw.id)) {
          if (forceUsbPicker || !grantedUsbPick) {
            const picked = await pickLedgerUsbDevice();
            usbDevice = picked.usbDevice;
            hidDevice = picked.hidDevice;
          } else {
            usbDevice = grantedUsbPick.usbDevice;
            hidDevice = grantedUsbPick.hidDevice;
          }
        } else if (forceBlePicker || !grantedBleDevice) {
          if (
            typeof navigator === 'undefined' ||
            !navigator.bluetooth ||
            typeof navigator.bluetooth.requestDevice !== 'function'
          ) {
            throw new Error(
              'Web Bluetooth is not available. Use Chrome or Edge, or send with a USB Ledger.'
            );
          }
          bleDevice = await navigator.bluetooth.requestDevice(
            ledgerBleRequestOptions()
          );
        } else {
          bleDevice = grantedBleDevice;
        }
        setWaitReady(false);
        const appAda = await initHW({
          device: hw.device,
          id: hw.id,
          usbDevice,
          hidDevice,
          bleDevice,
        });
        const signedMessage = await props.sign(null, { ...hw, appAda });
        await props.onConfirm(true, signedMessage);
      } else {
        setWaitReady(false);
        await props.sign(null, hw);
        onClose();
        return;
      }
    } catch (e) {
      if (isSubmitError(e)) props.onConfirm(false, e);
      else {
        console.warn(e);
        if (hw.device === HW.ledger && isLedgerUsbId(hw.id)) {
          setForceUsbPicker(true);
        } else if (hw.device === HW.ledger) {
          setForceBlePicker(true);
        }
        setError(formatLedgerError(e, 'An error occurred'));
      }
    }
    setWaitReady(true);
  };

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
                py={3}
                px={3}
                width="full"
                color="white"
              >
                <Icon
                  as={hw.device === HW.keystone ? MdQrCode2 : MdUsb}
                  boxSize={5}
                  mr={2}
                  flexShrink={0}
                />
                <Box fontSize="sm" textAlign="left" px={1}>
                  {hw.device === HW.keystone ? (
                    !waitReady ? (
                      <>Opening Keystone signing (QR)…</>
                    ) : (
                      <>
                        Keystone uses <b>QR only</b>. Tap Confirm to open the
                        signing tab.
                      </>
                    )
                  ) : !waitReady ? (
                    `Waiting for ${deviceLabel(hw.device)}${
                      hw.device === HW.ledger && isLedgerUsbId(hw.id)
                        ? ' (USB)'
                        : hw.device === HW.ledger
                          ? ' (Bluetooth)'
                          : ''
                    }`
                  ) : (
                    `Connect ${deviceLabel(hw.device)}${
                      hw.device === HW.ledger && isLedgerUsbId(hw.id)
                        ? ' over USB'
                        : hw.device === HW.ledger
                          ? ' over Bluetooth'
                          : ''
                    }`
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
