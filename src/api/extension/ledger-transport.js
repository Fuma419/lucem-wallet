/**
 * Ledger transports for the Lucem web app / PWA (HTTPS).
 *
 * USB uses WebUSB on Android Chrome and WebHID (then WebUSB) on desktop.
 * Never call Transport.create() — it listen()s with no timeout and hangs
 * when the Nano is already plugged in and not yet permitted.
 * Bluetooth stays on WebBLE. Stored USB accounts use id `usb`.
 *
 * Transports are imported on demand so Jest can load wallet code without
 * parsing Ledger's export maps.
 */

export const LEDGER_USB_ID = 'usb';

/** Ledger VID (`@ledgerhq/devices` ledgerUSBVendorId). Nano S also used ST 0x2581. */
export const LEDGER_USB_VENDOR_ID = 0x2c97;
const LEDGER_USB_LEGACY_VENDOR_ID = 0x2581;

export const LEDGER_USB_DEVICE_FILTERS = [
  { vendorId: LEDGER_USB_VENDOR_ID },
  { vendorId: LEDGER_USB_LEGACY_VENDOR_ID },
];

export const LEDGER_USB_NEED_PICKER_MESSAGE =
  'Tap Confirm and pick your Ledger in the Chrome list. Unlock it, close Ledger Live, and leave the Cardano app open.';

export const LEDGER_BLE_NEED_PICKER_MESSAGE =
  'Tap Confirm and pick your Ledger in the Bluetooth list. Unlock it, enable Bluetooth, and leave the Cardano app open.';

export const isLedgerUsbId = (id) => {
  if (id == null) return false;
  const s = String(id).toLowerCase();
  return s === 'usb' || s === 'hid' || s === 'webhid' || s === 'webusb';
};

export const hasWebHid = () =>
  Boolean(
    typeof navigator !== 'undefined' &&
      navigator.hid &&
      typeof navigator.hid.requestDevice === 'function'
  );

export const hasWebUsb = () =>
  Boolean(
    typeof navigator !== 'undefined' &&
      navigator.usb &&
      typeof navigator.usb.requestDevice === 'function'
  );

export const hasLedgerUsbApi = () => hasWebHid() || hasWebUsb();

export const isAndroidLike = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
};

const isNativeShell = () =>
  Boolean(
    typeof window !== 'undefined' &&
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
  );

export const hasWebBluetoothRequestDevice = () =>
  Boolean(
    typeof navigator !== 'undefined' &&
      navigator.bluetooth &&
      typeof navigator.bluetooth.requestDevice === 'function'
  );

export const isIosLikeDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
    return true;
  }
  return false;
};

const isIosBrowserWithoutWebBluetooth = () => isIosLikeDevice();

/** Safari, iOS WebKit (incl. Chrome on iPhone), and the home-screen PWA. */
export const isSafariOrIosWebKit = () => {
  if (typeof navigator === 'undefined') return false;
  if (isIosLikeDevice()) return true;
  const ua = navigator.userAgent || '';
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return true;
  const vendor = typeof navigator.vendor === 'string' ? navigator.vendor : '';
  if (vendor === 'Apple Computer, Inc.') {
    return !/Chrome|Chromium|Edg|OPR|Firefox|Android/i.test(ua);
  }
  return (
    /Safari/i.test(ua) &&
    !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|Android/i.test(ua)
  );
};

export const canConnectLedgerInThisBrowser = () =>
  Boolean(hasLedgerUsbApi() || hasWebBluetoothRequestDevice());

/** Phones/tablets (and the native app). Desktop Chrome/Edge still offer Ledger. */
export const isMobilePlatform = () =>
  Boolean(isIosLikeDevice() || isAndroidLike() || isNativeShell());

export const shouldOfferLedgerImport = () => !isMobilePlatform();

export const isLedgerChooserCancelled = (err) => {
  if (!err) return false;
  const name = err.name || '';
  const msg = String(err.message || '');
  return (
    name === 'NotFoundError' ||
    name === 'AbortError' ||
    /cancel|denied|No device selected/i.test(msg)
  );
};

const isUserCancelled = isLedgerChooserCancelled;

