/**
 * Functional test harness for the Lucem dApp connector.
 *
 * Reconstructs the real runtime message path used by a CIP-30 dApp session so
 * tests can drive it end to end in jsdom:
 *
 *   webpage API (src/api/webpage)
 *     → window.postMessage           (Messaging.sendToContent)
 *     → content proxy                (Messaging.createProxyController)
 *     → chrome.runtime.sendMessage   (Messaging.sendToBackground)
 *     → background router            (src/pages/Background) → sendResponse
 *     → window.postMessage           (proxy relays the response)
 *     → webpage API promise resolves
 *
 * Only the two ends that touch the outside world are simulated here: the
 * `chrome.runtime` message channel and jsdom's `window.postMessage` (which
 * otherwise requires a targetOrigin and dispatches inconsistently). The
 * connector code under test is exercised unchanged.
 */

/** Every listener registered via chrome.runtime.onMessage.addListener. */
function collectOnMessageListeners() {
  const addListener = chrome.runtime.onMessage.addListener;
  const calls = (addListener && addListener.mock && addListener.mock.calls) || [];
  return calls.map((call) => call[0]).filter((fn) => typeof fn === 'function');
}

/** Invoke every registered onMessage listener with the runtime message shape. */
function dispatchToOnMessage(message, sender, sendResponse) {
  const onMessage = chrome.runtime.onMessage;
  if (typeof onMessage.callListeners === 'function') {
    onMessage.callListeners(message, sender, sendResponse);
    return;
  }
  collectOnMessageListeners().forEach((listener) => {
    try {
      listener(message, sender, sendResponse);
    } catch (_e) {
      // A misbehaving listener must not abort the others.
    }
  });
}

/**
 * Route chrome.runtime.sendMessage to the background's onMessage listeners and
 * pipe the first sendResponse back into the caller's callback, mirroring the
 * MV3 runtime channel.
 */
export function installBackgroundBridge() {
  chrome.runtime.sendMessage.mockImplementation((message, callback) => {
    let answered = false;
    const sendResponse = (response) => {
      if (answered) return;
      answered = true;
      if (typeof callback === 'function') callback(response);
    };
    dispatchToOnMessage(message, { id: chrome.runtime.id }, sendResponse);
    return undefined;
  });
}

/**
 * jsdom's window.postMessage requires a targetOrigin and its delivery timing is
 * awkward for tests; replace it with an async CustomEvent-style dispatch that
 * matches how content scripts and the injected API actually observe messages.
 */
export function installWindowMessageShim() {
  window.postMessage = (data) => {
    setTimeout(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data,
          origin: window.origin,
          source: window,
        })
      );
    }, 0);
  };
}

/** Reset the bridge between tests while keeping the routing implementation. */
export function clearBridge() {
  if (chrome.runtime.sendMessage.mockClear) {
    chrome.runtime.sendMessage.mockClear();
  }
}
