# Deploying TaskFlow to erp.alyarubi-group.com

This guide assumes a single VPS hosting both the backend (Express, port 4005)
and the frontend (Next.js, port 9002 by default), fronted by Nginx (or any
reverse proxy) terminating TLS on `https://erp.alyarubi-group.com`.

## 0. Before you start

You need:
- Node.js 22+ on the server
- `pm2` (or systemd) to keep the processes alive
- Nginx (or Caddy / Traefik / etc.) for TLS and reverse-proxy
- A working DNS A record for `erp.alyarubi-group.com` pointing at the VPS

## 1. Clone & build

```bash
git clone https://github.com/geekytamer/TaskFlow.git
cd TaskFlow
git checkout claude/strange-rubin-476722   # or whatever branch you merge to
```

### Backend
```bash
cd backend
npm ci
cp .env.production.example .env             # then edit .env — see Section 2
npm run build                                 # if there's a build step; otherwise tsx runs directly
```

### Frontend
```bash
cd ../frontend
npm ci
cp .env.production.example .env.production   # then edit if your API URL differs
npm run build
```

## 2. Configure the backend `.env`

Open `backend/.env` and confirm:

```env
NODE_ENV=production
PORT=4005

# Skip the demo seed; we use the bootstrap admin instead
SEED_ON_EMPTY=false
ALLOW_SEED_RESET=false

# SQLite DB location — MUST live OUTSIDE the git working tree so deploys
# (git pull) never overwrite or unlink it. The DB is no longer tracked in git.
TASKFLOW_DB_PATH=/var/lib/taskflow/taskflow.db

# Welcome-email sender. The domain must be verified in Resend.
# NOTE: a trailing ".com.com" typo here causes "domain is not verified".
RESEND_API_KEY=
RESEND_FROM_EMAIL=TaskFlow <no-reply@alyarubi-group.com>

# CORS — the public origin of the frontend
ALLOWED_ORIGINS=https://erp.alyarubi-group.com

# Proxy trust. The default, loopback, is right when nginx runs on this server:
# it lets the login rate limiter tell visitors apart. Never set it to true.
# TRUST_PROXY=loopback

# WhatsApp token encryption — DO NOT LOSE THIS. Generate with: openssl rand -hex 32
WHATSAPP_ENCRYPTION_KEY=

# Used to register the WhatsApp webhook callback
PUBLIC_BASE_URL=https://erp.alyarubi-group.com

# Bootstrap admin (only used when no Admin user exists yet)
ADMIN_EMAIL=admin@alyarubi-group.com
ADMIN_PASSWORD=
ADMIN_NAME=Administrator

# First company (only used when DB has no companies yet)
COMPANY_NAME=Al Yarubi Group
COMPANY_WEBSITE=https://alyarubi-group.com
```

**Important credentials to record before you boot:**
- `WHATSAPP_ENCRYPTION_KEY`: the value you generated for `backend/.env`
- `ADMIN_EMAIL`: `admin@alyarubi-group.com`
- `ADMIN_PASSWORD`: the value you chose for `backend/.env`

Keep the real values in a password manager. Never commit them to this repository.

> **Note on roles:** the bootstrap admin gets `role: 'Admin'` *and*
> `isSuperAdmin: true`. The first flag is your per-company admin role;
> the second is what unlocks the `/admin` system panel, impersonation,
> backups, and cross-tenant data. Any user you add later through the
> UI is a regular company-Admin by default. Only an existing
> super-admin can grant the super-admin flag (toggle in the user form).

Save these somewhere safe. The encryption key is unrecoverable; losing it
means every stored WhatsApp instance token becomes unreadable.

After the first successful login, **change the admin password** in
the UI and remove `ADMIN_PASSWORD` from `.env` (the bootstrap won't
recreate the admin since one now exists).

## 2b. Permissions engine

Access is decided in-process by the TaskFlow API itself; there is no separate
authorization service to run. One setting in `backend/.env` chooses who decides:

```env
PERMISSIONS_ENGINE=legacy    # legacy | shadow | v2
```