export const isLedgerUsbVendorId = (vendorId) =>
  vendorId === LEDGER_USB_VENDOR_ID || vendorId === LEDGER_USB_LEGACY_VENDOR_ID;

export const listGrantedLedgerUsbPicks = async () => {
  const hidDevices = [];
  const usbDevices = [];
  try {
    if (
      hasWebHid() &&
      navigator.hid &&
      typeof navigator.hid.getDevices === 'function'
    ) {
      const list = await navigator.hid.getDevices();
      (Array.isArray(list) ? list : []).forEach((device) => {
        if (device && isLedgerUsbVendorId(device.vendorId)) {
          hidDevices.push(device);
        }
      });
    }
  } catch (/** @type {any} */ _) {
    // permission API can throw in tests / locked-down iframes
  }
  try {
    if (
      hasWebUsb() &&
      navigator.usb &&
      typeof navigator.usb.getDevices === 'function'
    ) {
      const list = await navigator.usb.getDevices();
      (Array.isArray(list) ? list : []).forEach((device) => {
        if (device && isLedgerUsbVendorId(device.vendorId)) {
          usbDevices.push(device);
        }
      });
    }
  } catch (/** @type {any} */ _) {
    // same as HID
  }
  return { hidDevices, usbDevices };
};

export const preferredGrantedLedgerUsbPick = (granted, opts = {}) => {
  const useUsbFirst =
    opts.android != null ? Boolean(opts.android) : isAndroidLike();
  const hidDevices = (granted && granted.hidDevices) || [];
  const usbDevices = (granted && granted.usbDevices) || [];
  if (useUsbFirst) {
    if (usbDevices[0]) return { usbDevice: usbDevices[0] };
    if (hidDevices[0]) return { hidDevice: hidDevices[0] };
  } else {
    if (hidDevices[0]) return { hidDevice: hidDevices[0] };
    if (usbDevices[0]) return { usbDevice: usbDevices[0] };
  }
  return null;
};

export const listGrantedBluetoothDevices = async () => {
  if (
    typeof navigator === 'undefined' ||
    !navigator.bluetooth ||
    typeof navigator.bluetooth.getDevices !== 'function'
  ) {
    return [];
  }
  try {
    const list = await navigator.bluetooth.getDevices();
    return Array.isArray(list) ? list : [];
  } catch (/** @type {any} */ _) {
    return [];
  }
};

export const findGrantedBluetoothDevice = async (id) => {
  const devices = await listGrantedBluetoothDevices();
  if (id != null && String(id) !== '') {
    const want = String(id);
    const match =
      devices.find((device) => device && String(device.id) === want) || null;
    if (match) return match;
  }
  if (devices.length === 1) return devices[0];
  return null;
};

/**
 * Bluetooth picker for send/sign. `acceptAllDevices` is required because a
 * bonded Flex often stops advertising the Ledger GATT service, so service
 * filters make Chrome show an empty chooser and throw
 * "User cancelled the requestDevice() chooser."
 * `uuids` must be the Ledger BLE service list (`getBluetoothServiceUuids()`).
 * @param {string[]} [uuids]
 */
export const pickLedgerBluetoothDevice = async (uuids = []) => {
  if (
    typeof navigator === 'undefined' ||
    !navigator.bluetooth ||
    typeof navigator.bluetooth.requestDevice !== 'function'
  ) {
    throw new Error(LEDGER_BLE_NEED_PICKER_MESSAGE);
  }
  const services = Array.isArray(uuids) ? uuids.filter(Boolean) : [];
  return navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: services,
  });
};

export const ledgerCannotConnectMessage = () => {
  if (isNativeShell()) {
    return 'Ledger USB does not work inside the Lucem app. Open the Lucem website in Chrome on this phone, plug in the device with a USB-OTG adapter, unlock it, open the Cardano app, then tap Continue so Chrome can show the USB list.';
  }
  if (isIosLikeDevice() || isSafariOrIosWebKit()) {
    return 'Safari cannot talk to Ledger — including Lucem added to the home screen. Apple does not give websites USB or Bluetooth. On iPhone/iPad choose Keystone and scan the QR. On a Mac or Android phone, open Lucem in Chrome or Edge (not Safari).';
  }
  return 'This browser cannot connect Ledger. Use Chrome or Edge over HTTPS (the Lucem web app). Safari, Firefox, and in-app browsers do not expose USB. On iPhone/iPad use Keystone with QR.';
};

