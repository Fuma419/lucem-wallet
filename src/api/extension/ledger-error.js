/**
 * Map Ledger APDU / transport failures to copy a user can act on.
 *
 * Host library 7.x dumped `General error 0x6e01` plus a GitHub errors.h
 * link. Flex/Stax run Cardano app v8; 0x6e01 is the usual dashboard /
 * “app not selected” status, not a malformed Lucem request.
 */

export const LEDGER_SW = {
  CLA_NOT_SUPPORTED: 0x6e00,
  APP_NOT_SELECTED: 0x6e01,
  BAD_CLA: 0x6e02,
  UNKNOWN_INS: 0x6e03,
  DEVICE_LOCKED: 0x6e11,
  PIN_SCREEN: 0x5515,
  INS_NOT_SUPPORTED: 0x6d00,
  FUNCTION_NOT_SUPPORTED: 0x6a81,
  USER_REJECTED: 0x6985,
};

export const LEDGER_APP_NOT_OPEN_MESSAGE =
  'Unlock the Ledger, close Ledger Live, then open the Cardano app so it fills the screen (not the home icon list). Leave it open and try again.';

export const LEDGER_CHOOSER_CANCELLED_MESSAGE =
  'Chrome closed the Bluetooth or USB picker. Unlock the Ledger, open the Cardano app, tap Confirm again, and pick the Ledger in the list.';

export const LEDGER_BLE_NOT_LEDGER_MESSAGE =
  'That Bluetooth device is not a Ledger, or the Cardano app is not open. Unlock the Ledger, open Cardano so it fills the screen, then pick the Ledger in the list.';

export const LEDGER_WITNESS_ASSEMBLE_MESSAGE =
  'Ledger signed the transaction, but Lucem could not attach the signature. Refresh and try once more. This is a Lucem bug, not a Ledger problem.';

const LEDGER_LOCKED_MESSAGE =
  'The Ledger is locked. Unlock it, open the Cardano app, then try again.';

const LEDGER_WRONG_APP_MESSAGE =
  'The Cardano app is not active on the Ledger. Open Cardano on the device and try again.';

const HEX_STATUS_RE = /0x([0-9a-f]{3,4})\b/i;

export const ledgerStatusCode = (err) => {
  if (err == null) return null;
  if (typeof err === 'object') {
    if (typeof err.statusCode === 'number') return err.statusCode;
    if (typeof err.code === 'number' && err.code > 0xff) return err.code;
  }
  const text = err && err.message ? String(err.message) : String(err);
  const match = text.match(HEX_STATUS_RE);
  if (!match) return null;
  return parseInt(match[1], 16);
};

export const isLedgerAppNotSelectedError = (err) => {
  const code = ledgerStatusCode(err);
  if (
    code === LEDGER_SW.APP_NOT_SELECTED ||
    code === LEDGER_SW.CLA_NOT_SUPPORTED ||
    code === LEDGER_SW.BAD_CLA ||
    code === LEDGER_SW.UNKNOWN_INS ||
    code === LEDGER_SW.INS_NOT_SUPPORTED ||
    code === LEDGER_SW.FUNCTION_NOT_SUPPORTED
  ) {
    return true;
  }
  const text = err && err.message ? String(err.message) : String(err);
  return /app not selected|wrong ledger app|cardano app (is )?not|function not supported/i.test(
    text
  );
};

const isAlreadyFriendly = (text) => {
  if (!text) return false;
  if (text.includes('Please consult')) return false;
  if (/^General error 0x/i.test(text)) return false;
  if (text === LEDGER_APP_NOT_OPEN_MESSAGE) return true;
  if (text === LEDGER_CHOOSER_CANCELLED_MESSAGE) return true;
  if (text === LEDGER_BLE_NOT_LEDGER_MESSAGE) return true;
  if (text === LEDGER_WITNESS_ASSEMBLE_MESSAGE) return true;
  if (text.startsWith('Ledger signed the transaction, but Lucem')) return true;
  if (text.startsWith('Could not wrap the Ledger')) return true;
  if (text.startsWith('Could not attach the Ledger signature')) return true;
  if (text.startsWith('This Ledger Cardano app is too old')) return true;
  if (text.includes('open the Cardano app')) return true;
  return false;
};

export const formatLedgerError = (err, fallback) => {
  let text = err && err.message ? String(err.message) : err ? String(err) : '';
  if (
    /expected instance of/i.test(text) &&
    /Could not |Ledger signed the transaction, but Lucem/i.test(text)
  ) {
    text = text.replace(
      /expected instance of \w+/gi,
      'a Cardano type mismatch'
    );
  }
  if (isAlreadyFriendly(text)) return text;

  const code = ledgerStatusCode(err);
  if (
    code === LEDGER_SW.DEVICE_LOCKED ||
    code === LEDGER_SW.PIN_SCREEN
  ) {
    return LEDGER_LOCKED_MESSAGE;
  }
  if (isLedgerAppNotSelectedError(err)) {
    return LEDGER_APP_NOT_OPEN_MESSAGE;
  }
  if (
    /cancelled the requestDevice|Must be handling a user gesture/i.test(text)
  ) {
    return LEDGER_CHOOSER_CANCELLED_MESSAGE;
  }
  if (/expected instance of/i.test(text)) {
    if (
      /Could not |Ledger signed the transaction, but Lucem/i.test(text)
    ) {
      return text.replace(
        /expected instance of \w+/gi,
        'a Cardano type mismatch'
      );
    }
    return LEDGER_WITNESS_ASSEMBLE_MESSAGE;
  }
  if (text && !/please consult|general error 0x/i.test(text)) {
    return text;
  }
  if (fallback) return fallback;
  return LEDGER_APP_NOT_OPEN_MESSAGE;
};

export const ledgerAppTooOldMessage = (recommendedVersion) =>
  `This Ledger Cardano app is too old for Lucem. In Ledger Live, update Cardano${
    recommendedVersion ? ` to ${recommendedVersion}` : ' to the latest version'
  }, open it on the device, then try again.`;
