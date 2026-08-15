import { asHexString, type Csl, type HexString } from '../types';

export const KEY_HASH_HEX_LENGTH = 56;

export function assertKeyHashHex(hex: string, label: string): asserts hex is HexString {
  if (!hex || !/^[0-9a-fA-F]{56}$/.test(hex)) {
    throw new Error(`${label} is missing or invalid`);
  }
}

export function ed25519KeyHashFromHex(Cardano: Csl, hex: string, label: string) {
  assertKeyHashHex(hex, label);
  return Cardano.Ed25519KeyHash.from_bytes(Buffer.from(asHexString(hex), 'hex'));
}

export function stakeCredentialFromHex(Cardano: Csl, stakeKeyHashHex: string) {
  return Cardano.Credential.from_keyhash(
    ed25519KeyHashFromHex(Cardano, stakeKeyHashHex, 'Stake key hash')
  );
}

export function createStakeRegistrationCertificate(Cardano: Csl, stakeKeyHashHex: string) {
  return Cardano.Certificate.new_stake_registration(
    Cardano.StakeRegistration.new(
      stakeCredentialFromHex(Cardano, stakeKeyHashHex)
    )
  );
}

export function createStakeDelegationCertificate(
  Cardano: Csl,
  stakeKeyHashHex: string,
  poolKeyHashHex: string
) {
  return Cardano.Certificate.new_stake_delegation(
    Cardano.StakeDelegation.new(
      stakeCredentialFromHex(Cardano, stakeKeyHashHex),
      ed25519KeyHashFromHex(Cardano, poolKeyHashHex, 'Stake pool key hash')
    )
  );
}
