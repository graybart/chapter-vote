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

# --- Work out the address phones should connect to --------------------------
#
# Pin it explicitly when the guess is wrong (e.g. the laptop is on Ethernet
# and the members are on wifi, so there are two valid addresses):
#
#   ./start.sh --host 192.168.1.50
#   HOST_IP=192.168.1.50 ./start.sh
#
# Order of preference: --host flag, HOST_IP env var, HOST_IP saved in .env.
HOST_IP="${HOST_IP:-$(envget HOST_IP)}"
HOST_PINNED_BY_FLAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST_IP="${2:-}"; HOST_PINNED_BY_FLAG=1; shift 2 ;;
    --host=*) HOST_IP="${1#*=}"; HOST_PINNED_BY_FLAG=1; shift ;;
    -h|--help)
      echo "Usage: ./start.sh [--host <ip-or-hostname>]"; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
done

# Every usable IPv4 address on this machine, in preference order: whichever
# interface carries the default route first, then everything else. Covers
# wifi, built-in Ethernet and USB-C/Thunderbolt adapters alike — the old
# version only looked at en0–en3 and missed Ethernet on many Macs.
list_ips() {
  local primary="" iface
  if [[ "$(uname)" == "Darwin" ]]; then
    iface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
    [[ -n "$iface" ]] && primary=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
    [[ -n "$primary" ]] && printf '%s\n' "$primary"
    for i in $(ifconfig -l 2>/dev/null); do
      case "$i" in lo*|utun*|awdl*|llw*|gif*|stf*|ap1) continue ;; esac
      local a
      a=$(ipconfig getifaddr "$i" 2>/dev/null || true)
      [[ -n "$a" && "$a" != "$primary" ]] && printf '%s\n' "$a"
    done
  else
    iface=$(ip route show default 2>/dev/null | awk '/default/{print $5; exit}')
    if [[ -n "$iface" ]]; then
      primary=$(ip -4 -o addr show "$iface" 2>/dev/null |
        awk '{print $4}' | cut -d/ -f1 | head -1)
      [[ -n "$primary" ]] && printf '%s\n' "$primary"
    fi
    ip -4 -o addr show scope global 2>/dev/null |
      awk '{print $4}' | cut -d/ -f1 |
      while read -r a; do [[ "$a" != "$primary" ]] && printf '%s\n' "$a"; done
    # Last resort if iproute2 isn't available.
    if [[ -z "$primary" ]] && command -v hostname >/dev/null 2>&1; then
      hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' || true
    fi
  fi
}

# Plain read loop rather than `mapfile` — macOS still ships bash 3.2.
IP_LIST=()
while IFS= read -r line; do
  [[ -n "$line" ]] && IP_LIST+=("$line")
done < <(list_ips)

if [[ -n "$HOST_IP" ]]; then
  LAN_IP="$HOST_IP"
  echo "Using the address you specified: $LAN_IP"
  echo "(Remove the HOST_IP line from .env to go back to auto-detection.)"
elif [[ ${#IP_LIST[@]} -gt 0 ]]; then
  LAN_IP="${IP_LIST[0]}"
  if [[ ${#IP_LIST[@]} -gt 1 ]]; then
    echo "This machine has more than one network address:"
    for a in "${IP_LIST[@]}"; do
      if [[ "$a" == "$LAN_IP" ]]; then
        echo "  $a   <- using this one (carries the default route)"
      else
        echo "  $a"
      fi
    done
    echo "If phones can't reach it, re-run with: ./start.sh --host <the other address>"
  fi
else
  echo "Couldn't detect a network address — falling back to localhost."
  echo "(QR codes will only work on this machine. Connect to a network, or"
  echo " re-run with: ./start.sh --host <your-ip>)"
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

# Remember a host pinned with --host so later runs don't need the flag.
if [[ -n "$HOST_PINNED_BY_FLAG" ]]; then
  grep -v '^HOST_IP=' .env > .env.tmp 2>/dev/null || true
  echo "HOST_IP=${HOST_IP}" >> .env.tmp
  mv .env.tmp .env
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
