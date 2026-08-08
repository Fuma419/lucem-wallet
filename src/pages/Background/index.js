import {
  createPopup,
  extractKeyHash,
  getAddress,
  getBalance,
  getCollateral,
  getNetwork,
  getRewardAddress,
  getRegisteredPubStakeKeys,
  getUnregisteredPubStakeKeys,
  getPubDRepKey,
  getUtxos,
  isWhitelisted,
  submitTx,
  verifyPayload,
  verifyTx,
} from '../../api/extension';
import { Messaging } from '../../api/messaging';
import {
  APIError,
  METHOD,
  NETWORKD_ID_NUMBER,
  POPUP,
  SENDER,
  TARGET,
} from '../../config/config';

const app = Messaging.createBackgroundController();

/**
 * listens to requests from the web context
 */

const sendError = (request, sendResponse, error) =>
  sendResponse({
    id: request.id,
    error,
    target: TARGET,
    sender: SENDER.extension,
  });

/**
 * Defense-in-depth authorization gate for privileged dApp methods.
 *
 * The content-script proxy (`Messaging.createProxyController`) already refuses
 * non-`enable`/`isEnabled` methods for origins the user has not whitelisted, but
 * the background must NOT depend on a single upstream gate. A bug in the proxy,
 * or any future message surface, must never be able to read wallet data or open
 * a signing popup for an unauthorized origin. Every privileged handler is wrapped
 * so it re-verifies `isWhitelisted(request.origin)` before doing any work.
 */
const requireWhitelist = (handler) => async (request, sendResponse) => {
  let whitelisted = false;
  try {
    whitelisted = await isWhitelisted(request.origin);
  } catch (e) {
    return sendError(request, sendResponse, APIError.InternalError);
  }
  if (!whitelisted) {
    return sendError(request, sendResponse, APIError.Refused);
  }
  return handler(request, sendResponse);
};

app.add(
  METHOD.getBalance,
  requireWhitelist((request, sendResponse) => {
    getBalance()
      .then((value) => {
        sendResponse({
          id: request.id,
          data: Buffer.from(value.to_bytes()).toString('hex'),
          target: TARGET,
          sender: SENDER.extension,
        });
      })
      .catch((e) => {
        sendResponse({
          id: request.id,
          error: e,
          target: TARGET,
          sender: SENDER.extension,
        });
      });
  })
);

app.add(METHOD.enable, async (request, sendResponse) => {
  isWhitelisted(request.origin)
    .then(async (whitelisted) => {
      if (whitelisted) {
        sendResponse({
          id: request.id,
          data: true,
          target: TARGET,
          sender: SENDER.extension,
        });
      } else {
        const response = await createPopup(POPUP.internal)
          .then((tab) => Messaging.sendToPopupInternal(tab, request))
          .then((response) => response);
        if (response.data === true) {
          sendResponse({
            id: request.id,
            data: true,
            target: TARGET,
            sender: SENDER.extension,
          });
        } else if (response.error) {
          sendResponse({
            id: request.id,
            error: response.error,
            target: TARGET,
            sender: SENDER.extension,
          });
        } else {
          sendResponse({
            id: request.id,
            error: APIError.InternalError,
            target: TARGET,
            sender: SENDER.extension,
          });
        }
      }
    })
    .catch(() =>
      sendResponse({
        id: request.id,
        error: APIError.InternalError,
        target: TARGET,
        sender: SENDER.extension,
      })
    );
});

app.add(METHOD.isEnabled, (request, sendResponse) => {
  isWhitelisted(request.origin)
    .then((whitelisted) => {
      sendResponse({
        id: request.id,
        data: whitelisted,
        target: TARGET,
        sender: SENDER.extension,
      });
    })
    .catch(() => {
      sendResponse({
        id: request.id,
        error: APIError.InternalError,
        target: TARGET,
        sender: SENDER.extension,
      });
    });
});

app.add(
  METHOD.getAddress,
  requireWhitelist(async (request, sendResponse) => {
    const address = await getAddress();
    if (address) {
      sendResponse({
        id: request.id,
        data: address,
        target: TARGET,
        sender: SENDER.extension,
      });
    } else {
      sendResponse({
        id: request.id,
        error: APIError.InternalError,
        target: TARGET,
        sender: SENDER.extension,
      });
    }
  })
);

app.add(
  METHOD.getRewardAddress,
  requireWhitelist(async (request, sendResponse) => {
    const address = await getRewardAddress();
    if (address) {
      sendResponse({
        id: request.id,
        data: address,
        target: TARGET,
        sender: SENDER.extension,
      });
    } else {
      sendResponse({
        id: request.id,
        error: APIError.InternalError,
        target: TARGET,
        sender: SENDER.extension,
      });
    }
  })
);

app.add(
  METHOD.getRegisteredPubStakeKeys,
  requireWhitelist(async (request, sendResponse) => {
    try {
      const keys = await getRegisteredPubStakeKeys();
      sendResponse({
        id: request.id,
        data: keys,
        target: TARGET,
        sender: SENDER.extension,
      });
    } catch (e) {
      sendResponse({
        id: request.id,
        error: e,
        target: TARGET,
        sender: SENDER.extension,
      });
    }
  })
);

