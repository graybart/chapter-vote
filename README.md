# ChapterVote

Ranked-choice (instant-runoff) voting for chapter elections. Next.js App
Router + Postgres (Drizzle ORM) + Auth.js. Deploys identically to Vercel or a
self-hosted Docker box — no Vercel-specific dependencies.

## How it works, night-of

Think of it as a clicker system (Reply/TurningPoint) built in software:
members hold their phones, the chair drives, and exactly one vote runs at a
time.

1. An admin signs in at `/admin`, creates an election (the active chapter
   roster is copied in as the voter list), and adds contests + candidates.
2. Open the election. Put the projector view on the screen and leave it
   there — it follows along for the whole meeting without being touched.
3. Members scan the QR code once, pick their name, confirm their GTID, and
   stay logged in for the rest of the session. Their screen then just
   follows the chair: "Waiting for the next vote", or a live ballot.
4. Open a contest. Every phone switches to that ballot automatically and the
   projector shows the contest name with live turnout. Only one contest can
   be open at a time, so there's never any doubt what's being voted on.
5. Close the contest when the numbers stop moving. Optionally hit "Show
   result on projector" to announce the winner to the room.
6. Repeat for each office. Close the election at the end.

Ballot secrecy: ballots are linked to members only to enforce one-vote; no UI
ever shows how anyone ranked. Turnout counts are shown to admins and on the
projector, never on voters' own phones.

**Projector view.** Each election page has an "Open projector view" link.
Set it up once at the start of the meeting; it switches between three
screens on its own — live turnout for the open contest, the winner when you
publish one, and a waiting screen with the join QR code for latecomers. No
login, counts and published winners only, and its URL uses the election's
internal id rather than the voter slug so voters can't reach it from the
link in their QR code.

## Look and feel

The interface follows **Material Design 3** structure — tonal surface
containers, the M3 shape and type scales, state layers, pill buttons —
dressed in the Delta Chi palette from the Brand Standards guide:

| M3 role | Brand colour | Used for |
| --- | --- | --- |
| primary | navy `#11375c` | main actions, focus, the voter's selected choice |
| secondary | buff `#f1bd19` | accents, "pause", unsaved-change warnings |
| tertiary | teal `#00a98e` | "voted" / success |
| error | red `#ca3d31` | destructive actions only, so it keeps its weight |

Neutrals are warmed slightly towards the brand's cream rather than being
pure grey. Typography is Montserrat (the guide's own body webfont) with
Source Serif 4 standing in for Chronicle on headings, since Chronicle,
Gotham and Clavo are all commercial.

Interactive components are built on [Base UI](https://base-ui.com)
(`@base-ui/react`) — Dialog, Popover, Select, Tooltip, NumberField. That
replaced a native `<dialog>`, a `<details>` dropdown and raw `<select>`s
with properly accessible equivalents: focus traps, outside-click and
Escape handling, keyboard listbox navigation, and tooltips that don't
misfire when nested.

**Build-time note:** `next/font` downloads Montserrat and Source Serif 4
from Google Fonts *during the build*, then self-hosts them (so phones on
the meeting wifi never need internet). The build itself does need network
access. Docker caches the built image, so a meeting-night `./start.sh`
with no code changes won't refetch — but if you rebuild after an edit on
bad wifi, the build will fail on fonts. Build once on good wifi and you're
set.

## Ballot types

Each contest is independently either:

- **Ranked choice** (default) — voters rank as many candidates as they like
  and the instant-runoff rules below decide it.
- **Multiple choice** — voters pick one option; most votes wins. For simple
  motions and yes/no votes, without the overhead of ranking.

Set it when creating the contest, or switch it on the contest while it's
still in draft. Both types support multiple seats, abstentions, per-contest
exclusions, and the same no-randomness tie handling.

## IRV rules

**No randomness.** Counting is a pure function of the ballots — there is no
coin-flip, lot, or seeded draw anywhere. If a tie cannot be broken by the
rules below, the app declares no winner, names the tied candidates, and the
chapter holds a revote. Re-running a count on the same ballots always gives
the same answer.


Majority = strictly more than half of continuing (non-exhausted) ballots.
Each round the lowest first-choice candidate is eliminated and those ballots
move to their next continuing choice. Explicit edge handling: exhausted
ballots leave the denominator; trailing groups that mathematically can't
catch up are batch-eliminated; last-place ties fall back to prior-round
counts; if that still can't separate them the count stops and reports the
tie rather than guessing. An exact tie among all remaining candidates is
likewise reported, never auto-resolved. See `src/lib/irv.ts` and `src/lib/irv.test.ts`.

## Quick start — run it on any computer (recommended)

The only requirement is [Docker Desktop](https://www.docker.com/products/docker-desktop/)
(macOS/Windows) or docker + compose (Linux). Then:

```bash
./start.sh
```

First run asks for your admin username/password (a plain username is fine —
no email required), generates secrets, and builds
the app (a few minutes). Every run after that starts in seconds.

The script works out which address phones should connect to and bakes it
into the QR codes, re-checking each run since addresses change between
meetings. It uses whichever interface carries the default route, so wifi,
built-in Ethernet and USB-C/Thunderbolt adapters all work. If the machine
has more than one address it lists them all and says which it picked.

**Pinning the address.** When the laptop is on Ethernet but members are on
wifi, the auto-detected address may not be the one phones can reach. Pin it:

```bash
./start.sh --host 192.168.1.50
```

That's remembered in `.env` (as `HOST_IP`), so later runs don't need the
flag — delete that line to go back to auto-detection. To find the right
address, check which network your phone is on and pick the matching one
from the list the script prints.

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