export const ledgerUsbUnavailableMessage = () => ledgerCannotConnectMessage();

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

/** @type {any} */
let cachedHid = null;
/** @type {any} */
let cachedUsb = null;

export const preloadLedgerUsbTransports = async () => {
  const jobs = [];
  if (hasWebUsb()) {
    jobs.push(
      import('@ledgerhq/hw-transport-webusb').then((m) => {
        cachedUsb = defaultExport(m);
      })
    );
  }
  if (hasWebHid() && !isAndroidLike()) {
    jobs.push(
      import('@ledgerhq/hw-transport-webhid').then((m) => {
        cachedHid = defaultExport(m);
      })
    );
  }
  await Promise.all(jobs);
};

/** @type {any} */
let cachedBle = null;

export const preloadLedgerBleTransport = async () => {
  if (!cachedBle) {
    cachedBle = defaultExport(await import('@ledgerhq/hw-transport-web-ble'));
  }
  return cachedBle;
};

export const countGrantedLedgerUsbDevices = async () => {
  if (!hasWebUsb() || typeof navigator.usb.getDevices !== 'function') {
    return 0;
  }
  try {
    const devices = await navigator.usb.getDevices();
    return Array.isArray(devices) ? devices.length : 0;
  } catch (/** @type {any} */ _) {
    return 0;
  }
};

const loadHid = async () => {
  if (!cachedHid) {
    cachedHid = defaultExport(await import('@ledgerhq/hw-transport-webhid'));
  }
  return cachedHid;
};

const loadUsb = async () => {
  if (!cachedUsb) {
    cachedUsb = defaultExport(await import('@ledgerhq/hw-transport-webusb'));
  }
  return cachedUsb;
};

const ensureDeviceClosed = async (device) => {
  if (device && device.opened && typeof device.close === 'function') {
    try {
      await device.close();
    } catch (/** @type {any} */ _) {
      // already closed
    }
  }
};

/**
 * Show the Chrome USB/HID chooser. Must be the first `await` in the tap
 * handler — any import() before requestDevice() drops the user-gesture on
 * Android Chrome and the picker never appears.
 * @returns {Promise<{ usbDevice?: *, hidDevice?: * }>}
 */
export const pickLedgerUsbDevice = async () => {
  if (!hasLedgerUsbApi()) {
    throw new Error(ledgerUsbUnavailableMessage());
  }
  const android = isAndroidLike();
  const useUsb = hasWebUsb() && (android || !hasWebHid());
  if (useUsb) {
    const usbDevice = await navigator.usb.requestDevice({
      filters: LEDGER_USB_DEVICE_FILTERS,
    });
    return { usbDevice };
  }
  if (hasWebHid()) {
    const hidDevices = await navigator.hid.requestDevice({
      filters: LEDGER_USB_DEVICE_FILTERS,
    });
    const hidDevice = Array.isArray(hidDevices) ? hidDevices[0] : hidDevices;
    if (!hidDevice) {
      throw new DOMException('No device selected.', 'NotFoundError');
    }
    return { hidDevice };
  }
  const usbDevice = await navigator.usb.requestDevice({
    filters: LEDGER_USB_DEVICE_FILTERS,
  });
  return { usbDevice };
};

/**
 * Open a device the user already picked (gesture-safe path).
 * @param {{ usbDevice?: any, hidDevice?: any }} picked
 */
export const openPickedLedgerDevice = async (picked = {}) => {
  if (picked.usbDevice) {
    await ensureDeviceClosed(picked.usbDevice);
    const Transport = await loadUsb();
    return Transport.open(picked.usbDevice);
  }
  if (picked.hidDevice) {
    await ensureDeviceClosed(picked.hidDevice);
    const Transport = await loadHid();
    return Transport.open(picked.hidDevice);
  }
  throw new Error('Missing Ledger device');
};

