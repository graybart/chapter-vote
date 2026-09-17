# ChapterVote

Ranked-choice (instant-runoff) voting for chapter elections. Next.js App
Router + Postgres (Drizzle ORM) + Auth.js. Deploys identically to Vercel or a
self-hosted Docker box — no Vercel-specific dependencies.

## How it works, night-of

1. An admin signs in at `/admin`, creates an election (the active chapter
   roster is copied in as the voter list), and adds contests + candidates.
2. Open the election, put the QR code on the projector.
3. Brothers scan it, pick their name from the drop-down, confirm their GTID,
   and rank candidates. One ballot per name per contest (DB-enforced).
   GTIDs live on the roster (paste the names column and GTID column from a
   spreadsheet), are compared digits-only on the server, and are never sent
   to voter devices. Members without a GTID on file vote unverified — the
   roster page flags them.
4. The live results page shows turnout, a voted/hasn't-voted roster check,
   and the round-by-round IRV tally, refreshing every 3 seconds.
5. Close the contest — the official tally (including every elimination and
   tie-break decision) is frozen for the record. Repeat per office.

Ballot secrecy: ballots are linked to members only to enforce one-vote; no UI
ever shows how anyone ranked.

## IRV rules

Majority = strictly more than half of continuing (non-exhausted) ballots.
Each round the lowest first-choice candidate is eliminated and those ballots
move to their next continuing choice. Explicit edge handling: exhausted
ballots leave the denominator; trailing groups that mathematically can't
catch up are batch-eliminated; last-place ties fall back to prior-round
counts, then a deterministic seeded draw (recorded in the audit log); an
exact tie among all remaining candidates is reported to the chair instead of
auto-resolved. See `src/lib/irv.ts` and `src/lib/irv.test.ts`.

## Quick start — run it on any computer (recommended)

The only requirement is [Docker Desktop](https://www.docker.com/products/docker-desktop/)
(macOS/Windows) or docker + compose (Linux). Then:

```bash
./start.sh
```

First run asks for your admin username/password (a plain username is fine —
no email required), generates secrets, and builds
the app (a few minutes). Every run after that starts in seconds. The script
auto-detects your machine's wifi IP so the QR codes work from phones on the
same network, and re-detects it each run (wifi IPs change between meetings).

Stop with `docker compose down` — the database lives in a Docker volume, so
rosters and past election results survive restarts and reboots. On Windows,
run the script from Git Bash or WSL.

**Start over from scratch:** `./reset.sh` wipes the database (rosters,
elections, results, admin accounts) after a typed confirmation, optionally
including `.env`. Handy after testing.

**Sharing on GitHub:** the repo is safe to push as-is — `.env` (secrets),
`node_modules`, and the database volume are never part of the repo. Your
peers just clone it and run `./start.sh`.

## Local development

```bash
cp .env.example .env          # fill in values
docker compose up -d db       # or any Postgres
npm install
npm run db:migrate            # apply SQL migrations in ./drizzle
npm run seed:admin            # create your admin account (env-driven)
npm run dev
```

Tests: `npm test` (IRV engine unit tests).

### Admin accounts & roles

Accounts are created/updated with the seed script (re-running it updates
password/role for an existing email):

- **admin** — full control; typically the officer running the election.
- **observer** — view-only: sees the dashboard, elections, and live results
  in real time, but every button is hidden and all writes are rejected
  server-side. For officers who should watch results without being able to
  touch anything.

```bash
SEED_ADMIN_EMAIL=c@chapter.org SEED_ADMIN_PASSWORD=... npm run seed:admin
SEED_ADMIN_EMAIL=a@chapter.org SEED_ADMIN_PASSWORD=... SEED_ADMIN_ROLE=observer npm run seed:admin
```

Schema changes: edit `src/db/schema.ts`, then `npm run db:generate` to emit a
new migration and `npm run db:migrate` to apply it.

## Deploy: Vercel

1. Push to GitHub and import the repo in Vercel.
2. Create a Postgres database (Neon / Vercel Postgres) and set env vars:
   `DATABASE_URL` (use the **pooled** connection string — the `-pooler`
   host on Neon), `AUTH_SECRET` (`openssl rand -base64 32`),
   `NEXT_PUBLIC_APP_URL` and `AUTH_URL` (your production URL), and
   `DB_POOL_MAX=2` (keeps per-instance connections low on serverless).
3. Run migrations once from your machine against the prod DB:
   `DATABASE_URL=... npm run db:migrate` (or add it to CI). Then seed an
   admin: `DATABASE_URL=... SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npm run seed:admin`.
4. Deploy. Subsequent pushes auto-deploy.

## Deploy: self-hosted (Docker / Proxmox)

```bash
cp .env.example .env   # set AUTH_SECRET, POSTGRES_PASSWORD, NEXT_PUBLIC_APP_URL
docker compose up -d --build
docker compose exec app node -e "1" && \
  DATABASE_URL=postgres://chaptervote:$POSTGRES_PASSWORD@localhost:5432/chaptervote \
  SEED_ADMIN_EMAIL=you@x.com SEED_ADMIN_PASSWORD=yourpass npm run seed:admin
```

The app container applies migrations automatically on start, then serves on
port 3000. (For seeding you can also run `npm run seed:admin` from any
machine that can reach the DB port, or `docker compose exec db psql` and
insert manually.)

### Reverse proxy

`AUTH_TRUST_HOST=true` is already set in docker-compose so Auth.js works
behind a proxy. Set `NEXT_PUBLIC_APP_URL`/`AUTH_URL` to your public URL.

**Caddy** (automatic HTTPS):

```
vote.example.com {
    reverse_proxy localhost:3000
}
```

**nginx**:

```nginx
server {
    listen 443 ssl;
    server_name vote.example.com;
    # ssl_certificate ...; ssl_certificate_key ...;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Adding voter security later

The schema already includes a `voter_tokens` table (per-member signed links /
one-time QR codes). Wire it up by issuing tokens on the election page and
requiring `?token=` in `/vote/[slug]` — no migration needed.

## Project layout

```
src/db/schema.ts        data model (see PLAN.md for the ER sketch)
src/lib/irv.ts          IRV tally engine (+ irv.test.ts)
src/lib/actions.ts      all admin server actions
src/auth.ts             Auth.js credentials config (admins table)
src/app/admin/…         dashboard, roster, election + live results pages
src/app/vote/[slug]/…   voter flow
src/app/api/…           polling endpoints + vote submission
drizzle/                generated SQL migrations
```
