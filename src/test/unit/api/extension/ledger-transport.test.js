/**
 * @jest-environment jsdom
 */

jest.mock('@ledgerhq/hw-transport-webhid', () => ({
  __esModule: true,
  default: {
    create: jest.fn(async () => ({ kind: 'hid-create' })),
    openConnected: jest.fn(async () => null),
    request: jest.fn(async () => ({ kind: 'hid' })),
  },
}));
jest.mock('@ledgerhq/hw-transport-webusb', () => ({
  __esModule: true,
  default: {
    create: jest.fn(async () => ({ kind: 'usb-create' })),
    openConnected: jest.fn(async () => null),
    request: jest.fn(async () => ({ kind: 'usb' })),
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
  isLedgerUsbId,
  hasLedgerUsbApi,
  openLedgerTransport,
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
    TransportWebUSB.create.mockClear();
    TransportWebUSB.openConnected.mockClear();
    TransportWebUSB.request.mockClear();
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
});