| Value | Meaning |
| --- | --- |
| `legacy` | The original company-role checks decide. This is the rollback target and the safe default. |
| `shadow` | Role checks still decide; the v2 answer is computed in-process beside them and every disagreement is written to `authz_divergence` (kept 14 days). |
| `v2` | Each route's declared permission, asked of the person's roles and reviewed add-ons, decides. |

### Rollout

1. Run `shadow` for a week. Review `GET /admin/authz/divergences` (super admin)
   or `npm run ops -- authz:compare` and `npm run ops -- authz:status`. Every
   disagreement is either a v2 bug to fix or an intended difference to accept.
2. When the week is quiet, set `PERMISSIONS_ENGINE=v2` and restart.
3. **Rollback is the setting.** Set it back to `legacy` (or `shadow`) and
   restart. There is no data migration to reverse: groups, grants and
   assignments live in SQLite under every engine.

An unset or unknown value is `legacy`; an invalid value stops the server at
startup. `AUTHZ_ENGINE` and the old `FGA_*` variables are ignored (a warning is
logged if `AUTHZ_ENGINE` is still set) and can be deleted from `.env`.

## 3. Fresh database

You said the DB can be erased. Easiest path:

```bash
cd backend
rm -f taskflow.db        # wipe whatever's there
```

When the backend starts:
1. Schema migrations run, creating empty tables.
2. `SEED_ON_EMPTY=false` skips the demo seed.
3. The bootstrap helper detects "no companies" and creates
   `Al Yarubi Group` from `COMPANY_NAME`.
4. The bootstrap helper detects "no admins" and creates the admin from
   `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

So after first boot you have: one clean company, one admin user, and
no other data. Perfect blank slate.

## 4. Run with PM2

```bash
# Backend
cd backend
pm2 start --name taskflow-api npm -- run start:prod
# (or: pm2 start --name taskflow-api npx -- tsx src/index.ts)

