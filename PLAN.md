# ChapterVote — Architecture & Data Model (for confirmation)

Ranked-choice voting app for chapter elections. Next.js App Router, portable
between Vercel and self-hosted Docker (Proxmox/Linux). No Vercel-specific
dependencies anywhere: `output: 'standalone'`, `postgres` (postgres.js)
driver, standard env vars.

## Stack

Next.js 15 (App Router, `output: 'standalone'`) · Postgres 16 · Drizzle ORM +
drizzle-kit migrations · Auth.js v5 credentials provider (magic link can be
added later without schema changes) · Tailwind v4 + shadcn/ui · `qrcode` for
voter-link QR codes · Vitest for the IRV unit tests.

## Data model (`src/db/schema.ts`)

```
admins ──────────< elections (created_by / closed_by)
                      │ status: draft → open → closed
                      ├──< election_voters >── members   (persistent roster)
                      └──< contests  status: pending → open → closed
                             ├──< candidates
                             ├──< ballots ──< ballot_rankings (rank 1..n)
                             │      unique (contest_id, member_id)  ← one vote per name
                             └── contest_results (frozen tally JSON on close)
elections ──< voter_tokens   (unused in v1; ready for per-voter links later)
```

Key decisions:

- **Persistent roster, per-election snapshot.** `members` is the chapter
  roster you edit any time. Creating an election copies eligible members into
  `election_voters`, so you can run several elections per meeting off one
  roster, and later roster edits never affect a past election.
- **One ballot per member per contest** enforced by a DB unique index, not
  just app logic.
- **Attribution:** every election/contest records which admin created and
  closed it.
- **Audit trail:** closing a contest freezes the full round-by-round IRV log
  (counts, transfers, exhausted ballots, tie-break decisions) into
  `contest_results.rounds` as JSON.
- **Partial rankings allowed** — voters may rank only their top choices.

## IRV rules (`src/lib/irv.ts`, from scratch, no npm dep)

1. Each ballot counts for its highest-ranked continuing candidate.
2. Winner = strict majority (>50%) of continuing (non-exhausted) ballots.
3. Otherwise eliminate the lowest candidate and redistribute; repeat.
4. Exhausted ballots leave the denominator and are reported each round.
5. Ties for elimination: batch-eliminate a trailing group whose combined
   total can't catch the next candidate → else backward tie-break (fewest
   votes in most recent differing prior round) → else deterministic seeded
   draw, recorded in the audit log.
6. Exact final tie → result reports `isTie: true` for the chair to resolve
   (per Robert's Rules), rather than the app silently picking.

Unit tests will cover: first-round majority, multi-round elimination,
exhausted ballots, batch elimination, both tie-break paths, final tie, zero
ballots, single candidate, and duplicate/gap rank rejection.

## Routes

| Route | Purpose |
|---|---|
| `/admin` | Dashboard: elections list, roster link |
| `/admin/login` | Credentials sign-in (Auth.js) |
| `/admin/roster` | Edit persistent member roster (add/deactivate, paste list) |
| `/admin/elections/[id]` | Manage election: contests, voters, QR code, open/close |
| `/admin/elections/[id]/contests/[cid]` | Live results: round-by-round IRV, turnout (polls every 3s) |
| `/vote/[slug]` | Voter entry: name drop-down (eligible, not-yet-voted names) |
| `/vote/[slug]/ballot` | Ranked-choice ballot per open contest (tap-to-rank + reorder) |
| `/api/...` | Poll endpoints for live results/turnout; server actions for writes |

Live updates = polling (3s interval) as requested; swappable later.

## Deployment

- **Vercel:** connect repo, set `DATABASE_URL` (Neon/Vercel Postgres),
  `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`; run migrations via `npm run
  db:migrate` in CI/build.
- **Docker:** `docker compose up -d` → app container runs migrations on boot
  then starts the standalone server; Postgres container with volume. README
  will include Caddy and nginx reverse-proxy snippets (`AUTH_TRUST_HOST=true`
  already set).
- `npm run seed:admin` bootstraps the first admin account in either target.

## Build phases (after your sign-off)

1. IRV engine + full vitest suite
2. Auth (credentials, middleware-protected `/admin`), seed script
3. Admin: roster, elections, contests, candidates, QR generation, open/close
4. Voter flow: name select → ranked ballot → confirmation
5. Live results view + turnout polling
6. README (Vercel + Docker/Caddy/nginx docs), end-to-end test in sandbox

## Open items for you

- App name "ChapterVote" — rename if you like.
- Voter names in results are never shown (ballots are linked to members for
  the one-vote rule, but the UI only shows counts). Flag if you want a
  who-has-voted checklist visible to admins — easy either way.
