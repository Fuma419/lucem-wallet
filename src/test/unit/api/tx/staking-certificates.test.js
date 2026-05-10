import * as Cardano from '@emurgo/cardano-serialization-lib-nodejs';
import {
  createStakeDelegationCertificate,
  createStakeRegistrationCertificate,
} from '../../../../api/tx/staking-certificates';

const stakeKeyHash = '00'.repeat(28);
const poolKeyHash = '11'.repeat(28);

describe('staking certificate builders', () => {
  test('builds a stake registration certificate from the account stake key hash', () => {
    const certificate = createStakeRegistrationCertificate(Cardano, stakeKeyHash);
    const registration = certificate.as_stake_registration();

    expect(registration).toBeTruthy();
    expect(
      registration.stake_credential().to_keyhash().to_hex()
    ).toBe(stakeKeyHash);
  });

  test('builds stake delegation with the pool key hash type expected by CSL', () => {
    const certificate = createStakeDelegationCertificate(
      Cardano,
      stakeKeyHash,
      poolKeyHash
    );
    const delegation = certificate.as_stake_delegation();

    expect(delegation).toBeTruthy();
    expect(delegation.stake_credential().to_keyhash().to_hex()).toBe(
      stakeKeyHash
    );
    expect(delegation.pool_keyhash().to_hex()).toBe(poolKeyHash);
  });

  test('rejects invalid pool key hashes before calling CSL constructors', () => {
    expect(() =>
      createStakeDelegationCertificate(Cardano, stakeKeyHash, 'pool1abc')
    ).toThrow('Stake pool key hash is missing or invalid');
  });
});
