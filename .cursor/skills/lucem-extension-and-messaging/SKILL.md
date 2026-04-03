---
name: lucem-extension-and-messaging
description: Plans and implements changes that span the Lucem Cardano MV3 extension and an optional Next.js messaging companion. Use when adding cross-app features, auth between extension and web, CIP-30 usage from the web app, deployment, or security reviews touching both surfaces.
---

# Lucem extension + messaging companion

## Before coding

1. Identify **which runtime** owns the feature: service worker, popup, content script, injected, or Next.js server/client.
2. Confirm **no secret key material** crosses into the Next.js app or public client bundles.
3. For Cardano operations from a website, assume **CIP-30 via `window.cardano.lucem`** unless the repo already implements another approved bridge.

## Integration checklist

- [ ] Extension: manifest permissions and host permissions updated only if required; CSP still valid.
- [ ] Web: API base URLs are env-driven; CORS matches deployment.
- [ ] Auth: short-lived tokens or session pattern documented; revocation considered.
- [ ] UX: user understands when they are in the extension vs the companion site.

## Deployment notes

- Extension: build zip / unpacked folder from `yarn build`; store listing assets separately from messaging web deploy.
- Next.js: deploy to its own origin; document that origin for extension allowlists if needed.

## Where to read

- Repo orientation: [AGENTS.md](../../../AGENTS.md) at repository root.
