#!/usr/bin/env bash
# Deploys the TaskFlow STAGING site onto the production VPS, beside production.
#
#   sudo deploy/staging/deploy-staging.sh [--from-production] [--refresh-data]
#
#   --from-production  Seed staging with a consistent snapshot of the live
#                      database (first run only, unless --refresh-data).
#                      Without it, staging runs on demo data.
#   --refresh-data     Replace staging's data and permissions with a fresh
#                      production snapshot. Requires --from-production.
#
# Idempotent: re-run it for every update. It never touches production's
# checkout, database, pm2 processes or nginx site, and it will not reload nginx
# unless `nginx -t` passes — this server also hosts other people's domains.
#
# First run needs a DNS A record for STAGING_DOMAIN pointing at this server.
set -Eeuo pipefail

STAGING_DOMAIN="${STAGING_DOMAIN:-staging.erp.alyarubi-group.com}"
BRANCH="${BRANCH:-feature/openfga-permissions}"
REPO_URL="${REPO_URL:-https://github.com/geekytamer/TaskFlow.git}"
PROD_DB="${PROD_DB:-/var/lib/taskflow/taskflow.db}"
PROD_APP_DIR=/var/www/TaskFlow
PROD_PM2_API=taskflow-backend
PROD_URL=https://erp.alyarubi-group.com/

APP_DIR=/var/www/TaskFlow-staging
DATA_DIR=/var/lib/taskflow-staging
ENV_FILE="$APP_DIR/backend/.env"
TEMPLATES="$APP_DIR/deploy/staging"
ECOSYSTEM="$TEMPLATES/ecosystem.config.cjs"
FGA_VERSION=1.18.3
FGA_BIN="/opt/openfga/$FGA_VERSION/openfga"
# Must match ecosystem.config.cjs.
API_PORT=4105
WEB_PORT=3105
FGA_HTTP_PORT=8180
FGA_GRPC_PORT=8181
SITE="/etc/nginx/sites-available/$STAGING_DOMAIN"
HTPASSWD=/etc/nginx/taskflow-staging.htpasswd
GATE_FILE="$DATA_DIR/gate-secret"

FROM_PRODUCTION=0
REFRESH_DATA=0
for arg in "$@"; do
  case "$arg" in
    --from-production) FROM_PRODUCTION=1 ;;
    --refresh-data) REFRESH_DATA=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "failed at line $LINENO: $BASH_COMMAND"' ERR
rand_hex() { openssl rand -hex 32; }

render() {
  sed -e "s|__STAGING_DOMAIN__|$STAGING_DOMAIN|g" \
      -e "s|__API_PORT__|$API_PORT|g" \
      -e "s|__WEB_PORT__|$WEB_PORT|g" \
      -e "s|__FGA_HTTP_PORT__|$FGA_HTTP_PORT|g" \
      "$1"
}

env_value() { sed -n "s/^$1=//p" "$2" 2>/dev/null | tail -1; }

wait_http() { # url [header]
  for _ in $(seq 1 90); do
    if curl -fs -o /dev/null ${2:+-H "$2"} "$1"; then return 0; fi
    sleep 1
  done
  die "no healthy answer from $1 after 90s"
}

# A refused or failed connection prints 000 and exits non-zero; without
# `|| true` that exit trips the ERR trap and prints a misleading error.
http_code() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$@" || true; }

staging_pids() {
  pm2 jlist 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { for (const p of JSON.parse(s)) if (p.name.startsWith("taskflow-staging-") && p.pid) console.log(p.pid); }
      catch { /* no pm2 processes yet */ }
    });'
}

# ─────────────────────────────────────────────────────────────────────
step "Preflight"
[ "$(id -u)" -eq 0 ] || die "run as root"
[ "$(uname -m)" = x86_64 ] || die "expected x86_64, got $(uname -m); pick the matching OpenFGA release"
for cmd in git node npm pm2 nginx certbot openssl curl sqlite3 ss tar sha256sum; do
  command -v "$cmd" >/dev/null || die "missing required command: $cmd"
done
[ "$REFRESH_DATA" -eq 0 ] || [ "$FROM_PRODUCTION" -eq 1 ] || die "--refresh-data requires --from-production"
# Belt and braces: staging paths must never resolve to production's.
[ "$APP_DIR" != "$PROD_APP_DIR" ] && [ "$DATA_DIR" != "$(dirname "$PROD_DB")" ] \
  || die "staging paths collide with production"