app.add(
  METHOD.getUnregisteredPubStakeKeys,
  requireWhitelist(async (request, sendResponse) => {
    try {
      const keys = await getUnregisteredPubStakeKeys();
      sendResponse({
        id: request.id,
        data: keys,
        target: TARGET,
        sender: SENDER.extension,
      });
    } catch (e) {
      sendResponse({
        id: request.id,
        error: e,
        target: TARGET,
        sender: SENDER.extension,
      });
    }
  })
);

app.add(
  METHOD.getPubDRepKey,
  requireWhitelist(async (request, sendResponse) => {
    try {
      const key = await getPubDRepKey();
      sendResponse({
        id: request.id,
        data: key,
        target: TARGET,
        sender: SENDER.extension,
      });
    } catch (e) {
      sendResponse({
        id: request.id,
        error: e,
        target: TARGET,
        sender: SENDER.extension,
      });
    }
  })
);

app.add(
  METHOD.getUtxos,
  requireWhitelist((request, sendResponse) => {
    getUtxos(request.data.amount, request.data.paginate)
      .then((utxos) => {
        utxos = utxos
          ? utxos.map((utxo) => Buffer.from(utxo.to_bytes()).toString('hex'))
          : null;
        sendResponse({
          id: request.id,
          data: utxos,
          target: TARGET,
          sender: SENDER.extension,
        });
      })
      .catch((e) => {
        sendResponse({
          id: request.id,
          error: e,
          target: TARGET,
          sender: SENDER.extension,
        });
      });
  })
);

app.add(
  METHOD.getCollateral,
  requireWhitelist((request, sendResponse) => {
    getCollateral(request.data)
      .then((utxos) => {
        utxos = utxos
          ? utxos.map((utxo) => Buffer.from(utxo.to_bytes()).toString('hex'))
          : null;
        sendResponse({
          id: request.id,
          data: utxos,
          target: TARGET,
          sender: SENDER.extension,
        });
      })
      .catch((e) => {
        sendResponse({
          id: request.id,
          error: e,
          target: TARGET,
          sender: SENDER.extension,
        });
      });
  })
);

app.add(
  METHOD.submitTx,
  requireWhitelist((request, sendResponse) => {
    submitTx(request.data)
      .then((txHash) => {
        sendResponse({
          id: request.id,
          data: txHash,
          target: TARGET,
          sender: SENDER.extension,
        });
      })
      .catch((e) => {
        sendResponse({
          id: request.id,
          target: TARGET,
          error: e,
          sender: SENDER.extension,
        });
      });
  })
);

app.add(METHOD.isWhitelisted, async (request, sendResponse) => {
  const whitelisted = await isWhitelisted(request.origin);
  if (whitelisted) {
    sendResponse({
      data: whitelisted,
      target: TARGET,
      sender: SENDER.extension,
    });
  } else {
    sendResponse({
      error: APIError.Refused,
      target: TARGET,
      sender: SENDER.extension,
    });
  }
});

app.add(
  METHOD.getNetworkId,
  requireWhitelist(async (request, sendResponse) => {
    const network = await getNetwork();
    if (network)
      sendResponse({
        id: request.id,
        data: NETWORKD_ID_NUMBER[network.id],
        target: TARGET,
        sender: SENDER.extension,
      });
    else
      sendResponse({
        id: request.id,
        error: APIError.InternalError,
        target: TARGET,
        sender: SENDER.extension,
      });
  })
);

app.add(
  METHOD.signData,
  requireWhitelist(async (request, sendResponse) => {
    try {
      verifyPayload(request.data.payload);
      await extractKeyHash(request.data.address);

      const response = await createPopup(POPUP.internal)
        .then((tab) => Messaging.sendToPopupInternal(tab, request))
        .then((response) => response);

      if (response.data) {
        sendResponse({
          id: request.id,
          data: response.data,
          target: TARGET,
          sender: SENDER.extension,
        });
      } else if (response.error) {
        sendResponse({
          id: request.id,
          error: response.error,
          target: TARGET,
          sender: SENDER.extension,
        });
      } else {
        sendResponse({
          id: request.id,
          error: APIError.InternalError,
          target: TARGET,
          sender: SENDER.extension,
        });
      }
    } catch (e) {
      sendResponse({
        id: request.id,
        error: e,
        target: TARGET,
        sender: SENDER.extension,
      });
    }
  })
);

app.add(
  METHOD.signTx,
  requireWhitelist(async (request, sendResponse) => {
    try {
      await verifyTx(request.data.tx);
      const response = await createPopup(POPUP.internal)
        .then((tab) => Messaging.sendToPopupInternal(tab, request))
        .then((response) => response);

      if (response.data) {
        sendResponse({
          id: request.id,
          data: response.data,
          target: TARGET,
          sender: SENDER.extension,
        });
      } else if (response.error) {
        sendResponse({
          id: request.id,
          error: response.error,
          target: TARGET,
          sender: SENDER.extension,
        });
      } else {
        sendResponse({
          id: request.id,
          error: APIError.InternalError,
          target: TARGET,
          sender: SENDER.extension,
        });
      }
    } catch (e) {
      sendResponse({
        id: request.id,
        error: e,
        target: TARGET,
        sender: SENDER.extension,
      });
    }
  })
);

app.listen();
