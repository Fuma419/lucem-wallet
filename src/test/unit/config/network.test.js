import { NETWORK_ID } from '../../../config/config';
import { isMidnightNetworkId } from '../../../config/network';

describe('network helpers', () => {
  test('isMidnightNetworkId detects Midnight Preview only', () => {
    expect(isMidnightNetworkId(NETWORK_ID.midnight_preview)).toBe(true);
    expect(isMidnightNetworkId(NETWORK_ID.preview)).toBe(false);
    expect(isMidnightNetworkId(NETWORK_ID.mainnet)).toBe(false);
  });
});
