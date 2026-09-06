/**
 * @jest-environment jsdom
 */

jest.mock('@ledgerhq/hw-transport-webhid', () => ({
  __esModule: true,
  default: { create: jest.fn(async () => ({ kind: 'hid' })) },
}));
jest.mock('@ledgerhq/hw-transport-webusb', () => ({
  __esModule: true,
  default: { create: jest.fn(async () => ({ kind: 'usb' })) },
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

  afterEach(() => {
    TransportWebHID.create.mockClear();
    TransportWebUSB.create.mockClear();
    TransportWebBLE.open.mockClear();
    if (originalHid === undefined) delete navigator.hid;
    else navigator.hid = originalHid;
    if (originalUsb === undefined) delete navigator.usb;
    else navigator.usb = originalUsb;
    if (originalBluetooth === undefined) delete navigator.bluetooth;
    else navigator.bluetooth = originalBluetooth;
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

  test('openLedgerTransport uses WebHID for the USB sentinel', async () => {
    Object.defineProperty(navigator, 'hid', {
      configurable: true,
      value: { requestDevice: jest.fn() },
    });
    const t = await openLedgerTransport({ id: LEDGER_USB_ID });
    expect(t).toEqual({ kind: 'hid' });
    expect(TransportWebHID.create).toHaveBeenCalled();
    expect(TransportWebBLE.open).not.toHaveBeenCalled();
  });

  test('openLedgerTransport falls back to WebUSB when HID fails', async () => {
    Object.defineProperty(navigator, 'hid', {
      configurable: true,
      value: { requestDevice: jest.fn() },
    });
    Object.defineProperty(navigator, 'usb', {
      configurable: true,
      value: { requestDevice: jest.fn() },
    });
    TransportWebHID.create.mockRejectedValueOnce(new Error('hid busy'));
    const t = await openLedgerTransport({ id: 'usb' });
    expect(t).toEqual({ kind: 'usb' });
    expect(TransportWebUSB.create).toHaveBeenCalled();
  });

  test('openLedgerTransport opens BLE when a gatt device is passed', async () => {
    const bleDevice = { id: 'ble-1', gatt: {} };
    const t = await openLedgerTransport({ id: 'ble-1', bleDevice });
    expect(t).toEqual({ kind: 'ble', dev: bleDevice });
    expect(TransportWebBLE.open).toHaveBeenCalledWith(bleDevice);
  });
});