resolved=$(getent ahostsv4 "$STAGING_DOMAIN" | awk 'NR==1{print $1}' || true)
[ -n "$resolved" ] || die "$STAGING_DOMAIN does not resolve yet. Add a DNS A record pointing at this server."
grep -qx "$resolved" <<< "$(hostname -I | tr ' ' '\n')" \
  || die "$STAGING_DOMAIN resolves to $resolved, which is not an address of this server ($(hostname -I))"

mine=$(staging_pids || true)
for port in $API_PORT $WEB_PORT $FGA_HTTP_PORT $FGA_GRPC_PORT; do
  holder=$(ss -ltnpH "sport = :$port" | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true)
  if [ -n "$holder" ] && ! printf '%s\n' "$mine" | grep -qx "$holder"; then
    die "port $port is held by pid $holder, which is not a staging process"
  fi
done

prod_before=$(http_code "$PROD_URL")
echo "production answers $prod_before before deploy"

# ─────────────────────────────────────────────────────────────────────
step "Checkout $BRANCH"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  [ -z "$(git -C "$APP_DIR" status --porcelain --untracked-files=no)" ] \
    || die "$APP_DIR has local modifications; refusing to overwrite them"
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" merge --ff-only "origin/$BRANCH" \
    || die "origin/$BRANCH cannot fast-forward the staging checkout"
fi
git -C "$APP_DIR" log --oneline -1

# ─────────────────────────────────────────────────────────────────────
step "OpenFGA $FGA_VERSION"
if [ ! -x "$FGA_BIN" ]; then
  tmp=$(mktemp -d)
  base="https://github.com/openfga/openfga/releases/download/v$FGA_VERSION"
  tarball="openfga_${FGA_VERSION}_linux_amd64.tar.gz"
  curl -fsSL -o "$tmp/$tarball" "$base/$tarball"
  curl -fsSL -o "$tmp/checksums.txt" "$base/checksums.txt"
  (cd "$tmp" && grep " $tarball\$" checksums.txt | sha256sum -c -) \
    || die "OpenFGA download failed its checksum; not installing it"
  install -d "$(dirname "$FGA_BIN")"
  tar -xzf "$tmp/$tarball" -C "$(dirname "$FGA_BIN")" openfga
  rm -rf "$tmp"
fi
"$FGA_BIN" version 2>&1 | head -1 || true

# ─────────────────────────────────────────────────────────────────────
step "Configuration"
install -d -m 700 "$DATA_DIR"
if [ ! -f "$ENV_FILE" ]; then
  seed_demo=true
  [ "$FROM_PRODUCTION" -eq 1 ] && seed_demo=false
  render "$TEMPLATES/backend.env.template" \
    | sed -e "s|__SEED_ON_EMPTY__|$seed_demo|" \
          -e "s|__GEN_WHATSAPP_KEY__|$(rand_hex)|" \
          -e "s|__GEN_FGA_TOKEN__|$(rand_hex)|" \
    > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "created $ENV_FILE with fresh secrets"
fi
# These three guards are what keep staging from reaching real people.
[ -z "$(env_value RESEND_API_KEY "$ENV_FILE")" ] || die "RESEND_API_KEY must stay empty on staging"
staging_wa=$(env_value WHATSAPP_ENCRYPTION_KEY "$ENV_FILE")
[ -n "$staging_wa" ] || die "WHATSAPP_ENCRYPTION_KEY is empty on staging"
[ "$staging_wa" != "$(env_value WHATSAPP_ENCRYPTION_KEY "$PROD_APP_DIR/backend/.env")" ] \
  || die "staging's WHATSAPP_ENCRYPTION_KEY equals production's; staging could decrypt real tokens"
[ "$(env_value AUTHZ_ENGINE "$ENV_FILE")" = openfga ] || die "staging must run AUTHZ_ENGINE=openfga"
FGA_TOKEN=$(env_value FGA_API_TOKEN "$ENV_FILE")

