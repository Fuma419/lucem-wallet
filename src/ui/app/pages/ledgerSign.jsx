/**
 * Ledger signing step, hosted in a temporary tab (`ledgerSign.html`).
 *
 * Chrome cancels the WebUSB / Web Bluetooth chooser inside the toolbar popup
 * and reports "No device selected", so a Ledger send cannot pair from there.
 * The page that built the transaction stores it and opens this tab, which
 * pairs, signs, and submits, then closes itself.
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
  finishFlowWindow,
  getCurrentAccount,
  indexToHw,
  initHW,
  setCollateral,
  signTxHW,
  takeLedgerSignPayload,
  writeLedgerSignResult,
} from '../../../api/extension';
import {
  closeLedgerApp,
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
  const outcomeRef = React.useRef(null);
  const [doneTitle, setDoneTitle] = React.useState('Transaction submitted');

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

  React.useEffect(() => {
    const onUnload = () => {
      if (outcomeRef.current) return;
      const signId = signIdFromLocation();
      if (!signId) return;
      writeLedgerSignResult(signId, { status: 'cancelled' });
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  const usb = !!hw && isLedgerUsbId(hw.id);

  const signHandler = async () => {
    setError('');
    let appAda;
    const signId = signIdFromLocation();
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
      const unsignedTx = Loader.Cardano.Transaction.from_bytes(
        Buffer.from(pending.current.txHex, 'hex')
      );
      const hwSession = { ...hw, appAda };
      const mode = pending.current.mode === 'witness' ? 'witness' : 'submit';
      if (mode === 'witness') {
        const witnessSet = await signTxHW(
          pending.current.txHex,
          pending.current.keyHashes,
          account.current,
          hwSession,
          pending.current.partialSign
        );
        await writeLedgerSignResult(signId, {
          status: 'signed',
          witnessHex: Buffer.from(witnessSet.to_bytes()).toString('hex'),
        });
        outcomeRef.current = 'signed';
        setDoneTitle('Transaction signed');
        toast({
          title: 'Transaction signed',
          status: 'success',
          duration: 3000,
        });
      } else {
        const txHash = await signAndSubmitHW(unsignedTx, {
          keyHashes: pending.current.keyHashes,
          account: account.current,
          hw: hwSession,
          partialSign: pending.current.partialSign,
        });
        if (pending.current.purpose === 'collateral' && txHash) {
          await setCollateral({
            txHash,
            txId: 0,
            lovelace: pending.current.collateralLovelace || '5000000',
          });
        }
        await writeLedgerSignResult(signId, {
          status: 'submitted',
          txHash,
        });
        outcomeRef.current = 'submitted';
        setDoneTitle(
          pending.current.purpose === 'collateral'
            ? 'Collateral added'
            : 'Transaction submitted'
        );
        toast({
          title:
            pending.current.purpose === 'collateral'
              ? 'Collateral added'
              : 'Transaction submitted',
          status: 'success',
          duration: 3000,
        });
      }
      setPhase(Phase.done);
      setTimeout(() => finishFlowWindow(), 2000);
    } catch (e) {
      console.warn(e);
      setError(formatLedgerError(e, 'Signing failed.'));
      setPhase(Phase.connect);
    } finally {
      await closeLedgerApp(appAda);
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
          <Button
            mt={4}
            size="sm"
            variant="ghost"
            onClick={async () => {
              const signId = signIdFromLocation();
              outcomeRef.current = 'cancelled';
              if (signId) {
                await writeLedgerSignResult(signId, { status: 'cancelled' });
              }
              finishFlowWindow();
            }}
          >
            Cancel
          </Button>
        </>
      )}

      {phase === Phase.done && !error && (
        <>
          <Text fontSize="lg" fontWeight="bold">
            {doneTitle}
          </Text>
          <Text mt={2} fontSize="sm" color="GrayText">
            This tab closes. Click the Lucem icon if the wallet does not appear.
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
            onClick={async () => {
              const signId = signIdFromLocation();
              outcomeRef.current = 'cancelled';
              if (signId) {
                await writeLedgerSignResult(signId, { status: 'cancelled' });
              }
              finishFlowWindow();
            }}
          >
            Back to wallet
          </Button>
        </>
      )}
    </Box>
  );
};

export default LedgerSign;
