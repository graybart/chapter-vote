#!/usr/bin/env bash
# ChapterVote — wipe everything and start from a clean slate.
# Deletes the database (rosters, GTIDs, elections, ballots, results, admin
# accounts). Your code and Docker image are untouched.
set -euo pipefail
cd "$(dirname "$0")"

if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi

echo "This permanently deletes ALL ChapterVote data:"
echo "  rosters + GTIDs, elections, ballots, results, admin accounts."
read -rp "Type RESET to confirm: " answer
[[ "$answer" == "RESET" ]] || { echo "Cancelled — nothing was deleted."; exit 1; }

# `compose down` still interpolates the compose file, which requires
# AUTH_SECRET — supply a dummy so reset works even without a .env.
AUTH_SECRET="${AUTH_SECRET:-reset}" $COMPOSE down -v --remove-orphans

read -rp "Also delete .env (secrets + saved admin credentials)? [y/N] " env_answer
if [[ "$env_answer" =~ ^[Yy]$ ]]; then
  rm -f .env
  echo ".env deleted — next ./start.sh will run first-time setup."
fi

echo
echo "Clean slate ✔  Run ./start.sh to set up again."