# ─────────────────────────────────────────────────────────────────────
DB="$DATA_DIR/taskflow.db"
if [ "$FROM_PRODUCTION" -eq 1 ] && { [ ! -f "$DB" ] || [ "$REFRESH_DATA" -eq 1 ]; }; then
  step "Snapshot production data"
  prod_pid=$(pm2 pid "$PROD_PM2_API" 2>/dev/null || true)
  [ -n "$prod_pid" ] && [ "$prod_pid" != 0 ] || die "cannot find the running $PROD_PM2_API process"
  # Copy the file production actually has open, not merely the documented path.
  prod_fds=$(readlink "/proc/$prod_pid/fd/"* 2>/dev/null || true)
  grep -qx "$PROD_DB" <<< "$prod_fds" \
    || die "$PROD_PM2_API does not hold $PROD_DB open. It holds: $(grep -E '\.db$' <<< "$prod_fds" | sort -u | tr '\n' ' ' || true). Set PROD_DB."
  pm2 stop taskflow-staging-api taskflow-staging-fga >/dev/null 2>&1 || true
  rm -f "$DB" "$DB-wal" "$DB-shm" "$DATA_DIR/openfga.db" "$DATA_DIR/openfga.db-wal" "$DATA_DIR/openfga.db-shm"
  sqlite3 "$PROD_DB" ".backup '$DB'"   # consistent even against the live writer
  chmod 600 "$DB"
  # New data means the old tuple store is wrong: rebuild it from scratch.
  sed -i -e 's/^FGA_STORE_ID=.*/FGA_STORE_ID=/' -e 's/^FGA_MODEL_ID=.*/FGA_MODEL_ID=/' "$ENV_FILE"
  echo "copied $(du -h "$DB" | cut -f1) from $PROD_DB"
fi

# ─────────────────────────────────────────────────────────────────────
step "Build backend"
cd "$APP_DIR/backend"
npm ci
npm run build
npm run --silent ops -- migrate

step "Build frontend"
cd "$APP_DIR/frontend"
render "$TEMPLATES/frontend.env.template" > .env.production
npm ci
NODE_OPTIONS="--localstorage-file=$DATA_DIR/node-localstorage" npx next build

# ─────────────────────────────────────────────────────────────────────
step "Authorization store"
"$FGA_BIN" migrate --datastore-engine sqlite --datastore-uri "file:$DATA_DIR/openfga.db"
pm2 startOrReload "$ECOSYSTEM" --only taskflow-staging-fga --update-env
wait_http "http://127.0.0.1:$FGA_HTTP_PORT/stores" "Authorization: Bearer $FGA_TOKEN"
cd "$APP_DIR/backend"
if [ -z "$(env_value FGA_STORE_ID "$ENV_FILE")" ]; then
  ids=$(npm run --silent ops -- fga:bootstrap)
  store_id=$(printf '%s\n' "$ids" | sed -n 's/^FGA_STORE_ID=//p')
  model_id=$(printf '%s\n' "$ids" | sed -n 's/^FGA_MODEL_ID=//p')
  [ -n "$store_id" ] && [ -n "$model_id" ] || die "fga:bootstrap did not report ids: $ids"
  sed -i -e "s|^FGA_STORE_ID=.*|FGA_STORE_ID=$store_id|" \
         -e "s|^FGA_MODEL_ID=.*|FGA_MODEL_ID=$model_id|" "$ENV_FILE"
  echo "store $store_id, model $model_id"
fi

# ─────────────────────────────────────────────────────────────────────
step "Start staging processes"
pm2 startOrReload "$ECOSYSTEM" --update-env
pm2 save
wait_http "http://127.0.0.1:$API_PORT/health"
wait_http "http://127.0.0.1:$WEB_PORT/login"

# ─────────────────────────────────────────────────────────────────────
step "Publish permissions to OpenFGA"
# After the API's first boot, never before. The ops commands do not seed, so
# on a demo-data deploy the database stays empty until the app starts; a sync
# run earlier publishes nothing and OpenFGA then denies everyone. Rehearsed:
# 0 tuples published before first boot, 1,400 after.
cd "$APP_DIR/backend"
npm run --silent ops -- authz:repair
npm run --silent ops -- fga:sync

# ─────────────────────────────────────────────────────────────────────
step "nginx and TLS for $STAGING_DOMAIN"
NEW_BASIC_PASSWORD=""
if [ ! -f "$HTPASSWD" ]; then
  NEW_BASIC_PASSWORD=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-20)
  printf 'staging:%s\n' "$(openssl passwd -apr1 "$NEW_BASIC_PASSWORD")" > "$HTPASSWD"
  chown root:www-data "$HTPASSWD"
  chmod 640 "$HTPASSWD"
  # Shown now, not only in the final summary: if a later step fails, the
  # password is otherwise lost and only its hash remains on disk.
  echo "Site password (shown once, store it now):  staging / $NEW_BASIC_PASSWORD"
