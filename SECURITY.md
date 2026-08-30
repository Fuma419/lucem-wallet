# Security Policy

Lucem is a wallet: it holds Cardano keys. Treat reports that could leak, steal, or misuse those keys as security issues.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/Fuma419/lucem-wallet/security/advisories/new). Do not open a public issue, pull request, or discussion for an unfixed vulnerability.

Include steps to reproduce, affected version (or commit), and impact. We will acknowledge the report and work on a fix before public disclosure.

## Never paste seeds or keys

Never put a recovery (seed) phrase, private key, spending password, or hardware-wallet PIN in:

- GitHub issues, pull requests, discussions, or screenshots
- logs, crash dumps, or support chat
- this repository

If a seed was exposed, treat it as compromised: move funds to a newly generated wallet and stop using that phrase.

## Scope

In scope: key generation and storage, backup/restore, signing (software and hardware), the CIP-30 / CIP-95 injector, and anything that could exfiltrate or misuse user keys.

Out of scope: issues that require an already-unlocked device in the attacker’s hands, or tricking a user into revealing their own seed.