export const closeLedgerApp = async (appAda) => {
  if (!appAda || !appAda.transport || typeof appAda.transport.close !== 'function') {
    return;
  }
  try {
    await appAda.transport.close();
  } catch (/** @type {any} */ _) {
    // already closed
  }
};

/**
 * Open a transport. `prompt: true` always shows the browser USB/HID picker
 * (needed on first connect). Never use Transport.create() — it hangs.
 * Reconnect (`prompt: false`) must not call request() — that needs a user
 * gesture and otherwise Chrome reports "User cancelled the requestDevice() chooser."
 * @param {any} Transport
 * @param {boolean} prompt
 */
const openPickedTransport = async (Transport, prompt) => {
  if (!prompt) {
    const connected = await Transport.openConnected();
    if (connected) return connected;
    throw new Error(LEDGER_USB_NEED_PICKER_MESSAGE);
  }
  return Transport.request();
};

const openBleTransport = async (device) => {
  const TransportWebBLE = cachedBle
    ? cachedBle
    : defaultExport(await import('@ledgerhq/hw-transport-web-ble'));
  cachedBle = TransportWebBLE;
  return TransportWebBLE.open(device);
};

const openGrantedUsbTransport = async () => {
  const granted = await listGrantedLedgerUsbPicks();
  const picked = preferredGrantedLedgerUsbPick(granted);
  if (!picked) {
    throw new Error(LEDGER_USB_NEED_PICKER_MESSAGE);
  }
  return openPickedLedgerDevice(picked);
};

/**
 * @param {{ prompt?: boolean }} [opts]
 */
const openUsbTransport = async (opts = {}) => {
  const prompt = Boolean(opts.prompt);
  if (!hasLedgerUsbApi()) {
    throw new Error(ledgerUsbUnavailableMessage());
  }
  if (!prompt) {
    return openGrantedUsbTransport();
  }
  const errors = [];
  const android = isAndroidLike();
  const tryHid = hasWebHid() && !android;
  const tryUsb = hasWebUsb();

  const attempts = android
    ? [
        tryUsb ? loadUsb : null,
        tryHid ? loadHid : null,
      ]
    : [
        tryHid ? loadHid : null,
        tryUsb ? loadUsb : null,
      ];

  for (const load of attempts) {
    if (!load) continue;
    try {
      const Transport = await load();
      return await openPickedTransport(Transport, true);
    } catch (/** @type {any} */ err) {
      if (isUserCancelled(err)) throw err;
      errors.push(err);
    }
  }
  const last = /** @type {any} */ (errors[errors.length - 1]);
  throw new Error(
    last && last.message
      ? String(last.message)
      : 'Could not open Ledger over USB. Unlock the device, open the Cardano app, tap Continue, and pick it in the browser list.'
  );
};

/**
 * Open a Ledger transport for import or signing.
 * USB when `id` is the USB sentinel; otherwise WebBLE (`bleDevice` or `id`).
 * Never pass a BLE id string into TransportWebBLE.open — that calls
 * bluetooth.requestDevice() (see Ledger's open() TODO) and needs a gesture.
 * @param {{ id?: string, bleDevice?: { gatt?: unknown }, promptUsb?: boolean, usbDevice?: any, hidDevice?: any }} [opts]
 */
export const openLedgerTransport = async (opts = {}) => {
  const { id, bleDevice, promptUsb, usbDevice, hidDevice } = opts;
  if (bleDevice && bleDevice.gatt) {
    return openBleTransport(bleDevice);
  }
  if (usbDevice || hidDevice) {
    return openPickedLedgerDevice({ usbDevice, hidDevice });
  }
  if (isLedgerUsbId(id)) {
    return openUsbTransport({ prompt: Boolean(promptUsb) });
  }
  if (id != null && String(id) !== '') {
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      throw new Error(bleMissingMessage());
    }
    const granted = await findGrantedBluetoothDevice(String(id));
    if (granted && granted.gatt) {
      return openBleTransport(granted);
    }
    throw new Error(LEDGER_BLE_NEED_PICKER_MESSAGE);
  }
  throw new Error('Missing Ledger device');
};