fi
[ -f "$GATE_FILE" ] || { rand_hex > "$GATE_FILE"; chmod 600 "$GATE_FILE"; }

reload_nginx_or_restore() { # site-file-to-install, backup-or-empty
  install -m 644 "$1" "$SITE"
  ln -sfn "$SITE" "/etc/nginx/sites-enabled/$STAGING_DOMAIN"
  if ! nginx -t; then
    if [ -n "$2" ]; then install -m 644 "$2" "$SITE"; else rm -f "$SITE" "/etc/nginx/sites-enabled/$STAGING_DOMAIN"; fi
    die "nginx rejected the staging site; restored the previous state and did not reload"
  fi
  systemctl reload nginx
}

backup=""
if [ -f "$SITE" ]; then backup=$(mktemp); cp "$SITE" "$backup"; fi

if [ ! -f "/etc/letsencrypt/live/$STAGING_DOMAIN/fullchain.pem" ]; then
  tmp=$(mktemp); render "$TEMPLATES/nginx-http.conf.template" > "$tmp"
  reload_nginx_or_restore "$tmp" "$backup"
  certbot certonly --nginx -d "$STAGING_DOMAIN" --non-interactive \
    || die "certbot could not issue a certificate for $STAGING_DOMAIN"
fi
tmp=$(mktemp)
render "$TEMPLATES/nginx.conf.template" | sed "s|__GATE_SECRET__|$(cat "$GATE_FILE")|g" > "$tmp"
reload_nginx_or_restore "$tmp" "$backup"

# ─────────────────────────────────────────────────────────────────────
step "Verify"
# `systemctl reload nginx` returns before the new workers take over, so the
# first requests can still reach the old configuration, which has no staging
# site. Wait for the new site to answer before judging it.
for _ in $(seq 1 30); do
  [ "$(http_code "https://$STAGING_DOMAIN/")" = 401 ] && break
  sleep 1
done
fails=0
check() { # label expected actual
  if [ "$2" = "$3" ]; then printf '  ok    %-52s %s\n' "$1" "$3"
  else printf '  FAIL  %-52s expected %s, got %s\n' "$1" "$2" "$3"; fails=$((fails + 1)); fi
}
gate="Cookie: taskflow_staging_gate=$(cat "$GATE_FILE")"
check "site demands a password"                  401 "$(http_code "https://$STAGING_DOMAIN/")"
check "API refuses requests without the gate"    401 "$(http_code "https://$STAGING_DOMAIN/api/health")"
check "API answers behind the gate"              200 "$(http_code -H "$gate" "https://$STAGING_DOMAIN/api/health")"
check "WhatsApp webhooks are blocked"            404 "$(http_code -X POST -H "$gate" "https://$STAGING_DOMAIN/api/whatsapp/webhook/x")"
check "production unaffected"                    "$prod_before" "$(http_code "$PROD_URL")"
exposed=$(ss -ltnH | awk '{print $4}' | grep -E ":($API_PORT|$WEB_PORT|$FGA_HTTP_PORT|$FGA_GRPC_PORT)\$" | grep -v '^127\.0\.0\.1:' || true)
check "staging ports bound to loopback only"     "" "$exposed"
[ "$fails" -eq 0 ] || die "$fails verification check(s) failed"

step "Staging is live: https://$STAGING_DOMAIN"
if [ -n "$NEW_BASIC_PASSWORD" ]; then
  echo "  Site password (shown once, store it now):  staging / $NEW_BASIC_PASSWORD"
fi
# Report the data actually in use, not the flag passed to this run: a redeploy
# without --from-production leaves an earlier production snapshot in place, and
# telling people to sign in with demo credentials would then be wrong.
if [ "$(env_value SEED_ON_EMPTY "$ENV_FILE")" = false ]; then
  echo "  Data: snapshot of production. Sign in with production accounts."
else
  echo "  Data: demo. Sign in as admin@taskflow.com / password."
fi
echo "  Email: disabled.   WhatsApp: cannot decrypt production tokens.   Authorization: OpenFGA."
