# Peak portals: deployment

Status: the templates below are written, and the app is verified locally in both
development and production mode (`next start`). They have **not** been run on a
server yet, so expect to adjust paths and domains on the first deploy.

## What runs

| Process | Port | Serves |
| --- | --- | --- |
| taskflow backend | 4005, loopback | the portal API at `/portal-api/*`, called only by the portals |
| peak-portal-client | 9003, loopback | the client host |
| peak-portal-influencer | 9004, loopback | the influencer host |
| peak-games-lobby | 9005, loopback | the public games host (no sign-in; published public games only) |

One build of `portal/` serves all three hosts. `PORTAL_AUDIENCE` is read at runtime, so
the same `.next` output runs as three processes.

The portals are dark, so they use Peak's light-on-dark logo from `portal/public/brand`
(`PORTAL_LOGO_URL`, full logo; `PORTAL_MARK_URL`, the P-mark for phone headers). The pm2
file sets both; without them the company's own logo is used.

## Backend environment

```
PORTAL_COMPANY_ID=<id of the Peak Media company>
PORTAL_CLIENT_URL=https://<client host>
PORTAL_INFLUENCER_URL=https://<influencer host>
PORTAL_FROM_EMAIL=Peak Media <no-reply@<peak domain>>   # optional; falls back to RESEND_FROM_EMAIL
RESEND_API_KEY=...                                       # without it, staff share the invite link by hand
```

The backend must bind loopback (`HOST=127.0.0.1`) and sit behind nginx with
`TRUST_PROXY` at its default, so the sign-in limit keys on the real visitor.

With `AUTHZ_ENGINE=openfga`, run `npm run ops -- fga:sync` after deploying so the new
`contacts:portal.manage` permission reaches OpenFGA. Migrations 083 and 084 apply on
startup.

## One-time setup

1. In TaskFlow as the platform super admin, create the Peak Media company and switch
   off the modules an agency does not use (inventory, manufacturing, purchasing, ...).
   Note its id for `PORTAL_COMPANY_ID`.
2. Set the company logo and name; the portal reads both. Use a logo drawn for a light
   background: the portal has no dark theme.
3. Point two DNS names at the server and issue certificates for them.
4. Build and start the portals:

```bash
cd portal && npm ci && npm run build
pm2 startOrReload deploy/portal/ecosystem.portal.config.cjs --update-env
```

5. Render `nginx-portal.conf.template` once per host (see its header; the games host
   uses port 9005), enable all three,
   and reload nginx.
6. Restart the backend so it reads the new environment.

## Giving someone access

In TaskFlow open Clients (or Influencers), choose Access, and invite the person. If
email is not configured the panel shows the link to send yourself. A re-invitation
also serves as a password reset.

## Checks after deploying

- `https://<client host>/login` shows the Peak Media name and logo.
- `https://<client host>/client` and `https://<influencer host>/influencer` return 404.
- `https://<host>/portal-api/client/me` is not reachable from the internet.
- `https://<games host>/games` lists published public games; `/login` there returns 404.
- Sign in as a client user on the client host, then open the influencer host: you are
  sent to sign in, not shown a dashboard.

## Local development

`cd portal && npm run dev:client` (port 9003) and `npm run dev:influencer` (port 9004)
against a backend started with `PORTAL_COMPANY_ID` set. Each dev server writes to its
own output directory (`.next-client`, `.next-influencer`) so they can run together.
On `localhost` the two hosts share one cookie jar, so signing in on one replaces the
session on the other; real deployments use two hostnames.
