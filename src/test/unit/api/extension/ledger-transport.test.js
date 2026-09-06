/**
 * @jest-environment jsdom
 */

jest.mock('@ledgerhq/hw-transport-webhid', () => ({
  __esModule: true,
  default: {
    create: jest.fn(async () => ({ kind: 'hid-create' })),
    openConnected: jest.fn(async () => null),
    request: jest.fn(async () => ({ kind: 'hid' })),
    open: jest.fn(async (d) => ({ kind: 'hid-open', d })),
  },
}));
jest.mock('@ledgerhq/hw-transport-webusb', () => ({
  __esModule: true,
  default: {
    create: jest.fn(async () => ({ kind: 'usb-create' })),
    openConnected: jest.fn(async () => null),
    request: jest.fn(async () => ({ kind: 'usb' })),
    open: jest.fn(async (d) => ({ kind: 'usb-open', d })),
  },
}));
jest.mock('@ledgerhq/hw-transport-web-ble', () => ({
  __esModule: true,
  default: { open: jest.fn(async (dev) => ({ kind: 'ble', dev })) },
}));

const TransportWebHID = require('@ledgerhq/hw-transport-webhid').default;
const TransportWebUSB = require('@ledgerhq/hw-transport-webusb').default;
const TransportWebBLE = require('@ledgerhq/hw-transport-web-ble').default;
const {
  LEDGER_USB_ID,
  LEDGER_USB_VENDOR_ID,
  isLedgerUsbId,
  hasLedgerUsbApi,
  openLedgerTransport,
  pickLedgerUsbDevice,
  closeLedgerApp,
} = require('../../../../api/extension/ledger-transport');

describe('ledger USB / BLE transport', () => {
  const originalHid = navigator.hid;
  const originalUsb = navigator.usb;
  const originalBluetooth = navigator.bluetooth;
  const originalUa = navigator.userAgent;

  afterEach(() => {
    TransportWebHID.create.mockClear();
    TransportWebHID.openConnected.mockClear();
    TransportWebHID.request.mockClear();
    TransportWebHID.open.mockClear();
    TransportWebUSB.create.mockClear();
    TransportWebUSB.openConnected.mockClear();
    TransportWebUSB.request.mockClear();
    TransportWebUSB.open.mockClear();
    TransportWebBLE.open.mockClear();
    if (originalHid === undefined) delete navigator.hid;
    else navigator.hid = originalHid;
    if (originalUsb === undefined) delete navigator.usb;
    else navigator.usb = originalUsb;
    if (originalBluetooth === undefined) delete navigator.bluetooth;
    else navigator.bluetooth = originalBluetooth;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUa,
    });
  });

  test('isLedgerUsbId recognizes stored USB sentinels', () => {
    expect(LEDGER_USB_ID).toBe('usb');
    expect(isLedgerUsbId('usb')).toBe(true);
    expect(isLedgerUsbId('webhid')).toBe(true);
    expect(isLedgerUsbId('opaque-ble-device-id')).toBe(false);
  });

  test('hasLedgerUsbApi is true when WebHID is present', () => {
    Object.defineProperty(navigator, 'hid', {
      configurable: true,
      value: { requestDevice: jest.fn() },
    });
    expect(hasLedgerUsbApi()).toBe(true);
  });

  test('openLedgerTransport prompts HID and never calls create()', async () => {
    Object.defineProperty(navigator, 'hid', {
      configurable: true,
      value: { requestDevice: jest.fn() },
    });
    const t = await openLedgerTransport({
      id: LEDGER_USB_ID,
      promptUsb: true,
    });
    expect(t).toEqual({ kind: 'hid' });
    expect(TransportWebHID.request).toHaveBeenCalled();
    expect(TransportWebHID.create).not.toHaveBeenCalled();
    expect(TransportWebHID.openConnected).not.toHaveBeenCalled();
    expect(TransportWebBLE.open).not.toHaveBeenCalled();
  });

  test('reconnect tries openConnected before requesting a picker', async () => {
    Object.defineProperty(navigator, 'hid', {
      configurable: true,
      value: { requestDevice: jest.fn() },
    });
    TransportWebHID.openConnected.mockResolvedValueOnce({ kind: 'hid-existing' });
    const t = await openLedgerTransport({ id: LEDGER_USB_ID });
    expect(t).toEqual({ kind: 'hid-existing' });
    expect(TransportWebHID.openConnected).toHaveBeenCalled();
    expect(TransportWebHID.request).not.toHaveBeenCalled();
    expect(TransportWebHID.create).not.toHaveBeenCalled();
  });

  test('Android uses WebUSB request, not HID create', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0',
    });
    Object.defineProperty(navigator, 'hid', {
      configurable: true,
      value: { requestDevice: jest.fn() },
    });
    Object.defineProperty(navigator, 'usb', {
      configurable: true,
      value: { requestDevice: jest.fn() },
    });
    const t = await openLedgerTransport({ id: 'usb', promptUsb: true });
    expect(t).toEqual({ kind: 'usb' });
    expect(TransportWebUSB.request).toHaveBeenCalled();
    expect(TransportWebHID.request).not.toHaveBeenCalled();
    expect(TransportWebUSB.create).not.toHaveBeenCalled();
  });

  test('openLedgerTransport opens BLE when a gatt device is passed', async () => {
    const bleDevice = { id: 'ble-1', gatt: {} };
    const t = await openLedgerTransport({ id: 'ble-1', bleDevice });
    expect(t).toEqual({ kind: 'ble', dev: bleDevice });
    expect(TransportWebBLE.open).toHaveBeenCalledWith(bleDevice);
  });

  test('pickLedgerUsbDevice calls requestDevice before any transport open', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0',
    });
    const usbDevice = { vendorId: LEDGER_USB_VENDOR_ID };
    const requestDevice = jest.fn(async () => usbDevice);
    Object.defineProperty(navigator, 'hid', {
      configurable: true,
      value: { requestDevice: jest.fn() },
    });
    Object.defineProperty(navigator, 'usb', {
      configurable: true,
      value: { requestDevice },
    });
    const picked = await pickLedgerUsbDevice();
    expect(picked).toEqual({ usbDevice });
    expect(requestDevice).toHaveBeenCalledWith({
      filters: expect.arrayContaining([
        expect.objectContaining({ vendorId: LEDGER_USB_VENDOR_ID }),
      ]),
    });
    expect(navigator.hid.requestDevice).not.toHaveBeenCalled();
    expect(TransportWebUSB.request).not.toHaveBeenCalled();
    expect(TransportWebUSB.open).not.toHaveBeenCalled();
  });

  test('openLedgerTransport opens a picked USB device without requesting again', async () => {
    const usbDevice = { vendorId: LEDGER_USB_VENDOR_ID, opened: false };
    Object.defineProperty(navigator, 'usb', {
      configurable: true,
      value: { requestDevice: jest.fn() },
    });
    const t = await openLedgerTransport({
      id: LEDGER_USB_ID,
      usbDevice,
    });
    expect(t).toEqual({ kind: 'usb-open', d: usbDevice });
    expect(TransportWebUSB.open).toHaveBeenCalledWith(usbDevice);
    expect(TransportWebUSB.request).not.toHaveBeenCalled();
    expect(navigator.usb.requestDevice).not.toHaveBeenCalled();
  });

  test('closeLedgerApp closes the transport when present', async () => {
    const close = jest.fn(async () => {});
    await closeLedgerApp({ transport: { close } });
    expect(close).toHaveBeenCalled();
  });
});
