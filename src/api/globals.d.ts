/**
 * Ambient types for the src/api checkJs project.
 * UI is not part of this program; only browser/extension globals used by the API.
 */

export {};

declare global {
  const chrome: any;
  const TrezorConnect: any;
  const CardanoAddressType: any;
  const CardanoTxSigningMode: any;
  const CardanoCertificateType: any;
  const CardanoPoolRelayType: any;

  interface Window {
    Capacitor?: any;
    assets?: any;
    cardano?: any;
  }

  interface Navigator {
    bluetooth?: any;
  }
}

declare module 'secrets' {
  const secrets: any;
  export default secrets;
}