# Frontend
cd ../frontend
pm2 start --name taskflow-web npm -- run start
pm2 save
pm2 startup        # follow the printed instruction so pm2 survives reboot
```

## 5. Nginx config (TLS + reverse proxy)

Example `/etc/nginx/sites-available/erp.alyarubi-group.com`:

```nginx
server {
    listen 80;
    server_name erp.alyarubi-group.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name erp.alyarubi-group.com;

    ssl_certificate     /etc/letsencrypt/live/erp.alyarubi-group.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/erp.alyarubi-group.com/privkey.pem;

    # Frontend (Next.js)
    location / {
        proxy_pass http://127.0.0.1:9002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Backend API (Express)
    location /api/ {
        proxy_pass http://127.0.0.1:4005/;        # strip /api/ from upstream
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then:

```bash
sudo ln -s /etc/nginx/sites-available/erp.alyarubi-group.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d erp.alyarubi-group.com   # if you haven't already
```

## 6. First login

Open `https://erp.alyarubi-group.com`, log in with:
- Email: `admin@alyarubi-group.com`
- Password: the `ADMIN_PASSWORD` you set in `backend/.env`

Then:

1. **Change your admin password immediately** (Users → your row → Edit).
2. **Remove `ADMIN_PASSWORD` from `backend/.env`** and restart the API.
   The admin user persists; the env var is only there for first-boot
   bootstrap.
3. **Create real users** for your team.
4. (Optional) Set up WhatsApp in **Settings** → connect your Green API
   instance ID + token, then scan the QR code from your phone.
5. (Optional) Click **Configure webhook** in Settings to register the
   Green API webhook against `https://erp.alyarubi-group.com/api/whatsapp/webhook/...`.

## 7. Backup

`backend/taskflow.db` is the application's SQLite file and the only datastore:
users, groups, grants and assignments all live in it.

Back up the SQLite file nightly.

The database runs in **WAL mode**, so recent commits may still be sitting in a
`taskflow.db-wal` sidecar file. Copying `taskflow.db` on its own can therefore
miss them. Use SQLite's own backup command, which is safe against a live
writer and produces a single consistent file:

```bash
crontab -e
# Daily 02:00 backup — WAL-safe, unlike a plain cp
0 2 * * * sqlite3 /path/to/TaskFlow/backend/taskflow.db ".backup '/var/backups/taskflow-$(date +\%Y\%m\%d).db'"
```

If you must copy files instead, copy `taskflow.db`, `taskflow.db-wal` and
`taskflow.db-shm` together, with the app stopped.

Keep at least 7 daily and 4 weekly copies. SQLite is small; storage is cheap.

## 8. Updating later

```bash
cd /path/to/TaskFlow
git pull
cd backend  && npm ci && npm run build && pm2 restart taskflow-api
cd ../frontend && npm ci && npm run build && pm2 restart taskflow-web
```

Migrations run automatically on backend startup. New schema additions
are applied; old data is preserved.

### One-time migration off the in-repo DB (if upgrading an old deploy)

Older deploys kept the database at `backend/taskflow.db`, which was tracked
in git. That is now removed from the repo, so the **first** `git pull` after
this change will try to delete your live DB. Relocate it first:

```bash
pm2 stop taskflow-api                       # release the file handle (flush WAL)
mkdir -p /var/lib/taskflow
# copy the DB plus any WAL/SHM sidecars to the new home
cp backend/taskflow.db*      /var/lib/taskflow/ 2>/dev/null || true
cp /var/lib/taskflow/taskflow.db /var/backups/taskflow-$(date +%F).db   # extra backup

git checkout -- backend/taskflow.db         # make the working tree clean so pull won't conflict
git pull                                    # now safely deletes the (untracked-going-forward) file

# set TASKFLOW_DB_PATH=/var/lib/taskflow/taskflow.db in backend/.env  (see Section 2)
cd backend && npm ci && npm run build && pm2 restart taskflow-api
```

After this, the DB lives outside the repo and future `git pull`s never touch it.

## PDF rendering (invoices, delivery notes, vendor bills)

PDFs are produced by rendering the app's own print page in headless Chrome, so
the server needs a real browser. Puppeteer downloads its own matching build —
do not point it at a distro package, and on Ubuntu do not use the snap
`chromium`, which cannot run in this container.

```bash
apt-get install -y unzip                       # without this the download silently extracts to nothing
cd backend && npx puppeteer browsers install chrome

# Shared libraries headless Chrome needs on a bare Ubuntu 24.04 server:
apt-get install -y libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 \
  libasound2t64 libgbm1 libcairo2 libpango-1.0-0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libatspi2.0-0t64 libnss3 libnspr4 libxkbcommon0 \
  libdrm2 libxshmfence1 fonts-liberation
```

Leave `PUPPETEER_EXECUTABLE_PATH` **unset** so puppeteer resolves the version it
was built against. `APP_PUBLIC_URL` must point at the running frontend, because
that is the URL the headless browser fetches.

Verify with the browser itself rather than trusting the install:

```bash
/root/.cache/puppeteer/chrome/*/chrome-linux64/chrome --version
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Frontend loads but API calls 404 | Nginx `/api/` location missing or pointing at wrong port |
| CORS errors in browser | `ALLOWED_ORIGINS` doesn't include the exact frontend origin including scheme |
| WhatsApp "Configure webhook" fails | `PUBLIC_BASE_URL` is wrong or the domain isn't yet publicly reachable |
| Admin login fails after fresh deploy | `ADMIN_PASSWORD` was changed AFTER the user got created — env changes don't update an existing admin, you must reset via the API or wipe the DB and re-bootstrap |
| Migrations look stuck | Stop the process, back up `taskflow.db`, restart. Migrations are idempotent. |
| `SQLITE_READONLY_DBMOVED` / login fails after deploy | The DB file was swapped out from under the running process (git pull replaced it). Relocate the DB to `TASKFLOW_DB_PATH` outside the repo (see Section 8) and restart the API. |
| PDF download returns "PDF rendering is unavailable" | No usable Chrome on the server. Most often `npx puppeteer browsers install chrome` was run without `unzip` present, which leaves an **empty version directory** that looks installed. Check the size of `~/.cache/puppeteer` — a real install is ~380 MB, a failed one is 8 KB. See "PDF rendering" above. |
| Chrome installed but exits with `error while loading shared libraries` | The headless system libraries are missing; install the list in "PDF rendering" above. |
| Welcome emails fail: "domain is not verified" | `RESEND_FROM_EMAIL` has a malformed domain (e.g. `...com.com`) or the domain isn't verified in Resend. Fix the env value and verify the domain. |
