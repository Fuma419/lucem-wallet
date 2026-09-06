/**
 * Ledger transports for the Lucem web app / PWA (HTTPS).
 *
 * USB uses WebHID (desktop Chrome/Edge) then WebUSB (Android Chrome).
 * Bluetooth stays on WebBLE. Stored USB accounts use id `usb` so reconnect
 * does not go through BLE (`ledger-usb-0` round-trips via indexToHw).
 *
 * Transports are imported on demand so Jest can load wallet code without
 * parsing Ledger's export maps.
 */

export const LEDGER_USB_ID = 'usb';

export const isLedgerUsbId = (id) => {
  if (id == null) return false;
  const s = String(id).toLowerCase();
  return s === 'usb' || s === 'hid' || s === 'webhid' || s === 'webusb';
};

export const hasWebHid = () =>
  typeof navigator !== 'undefined' &&
  navigator.hid &&
  typeof navigator.hid.requestDevice === 'function';

export const hasWebUsb = () =>
  typeof navigator !== 'undefined' &&
  navigator.usb &&
  typeof navigator.usb.requestDevice === 'function';

export const hasLedgerUsbApi = () => hasWebHid() || hasWebUsb();

export const hasWebBluetoothRequestDevice = () =>
  typeof navigator !== 'undefined' &&
  navigator.bluetooth &&
  typeof navigator.bluetooth.requestDevice === 'function';

const isIosBrowserWithoutWebBluetooth = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
    return true;
  }
  return false;
};

const isUserCancelled = (err) => {
  if (!err) return false;
  const name = err.name || '';
  const msg = String(err.message || '');
  return (
    name === 'NotFoundError' ||
    name === 'AbortError' ||
    /cancel|denied|No device selected/i.test(msg)
  );
};

export const ledgerUsbUnavailableMessage = () =>
  'Ledger USB needs Chrome or Edge over HTTPS (the Lucem web app), with the device unlocked and the Cardano app open. Safari and Firefox do not expose WebHID/WebUSB. On iPhone/iPad use Keystone with QR, or a Bluetooth Ledger on desktop.';

export const ledgerBluetoothUnavailableMessage = () => {
  if (isIosBrowserWithoutWebBluetooth()) {
    return 'Ledger Bluetooth is not available on iOS. Use Lucem on a desktop or laptop (Chrome or Edge) with USB or a Bluetooth Ledger, or choose Keystone for QR-based setup on this phone.';
  }
  return 'Web Bluetooth is not supported in this browser or context. Use Chrome or Edge on a computer, or connect Ledger over USB on the Lucem web app.';
};

const bleMissingMessage = () =>
  isIosBrowserWithoutWebBluetooth()
    ? 'Ledger Bluetooth is not supported on iPhone or iPad — iOS browsers do not expose Web Bluetooth. Use Lucem on a desktop or laptop with Chrome or Edge (USB or Bluetooth Ledger), or use Keystone with QR on this device.'
    : 'Web Bluetooth is not available. Use Chrome or Edge over HTTPS (or localhost), enable Bluetooth, and use a Bluetooth-capable Ledger (e.g. Nano X, Flex, Stax). Or connect over USB on the Lucem web app.';

const defaultExport = (mod) => (mod && (mod.default || mod));

const openBleTransport = async (device) => {
  const TransportWebBLE = defaultExport(
    await import('@ledgerhq/hw-transport-web-ble')
  );
  return TransportWebBLE.open(device);
};

const openUsbTransport = async () => {
  if (!hasLedgerUsbApi()) {
    throw new Error(ledgerUsbUnavailableMessage());
  }
  const errors = [];
  if (hasWebHid()) {
    try {
      const TransportWebHID = defaultExport(
        await import('@ledgerhq/hw-transport-webhid')
      );
      return await TransportWebHID.create();
    } catch (/** @type {any} */ err) {
      if (isUserCancelled(err)) throw err;
      errors.push(err);
    }
  }
  if (hasWebUsb()) {
    try {
      const TransportWebUSB = defaultExport(
        await import('@ledgerhq/hw-transport-webusb')
      );
      return await TransportWebUSB.create();
    } catch (/** @type {any} */ err) {
      if (isUserCancelled(err)) throw err;
      errors.push(err);
    }
  }
  const last = /** @type {any} */ (errors[errors.length - 1]);
  throw new Error(
    last && last.message
      ? String(last.message)
      : 'Could not open Ledger over USB. Unlock the device, open the Cardano app, and try again.'
  );
};

/**
 * Open a Ledger transport for import or signing.
 * USB when `id` is the USB sentinel; otherwise WebBLE (`bleDevice` or `id`).
 * @param {{ id?: string, bleDevice?: { gatt?: unknown } }} [opts]
 */
export const openLedgerTransport = async (opts = {}) => {
  const { id, bleDevice } = opts;
  if (bleDevice && bleDevice.gatt) {
    return openBleTransport(bleDevice);
  }
  if (isLedgerUsbId(id)) {
    return openUsbTransport();
  }
  if (id != null && String(id) !== '') {
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      throw new Error(bleMissingMessage());
    }
    return openBleTransport(String(id));
  }
  throw new Error('Missing Ledger device');
};
