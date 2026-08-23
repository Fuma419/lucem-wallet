const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const {
  appendRequiredKeyHashesFromCerts,
} = require('../../../../api/tx/cert-required-key-hashes');

const stakeHex = '11'.repeat(28);
const poolHex = '22'.repeat(28);

const stakeCred = () =>
  CSL.Credential.from_keyhash(
    CSL.Ed25519KeyHash.from_bytes(Buffer.from(stakeHex, 'hex'))
  );

const poolHash = () =>
  CSL.Ed25519KeyHash.from_bytes(Buffer.from(poolHex, 'hex'));

const listOf = (...certs) => {
  const list = CSL.Certificates.new();
  for (const cert of certs) list.add(cert);
  return list;
};

describe('appendRequiredKeyHashesFromCerts', () => {
  test('reads legacy registration + delegation', () => {
    const hashes = [];
    appendRequiredKeyHashesFromCerts(
      listOf(
        CSL.Certificate.new_stake_registration(
          CSL.StakeRegistration.new(stakeCred())
        ),
        CSL.Certificate.new_stake_delegation(
          CSL.StakeDelegation.new(stakeCred(), poolHash())
        )
      ),
      hashes
    );
    expect(hashes).toContain(stakeHex);
  });

  test('reads Conway reg_cert with deposit (Mesh first-time register)', () => {
    const hashes = [];
    appendRequiredKeyHashesFromCerts(
      listOf(
        CSL.Certificate.new_reg_cert(
          CSL.StakeRegistration.new_with_explicit_deposit(
            stakeCred(),
            CSL.BigNum.from_str('2000000')
          )
        )
      ),
      hashes
    );
    expect(hashes).toContain(stakeHex);
  });

  test('reads combined stake registration and delegation', () => {
    const hashes = [];
    appendRequiredKeyHashesFromCerts(
      listOf(
        CSL.Certificate.new_stake_registration_and_delegation(
          CSL.StakeRegistrationAndDelegation.new(
            stakeCred(),
            poolHash(),
            CSL.BigNum.from_str('2000000')
          )
        )
      ),
      hashes
    );
    expect(hashes).toContain(stakeHex);
  });

  test('does not throw on an empty cert list', () => {
    expect(appendRequiredKeyHashesFromCerts(CSL.Certificates.new(), [])).toEqual(
      []
    );
  });
});
