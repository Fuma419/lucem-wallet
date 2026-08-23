/**
 * Collect payment/stake key hashes a CIP-30 dApp tx needs from certificates.
 * Must not throw on unknown Conway certs — the sign UI used to spin forever.
 */

const pushKeyHash = (requiredKeyHashes, credential) => {
  if (!credential || typeof credential.kind !== 'function') return;
  if (credential.kind() !== 0) return;
  requiredKeyHashes.push(
    Buffer.from(credential.to_keyhash().to_bytes()).toString('hex')
  );
};

const credFrom = (obj) => {
  if (!obj || typeof obj.stake_credential !== 'function') return null;
  return obj.stake_credential();
};

/**
 * @param {object} certs CSL Certificate[] or null
 * @param {string[]} requiredKeyHashes mutated in place
 */
export const appendRequiredKeyHashesFromCerts = (certs, requiredKeyHashes) => {
  if (!certs || typeof certs.len !== 'function') return requiredKeyHashes;
  for (let i = 0; i < certs.len(); i++) {
    const cert = certs.get(i);
    try {
      pushKeyHash(
        requiredKeyHashes,
        credFrom(cert.as_stake_registration?.() || cert.as_reg_cert?.())
      );
      pushKeyHash(
        requiredKeyHashes,
        credFrom(cert.as_stake_deregistration?.() || cert.as_unreg_cert?.())
      );
      pushKeyHash(requiredKeyHashes, credFrom(cert.as_stake_delegation?.()));
      pushKeyHash(
        requiredKeyHashes,
        credFrom(cert.as_stake_registration_and_delegation?.())
      );
      pushKeyHash(
        requiredKeyHashes,
        credFrom(cert.as_stake_and_vote_delegation?.())
      );
      pushKeyHash(
        requiredKeyHashes,
        credFrom(cert.as_stake_vote_registration_and_delegation?.())
      );
      pushKeyHash(requiredKeyHashes, credFrom(cert.as_vote_delegation?.()));
      pushKeyHash(
        requiredKeyHashes,
        credFrom(cert.as_vote_registration_and_delegation?.())
      );

      const poolReg = cert.as_pool_registration?.();
      if (poolReg) {
        const owners = poolReg.pool_params().pool_owners();
        for (let o = 0; o < owners.len(); o++) {
          requiredKeyHashes.push(
            Buffer.from(owners.get(o).to_bytes()).toString('hex')
          );
        }
      }

      const mir = cert.as_move_instantaneous_rewards_cert?.();
      const toStake = mir?.move_instantaneous_reward?.()?.as_to_stake_creds?.();
      if (toStake) {
        const keys = toStake.keys();
        for (let k = 0; k < keys.len(); k++) {
          pushKeyHash(requiredKeyHashes, keys.get(k));
        }
      }
    } catch (/** @type {any} */ _) {
      // Unknown or incomplete cert — keep decoding the rest of the tx.
    }
  }
  return requiredKeyHashes;
};
