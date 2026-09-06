/**
 * CIP-30 internal popup relay: listeners must be removed after the popup
 * returns, otherwise a later popup can receive a stale signTx request
 * (wrong account / 0.0 ADA display).
 */
import { Messaging } from '../../../api/messaging';
import { APIError, METHOD, SENDER, TARGET } from '../../../config/config';

const PORT_NAME = 'internal-background-popup-communication';

function mockPort(tabId) {
  const messageListeners = [];
  const disconnectListeners = [];
  return {
    name: PORT_NAME,
    sender: { tab: { id: tabId } },
    onMessage: {
      addListener: (fn) => messageListeners.push(fn),
      removeListener: (fn) => {
        const i = messageListeners.indexOf(fn);
        if (i >= 0) messageListeners.splice(i, 1);
      },
    },
    onDisconnect: {
      addListener: (fn) => disconnectListeners.push(fn),
      removeListener: (fn) => {
        const i = disconnectListeners.indexOf(fn);
        if (i >= 0) disconnectListeners.splice(i, 1);
      },
    },
    postMessage: jest.fn(),
    emitMessage: (msg) => {
      for (const fn of [...messageListeners]) fn(msg);
    },
  };
}

describe('sendToPopupInternal', () => {
  let connectListeners;
  let removedListeners;
  let origConnect;
  let origRemoved;

  beforeEach(() => {
    connectListeners = [];
    removedListeners = [];
    origConnect = chrome.runtime.onConnect;
    origRemoved = chrome.tabs.onRemoved;
    chrome.runtime.onConnect = {
      addListener: (fn) => connectListeners.push(fn),
      removeListener: (fn) => {
        const i = connectListeners.indexOf(fn);
        if (i >= 0) connectListeners.splice(i, 1);
      },
    };
    chrome.tabs.onRemoved = {
      addListener: (fn) => removedListeners.push(fn),
      removeListener: (fn) => {
        const i = removedListeners.indexOf(fn);
        if (i >= 0) removedListeners.splice(i, 1);
      },
    };
  });

  afterEach(() => {
    chrome.runtime.onConnect = origConnect;
    chrome.tabs.onRemoved = origRemoved;
  });

  test('delivers the request and drops listeners after returnData', async () => {
    const tab = { id: 42 };
    const request = { method: METHOD.signTx, data: { tx: 'aa' } };
    const pending = Messaging.sendToPopupInternal(tab, request);

    expect(connectListeners).toHaveLength(1);
    const port = mockPort(42);
    connectListeners[0](port);
    port.emitMessage({ tabId: 42, method: METHOD.requestData });
    expect(port.postMessage).toHaveBeenCalledWith(request);

    port.emitMessage({
      tabId: 42,
      method: METHOD.returnData,
      data: 'witness',
    });
    await expect(pending).resolves.toEqual({
      tabId: 42,
      method: METHOD.returnData,
      data: 'witness',
    });
    expect(connectListeners).toHaveLength(0);
    expect(removedListeners).toHaveLength(0);
  });

  test('does not deliver a completed request to a later popup', async () => {
    const first = Messaging.sendToPopupInternal(
      { id: 1 },
      { method: METHOD.signTx, data: { tx: 'old' } }
    );
    const port1 = mockPort(1);
    connectListeners[0](port1);
    port1.emitMessage({ tabId: 1, method: METHOD.requestData });
    port1.emitMessage({
      tabId: 1,
      method: METHOD.returnData,
      data: 'first',
    });
    await first;

    const secondReq = { method: METHOD.signTx, data: { tx: 'new' } };
    const second = Messaging.sendToPopupInternal({ id: 2 }, secondReq);
    expect(connectListeners).toHaveLength(1);
    const port2 = mockPort(2);
    connectListeners[0](port2);
    port2.emitMessage({ tabId: 2, method: METHOD.requestData });
    expect(port2.postMessage).toHaveBeenCalledTimes(1);
    expect(port2.postMessage).toHaveBeenCalledWith(secondReq);
    expect(port2.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { tx: 'old' } })
    );

    port2.emitMessage({
      tabId: 2,
      method: METHOD.returnData,
      data: 'second',
    });
    await expect(second).resolves.toEqual(
      expect.objectContaining({ data: 'second' })
    );
  });

  test('refuses when the popup tab is closed before returnData', async () => {
    const pending = Messaging.sendToPopupInternal(
      { id: 7 },
      { method: METHOD.signTx, data: { tx: 'aa' } }
    );
    expect(removedListeners).toHaveLength(1);
    removedListeners[0](7);
    await expect(pending).resolves.toEqual({
      target: TARGET,
      sender: SENDER.extension,
      error: APIError.Refused,
    });
    expect(connectListeners).toHaveLength(0);
  });
});
