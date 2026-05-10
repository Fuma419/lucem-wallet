const KEY_HASH_HEX_LENGTH = 56;

export function assertKeyHashHex(hex, label) {
  if (!hex || !/^[0-9a-fA-F]{56}$/.test(hex)) {
    throw new Error(`${label} is missing or invalid`);
  }
}

export function ed25519KeyHashFromHex(Cardano, hex, label) {
  assertKeyHashHex(hex, label);
  return Cardano.Ed25519KeyHash.from_bytes(Buffer.from(hex, 'hex'));
}

export function stakeCredentialFromHex(Cardano, stakeKeyHashHex) {
  return Cardano.Credential.from_keyhash(
    ed25519KeyHashFromHex(Cardano, stakeKeyHashHex, 'Stake key hash')
  );
}

export function createStakeRegistrationCertificate(Cardano, stakeKeyHashHex) {
  return Cardano.Certificate.new_stake_registration(
    Cardano.StakeRegistration.new(
      stakeCredentialFromHex(Cardano, stakeKeyHashHex)
    )
  );
}

export function createStakeDelegationCertificate(
  Cardano,
  stakeKeyHashHex,
  poolKeyHashHex
) {
  return Cardano.Certificate.new_stake_delegation(
    Cardano.StakeDelegation.new(
      stakeCredentialFromHex(Cardano, stakeKeyHashHex),
      ed25519KeyHashFromHex(Cardano, poolKeyHashHex, 'Stake pool key hash')
    )
  );
}

export { KEY_HASH_HEX_LENGTH };
