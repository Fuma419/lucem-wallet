/**
 * @jest-environment jsdom
 */
describe('platform/capacitor native shell helpers', () => {
  let capacitor;

  beforeEach(() => {
    jest.resetModules();
    delete window.Capacitor;
    capacitor = require('../../../platform/capacitor');
  });

  test('isNativePlatform is false on web/jsdom without Capacitor bridge', () => {
    expect(capacitor.isNativePlatform()).toBe(false);
  });

  test('isNativePlatform is true when Capacitor reports native', () => {
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {},
    };
    expect(capacitor.isNativePlatform()).toBe(true);
  });

  test('ensureCameraPermission is a no-op grant on web', async () => {
    await expect(capacitor.ensureCameraPermission()).resolves.toBe(true);
  });

  test('ensureCameraPermission requests camera on native when not granted', async () => {
    const checkPermissions = jest.fn().mockResolvedValue({ camera: 'prompt' });
    const requestPermissions = jest
      .fn()
      .mockResolvedValue({ camera: 'granted' });
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        Camera: { checkPermissions, requestPermissions },
      },
    };

    await expect(capacitor.ensureCameraPermission()).resolves.toBe(true);
    expect(checkPermissions).toHaveBeenCalled();
    expect(requestPermissions).toHaveBeenCalledWith({
      permissions: ['camera'],
    });
  });

  test('ensureCameraPermission returns false when native prompt is denied', async () => {
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        Camera: {
          checkPermissions: jest.fn().mockResolvedValue({ camera: 'denied' }),
          requestPermissions: jest
            .fn()
            .mockResolvedValue({ camera: 'denied' }),
        },
      },
    };

    await expect(capacitor.ensureCameraPermission()).resolves.toBe(false);
  });

  test('initNativeShell is a no-op on web', async () => {
    await expect(capacitor.initNativeShell()).resolves.toBeUndefined();
  });

  test('initNativeShell wires status bar, splash, and back button on native', async () => {
    const setStyle = jest.fn().mockResolvedValue(undefined);
    const setBackgroundColor = jest.fn().mockResolvedValue(undefined);
    const setOverlaysWebView = jest.fn().mockResolvedValue(undefined);
    const hide = jest.fn().mockResolvedValue(undefined);
    const addListener = jest.fn();
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        StatusBar: { setStyle, setBackgroundColor, setOverlaysWebView },
        SplashScreen: { hide },
        App: { addListener, exitApp: jest.fn() },
      },
    };

    await capacitor.initNativeShell();

    expect(setStyle).toHaveBeenCalledWith({ style: 'LIGHT' });
    expect(setBackgroundColor).toHaveBeenCalledWith({ color: '#080808' });
    expect(setOverlaysWebView).toHaveBeenCalledWith({ overlay: false });
    expect(hide).toHaveBeenCalled();
    expect(addListener).toHaveBeenCalledWith('backButton', expect.any(Function));
  });
});
