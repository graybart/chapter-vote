#!/usr/bin/env bash
# ChapterVote — one-command start.
#
#   ./start.sh
#
# First run: asks for your admin account, generates secrets, builds the app.
# Every run: detects your machine's wifi/LAN IP (so QR codes work from
# phones), starts the app + database in Docker, and prints the URLs.
# Requires only Docker Desktop (macOS/Windows) or docker + compose (Linux).
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\nError: %s\n' "$*" >&2; exit 1; }

# Read a raw value out of .env without shell expansion.
envget() { grep -m1 "^$1=" .env 2>/dev/null | cut -d= -f2- || true; }

# --- Prerequisites ----------------------------------------------------------
command -v docker >/dev/null 2>&1 ||
  die "Docker is not installed. Install Docker Desktop (https://www.docker.com/products/docker-desktop/) and re-run."
docker info >/dev/null 2>&1 ||
  die "Docker isn't running. Open Docker Desktop, wait for the whale icon, then re-run."
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  die "Docker Compose not found (comes with Docker Desktop)."
fi

# --- Detect this machine's LAN IP (what phones on the wifi connect to) ------
detect_ip() {
  local ip=""
  if [[ "$(uname)" == "Darwin" ]]; then
    for iface in en0 en1 en2 en3; do
      ip=$(ipconfig getifaddr "$iface" 2>/dev/null) && [[ -n "$ip" ]] && break
    done
  else
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  printf '%s' "$ip"
}
LAN_IP=$(detect_ip)
if [[ -z "$LAN_IP" ]]; then
  echo "Couldn't detect a LAN IP — falling back to localhost."
  echo "(QR codes will only work on this machine. Connect to wifi and re-run to fix.)"
  LAN_IP=localhost
fi
APP_URL="http://${LAN_IP}:3000"

# --- First-time setup: create .env ------------------------------------------
if [[ ! -f .env ]]; then
  say "First-time setup — create your admin (election runner) account"
  read -rp "  Admin username (or email): " ADMIN_EMAIL
  [[ -n "$ADMIN_EMAIL" ]] || die "A username is required."
  while :; do
    read -rsp "  Admin password (min 8 chars): " ADMIN_PASSWORD; echo
    [[ ${#ADMIN_PASSWORD} -ge 8 ]] && break
    echo "  Too short, try again."
  done
  read -rp "  Display name [Chapter Admin]: " ADMIN_NAME
  ADMIN_NAME=${ADMIN_NAME:-Chapter Admin}

  {
    echo "AUTH_SECRET=$(openssl rand -base64 32)"
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)"
    echo "NEXT_PUBLIC_APP_URL=${APP_URL}"
    echo "SEED_ADMIN_EMAIL=${ADMIN_EMAIL}"
    echo "SEED_ADMIN_PASSWORD=${ADMIN_PASSWORD}"
    echo "SEED_ADMIN_NAME=${ADMIN_NAME}"
    echo "SEED_ADMIN_ROLE=admin"
  } > .env
  echo "  .env created (secrets generated)."
fi

# --- Keep the app URL current (wifi IPs change between meetings) ------------
if [[ "$(envget NEXT_PUBLIC_APP_URL)" != "$APP_URL" ]]; then
  grep -v '^NEXT_PUBLIC_APP_URL=' .env > .env.tmp || true
  echo "NEXT_PUBLIC_APP_URL=${APP_URL}" >> .env.tmp
  mv .env.tmp .env
  echo "App URL set to ${APP_URL}"
fi

# --- Build & start -----------------------------------------------------------
say "Building and starting ChapterVote (first build takes a few minutes)…"
$COMPOSE up -d --build

# --- Make sure the DB password matches .env ----------------------------------
# Postgres only reads POSTGRES_PASSWORD when its data volume is first
# created. If the volume predates this .env (e.g. from earlier testing),
# the app can't connect — so align it on every start. This connects over
# the container's local socket, which doesn't need the old password.
PG_PW="$(envget POSTGRES_PASSWORD)"
if [[ -n "$PG_PW" ]]; then
  for _ in $(seq 1 30); do
    if $COMPOSE exec -T db pg_isready -U chaptervote >/dev/null 2>&1; then break; fi
    sleep 2
  done
  $COMPOSE exec -T db psql -U chaptervote -d chaptervote -q \
    -c "ALTER USER chaptervote WITH PASSWORD '${PG_PW}';" >/dev/null 2>&1 ||
    echo "Warning: couldn't sync the database password (continuing)."
  $COMPOSE restart app >/dev/null 2>&1 || true
fi

say "Waiting for the app to come up…"
ok=""
for _ in $(seq 1 90); do
  if curl -sf -o /dev/null http://localhost:3000; then ok=1; break; fi
  sleep 2
done
[[ -n "$ok" ]] || die "App didn't start. Check logs with: $COMPOSE logs app"

# --- Ensure the admin account exists (re-applies .env values) ---------------
$COMPOSE exec -T \
  -e SEED_ADMIN_EMAIL="$(envget SEED_ADMIN_EMAIL)" \
  -e SEED_ADMIN_PASSWORD="$(envget SEED_ADMIN_PASSWORD)" \
  -e SEED_ADMIN_NAME="$(envget SEED_ADMIN_NAME)" \
  -e SEED_ADMIN_ROLE="$(envget SEED_ADMIN_ROLE)" \
  app node scripts/seed-admin.mjs

# --- Done --------------------------------------------------------------------
say "ChapterVote is running ✔"
cat <<EOF
  Admin dashboard:   ${APP_URL}/admin
  On this machine:   http://localhost:3000/admin
  Voters on the same wifi use the QR code shown on each election page.

  Stop:              $COMPOSE down     (all data is kept)
  Start again:       ./start.sh
  Logs:              $COMPOSE logs -f app
  Add another admin or a view-only (observer) account:
    edit the SEED_ADMIN_* lines in .env and re-run ./start.sh

  macOS note: if a firewall popup asks to allow incoming connections for
  Docker, click Allow — otherwise phones can't reach the app.
EOF
