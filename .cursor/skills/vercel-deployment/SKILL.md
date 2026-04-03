# Vercel Deployment

**Trigger:** Agent modifies build configuration, `vercel.json`, HTML entry points, or needs to deploy/verify the web app.

## Configuration

- **`vercel.json`** at repo root: build command, output directory, SPA rewrites.
- **Output directory:** `build/` (webpack output, not `public/`).
- **Node version:** 20.x (set in Vercel project settings).
- **Secrets:** `utils/build.js` auto-generates `secrets.production.js` from `secrets.testing.js` if missing.

## Rewrites

```json
{ "source": "/", "destination": "/mainPopup.html" }
{ "source": "/wallet", "destination": "/mainPopup.html" }
{ "source": "/welcome", "destination": "/mainPopup.html" }
{ "source": "/send", "destination": "/mainPopup.html" }
{ "source": "/settings/:path*", "destination": "/mainPopup.html" }
```

## Deploy commands

```bash
# Preview deployment
vercel deploy --token $VERCEL_TOKEN --scope my-team-5c660a1c --yes

# Production deployment
vercel deploy --prod --token $VERCEL_TOKEN --scope my-team-5c660a1c --yes
```

## Rules

1. If adding a new HTML entry point, add a corresponding rewrite in `vercel.json`.
2. If adding new client-side routes in React Router, add matching rewrites.
3. Test locally first: `npm run build && npx serve build` — verify HTML files exist before deploying.
4. The build must succeed without `secrets.production.js` on disk (auto-generation handles it).
5. Never add `build/` to git — it's in `.gitignore`.

## Debugging deploy failures

1. Check `vercel logs` or the Vercel dashboard for build output.
2. Common failure: missing secrets file → fixed by auto-generation in `utils/build.js`.
3. Common failure: wrong output directory → must be `build/` not `public/`.
4. Common failure: Node version → must be 20.x, not 24.x.
