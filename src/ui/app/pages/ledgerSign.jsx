/**
 * Ledger signing step, hosted in a `normal` extension window.
 *
 * Chrome cancels the WebUSB / Web Bluetooth chooser inside the toolbar popup
 * and reports "No device selected", so a Ledger send cannot pair from there.
 * The page that built the transaction stores it and opens this route, which
 * pairs, signs, and submits.
 */
import React from 'react';
import {
  Box,
  Button,
  Spinner,
  Text,
  useToast,
} from '@chakra-ui/react';
import { MdBluetooth, MdUsb } from 'react-icons/md';
import { getBluetoothServiceUuids } from '@ledgerhq/devices';
import {
  clearLedgerSignPayload,
  finishFlowWindow,
  getCurrentAccount,
  indexToHw,
  initHW,
  takeLedgerSignPayload,
} from '../../../api/extension';
import {
  isLedgerUsbId,
  pickLedgerBluetoothDevice,
  pickLedgerUsbDevice,
} from '../../../api/extension/ledger-transport';
import { formatLedgerError } from '../../../api/extension/ledger-error';
import { signAndSubmitHW } from '../../../api/extension/wallet';
import Loader from '../../../api/loader';

const Phase = {
  load: 'load',
  connect: 'connect',
  signing: 'signing',
  done: 'done',
};

const signIdFromLocation = () =>
  new URLSearchParams(window.location.search).get('signId');

const LedgerSign = () => {
  const toast = useToast();
  const [phase, setPhase] = React.useState(Phase.load);
  const [error, setError] = React.useState('');
  const [hw, setHw] = React.useState(null);
  const pending = React.useRef(null);
  const account = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Loader.load();
        const signId = signIdFromLocation();
        if (!signId) throw new Error('Missing sign session.');
        const payload = await takeLedgerSignPayload(signId);
        if (!payload) throw new Error('Sign session expired or already used.');
        const current = await getCurrentAccount();
        if (cancelled) return;
        pending.current = payload;
        account.current = current;
        setHw(indexToHw(current.index));
        setPhase(Phase.connect);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Could not load the transaction.');
          setPhase(Phase.done);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const usb = !!hw && isLedgerUsbId(hw.id);

  const signHandler = async () => {
    setError('');
    let appAda;
    try {
      // Pair before the spinner: the chooser has to open from this click.
      let usbDevice;
      let hidDevice;
      let bleDevice;
      if (usb) {
        const picked = await pickLedgerUsbDevice();
        usbDevice = picked.usbDevice;
        hidDevice = picked.hidDevice;
      } else {
        bleDevice = await pickLedgerBluetoothDevice(getBluetoothServiceUuids());
      }
      setPhase(Phase.signing);
      appAda = await initHW({
        device: hw.device,
        id: hw.id,
        usbDevice,
        hidDevice,
        bleDevice,
      });
      // signAndSubmitHW reassembles the body, so it needs the CSL tx.
      const unsignedTx = Loader.Cardano.Transaction.from_bytes(
        Buffer.from(pending.current.txHex, 'hex')
      );
      await signAndSubmitHW(unsignedTx, {
        keyHashes: pending.current.keyHashes,
        account: account.current,
        hw: { ...hw, appAda },
        partialSign: pending.current.partialSign,
      });
      const signId = signIdFromLocation();
      if (signId) await clearLedgerSignPayload(signId);
      toast({
        title: 'Transaction submitted',
        status: 'success',
        duration: 3000,
      });
      setPhase(Phase.done);
      setTimeout(() => finishFlowWindow(), 2000);
    } catch (e) {
      console.warn(e);
      setError(formatLedgerError(e, 'Signing failed.'));
      setPhase(Phase.connect);
    }
  };

  return (
    <Box
      height="100vh"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      textAlign="center"
      px={8}
    >
      {phase === Phase.load && <Spinner color="teal" speed="0.5s" />}

      {phase === Phase.signing && (
        <>
          <Spinner color="teal" speed="0.5s" />
          <Text mt={6} fontWeight="bold">
            Confirm the transaction on your Ledger
          </Text>
          <Text mt={2} fontSize="sm" color="GrayText">
            Nothing is submitted until you approve it on the device.
          </Text>
        </>
      )}

      {phase === Phase.connect && (
        <>
          <Text fontSize="lg" fontWeight="bold">
            Sign with your Ledger
          </Text>
          <Text mt={3} fontSize="sm" color="GrayText">
            {usb
              ? 'Plug in the Ledger, unlock it, and open the Cardano app. Pick it in the list Chrome shows.'
              : 'Unlock the Ledger, open the Cardano app, and pick it in the Bluetooth list Chrome shows.'}
          </Text>
          <Button
            mt={6}
            colorScheme="teal"
            leftIcon={usb ? <MdUsb /> : <MdBluetooth />}
            onClick={signHandler}
          >
            {usb ? 'Connect over USB' : 'Connect over Bluetooth'}
          </Button>
        </>
      )}

      {phase === Phase.done && !error && (
        <>
          <Text fontSize="lg" fontWeight="bold">
            Transaction submitted
          </Text>
          <Text mt={2} fontSize="sm" color="GrayText">
            This window closes and your wallet opens in the toolbar.
          </Text>
        </>
      )}

      {!!error && (
        <>
          <Text mt={6} fontSize="sm" color="red.300">
            {error}
          </Text>
          <Button
            mt={4}
            size="sm"
            variant="ghost"
            onClick={() => finishFlowWindow()}
          >
            Back to wallet
          </Button>
        </>
      )}
    </Box>
  );
};

export default LedgerSign;
