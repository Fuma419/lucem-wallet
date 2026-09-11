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
  isSafariOrIosWebKit,
  canConnectLedgerInThisBrowser,
  ledgerCannotConnectMessage,
  isMobilePlatform,
  shouldOfferLedgerImport,
  openLedgerTransport,
  pickLedgerUsbDevice,
  closeLedgerApp,
} = require('../../../../api/extension/ledger-transport');

describe('ledger USB / BLE transport', () => {
  const originalHid = navigator.hid;
  const originalUsb = navigator.usb;
  const originalBluetooth = navigator.bluetooth;
  const originalUa = navigator.userAgent;
  const originalVendor = navigator.vendor;
  const originalPlatform = navigator.platform;
  const originalMaxTouchPoints = navigator.maxTouchPoints;

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
    if (originalVendor === undefined) delete navigator.vendor;
    else {
      Object.defineProperty(navigator, 'vendor', {
        configurable: true,
        value: originalVendor,
      });
    }
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: originalPlatform,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: originalMaxTouchPoints,
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

  test('reconnect opens a granted HID device and never shows the picker', async () => {
    const hidDevice = { vendorId: LEDGER_USB_VENDOR_ID };
    Object.defineProperty(navigator, 'hid', {
      configurable: true,
      value: {
        requestDevice: jest.fn(),
        getDevices: jest.fn(async () => [hidDevice]),
      },
    });
    const t = await openLedgerTransport({ id: LEDGER_USB_ID });
    expect(t).toEqual({ kind: 'hid-open', d: hidDevice });
    expect(TransportWebHID.open).toHaveBeenCalledWith(hidDevice);
    expect(TransportWebHID.request).not.toHaveBeenCalled();
    expect(TransportWebHID.create).not.toHaveBeenCalled();
  });

  test('USB reconnect without a granted device does not call request()', async () => {
    Object.defineProperty(navigator, 'hid', {
      configurable: true,
      value: {
        requestDevice: jest.fn(),
        getDevices: jest.fn(async () => []),
      },
    });
    await expect(openLedgerTransport({ id: LEDGER_USB_ID })).rejects.toThrow(
      /Tap Confirm and pick your Ledger/
    );
    expect(TransportWebHID.request).not.toHaveBeenCalled();
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

  test('BLE reconnect opens a granted device by id without requestDevice', async () => {
    const ble = { id: 'ble-1', gatt: {} };
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        getDevices: jest.fn(async () => [ble]),
        requestDevice: jest.fn(),
      },
    });
    const t = await openLedgerTransport({ id: 'ble-1' });
    expect(t).toEqual({ kind: 'ble', dev: ble });
    expect(TransportWebBLE.open).toHaveBeenCalledWith(ble);
    expect(navigator.bluetooth.requestDevice).not.toHaveBeenCalled();
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

  test('iPhone Safari / PWA cannot connect Ledger', () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    });
    Object.defineProperty(navigator, 'vendor', {
      configurable: true,
      value: 'Apple Computer, Inc.',
    });
    delete navigator.hid;
    delete navigator.usb;
    delete navigator.bluetooth;
    expect(isSafariOrIosWebKit()).toBe(true);
    expect(canConnectLedgerInThisBrowser()).toBe(false);
    expect(ledgerCannotConnectMessage()).toMatch(/Safari cannot talk to Ledger/);
    expect(ledgerCannotConnectMessage()).toMatch(/home screen/);
    expect(ledgerCannotConnectMessage()).toMatch(/Keystone/);
  });

  test('macOS Safari cannot connect Ledger', () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    });
    Object.defineProperty(navigator, 'vendor', {
      configurable: true,
      value: 'Apple Computer, Inc.',
    });
    delete navigator.hid;
    delete navigator.usb;
    delete navigator.bluetooth;
    expect(isSafariOrIosWebKit()).toBe(true);
    expect(canConnectLedgerInThisBrowser()).toBe(false);
    expect(ledgerCannotConnectMessage()).toMatch(/Chrome or Edge/);
  });

  test('does not offer Ledger import on iPhone or Android', () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    });
    expect(isMobilePlatform()).toBe(true);
    expect(shouldOfferLedgerImport()).toBe(false);

    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile Safari/537.36',
    });
    Object.defineProperty(navigator, 'usb', {
      configurable: true,
      value: { requestDevice: jest.fn() },
    });
    expect(isMobilePlatform()).toBe(true);
    expect(shouldOfferLedgerImport()).toBe(false);
  });

  test('offers Ledger import on desktop Chrome', () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: 0,
    });
    expect(isMobilePlatform()).toBe(false);
    expect(shouldOfferLedgerImport()).toBe(true);
  });
});
