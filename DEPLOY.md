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

# CORS — the public origin of the frontend
ALLOWED_ORIGINS=https://erp.alyarubi-group.com

# WhatsApp token encryption — DO NOT LOSE THIS
WHATSAPP_ENCRYPTION_KEY=4700c4d5a80fef34b1f12f99edc6d09d1ae1fa2f436da8d08bcdd73e6302653e

# Used to register the WhatsApp webhook callback
PUBLIC_BASE_URL=https://erp.alyarubi-group.com

# Bootstrap admin (only used when no Admin user exists yet)
ADMIN_EMAIL=admin@alyarubi-group.com
ADMIN_PASSWORD=Admin@IMiC0ITOBxQ
ADMIN_NAME=Administrator

# First company (only used when DB has no companies yet)
COMPANY_NAME=Al Yarubi Group
COMPANY_WEBSITE=https://alyarubi-group.com
```

**Important credentials to record before you boot:**
- `WHATSAPP_ENCRYPTION_KEY`: `4700c4d5a80fef34b1f12f99edc6d09d1ae1fa2f436da8d08bcdd73e6302653e`
- `ADMIN_EMAIL`: `admin@alyarubi-group.com`
- `ADMIN_PASSWORD`: `Admin@IMiC0ITOBxQ`

Save these somewhere safe. The encryption key is unrecoverable; losing it
means every stored WhatsApp instance token becomes unreadable.

After the first successful login, **change the admin password** in
the UI and remove `ADMIN_PASSWORD` from `.env` (the bootstrap won't
recreate the admin since one now exists).

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
- Password: `Admin@IMiC0ITOBxQ`

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

The whole app is one SQLite file: `backend/taskflow.db`. Back it up nightly.

```bash
crontab -e
# Daily 02:00 backup
0 2 * * * cp /path/to/TaskFlow/backend/taskflow.db /var/backups/taskflow-$(date +\%Y\%m\%d).db
```

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

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Frontend loads but API calls 404 | Nginx `/api/` location missing or pointing at wrong port |
| CORS errors in browser | `ALLOWED_ORIGINS` doesn't include the exact frontend origin including scheme |
| WhatsApp "Configure webhook" fails | `PUBLIC_BASE_URL` is wrong or the domain isn't yet publicly reachable |
| Admin login fails after fresh deploy | `ADMIN_PASSWORD` was changed AFTER the user got created — env changes don't update an existing admin, you must reset via the API or wipe the DB and re-bootstrap |
| Migrations look stuck | Stop the process, back up `taskflow.db`, restart. Migrations are idempotent. |
