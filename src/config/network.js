import { NETWORK_ID } from './config';

export const isMidnightNetworkId = (networkId) =>
  networkId === NETWORK_ID.midnight_preview;
