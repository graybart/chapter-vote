import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const electionStatus = pgEnum("election_status", [
  "draft", // being set up, not visible to voters
  "open", // voter link/QR active
  "closed", // archived; results frozen
]);

export const contestStatus = pgEnum("contest_status", [
  "pending", // created but not yet accepting ballots
  "open", // accepting ballots
  "closed", // tally frozen into contest_results
]);

export const adminRole = pgEnum("admin_role", [
  "admin", // full control (the "C" / election runner)
  "observer", // view-only: sees dashboard + live results, cannot change anything
]);

// ---------------------------------------------------------------------------
// Admins — individual accounts so create/open/close actions are attributable
// ---------------------------------------------------------------------------

export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: adminRole("role").notNull().default("admin"),
  // The bootstrap account (first admin seeded at install). Only the owner
  // can manage other accounts; the owner can't be demoted or deleted.
  isOwner: boolean("is_owner").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Members — the persistent chapter roster, reused across elections.
// Edit freely between meetings; per-election eligibility is a snapshot in
// election_voters, so editing the roster never disturbs a past election.
// ---------------------------------------------------------------------------

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // GTID used to verify identity when voting. Stored server-side only —
    // never included in voter-facing API responses. Null = not on file
    // (member can vote without verification).
    gtid: text("gtid"),
    active: boolean("active").notNull().default(true), // soft-remove from roster
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("members_name_unique").on(t.name)],
);

// ---------------------------------------------------------------------------
// Elections — one per chapter meeting, containing one or more contests
// ---------------------------------------------------------------------------

export const elections = pgTable("elections", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(), // e.g. "Spring 2027 Officer Elections"
  slug: text("slug").notNull().unique(), // short code in the voter URL + QR
  status: electionStatus("status").notNull().default("draft"),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => admins.id),
  closedById: uuid("closed_by_id").references(() => admins.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Election voters — which roster members are eligible in a given election.
// Populated from `members` when the election is created ("import active
// roster" button); individually addable/removable afterwards.
// ---------------------------------------------------------------------------

export const electionVoters = pgTable(
  "election_voters",
  {
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.electionId, t.memberId] })],
);

// ---------------------------------------------------------------------------
// Contests — an office being voted on (President, Treasurer, ...)
// ---------------------------------------------------------------------------

export const contests = pgTable(
  "contests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: contestStatus("status").notNull().default("pending"),
    // When true (admin-controlled, off by default), voters can see the
    // winner of this closed contest on the voting page.
    resultsPublished: boolean("results_published").notNull().default(false),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => admins.id),
    closedById: uuid("closed_by_id").references(() => admins.id),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("contests_election_idx").on(t.electionId)],
);

export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contestId: uuid("contest_id")
      .notNull()
      .references(() => contests.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    withdrawn: boolean("withdrawn").notNull().default(false),
  },
  (t) => [index("candidates_contest_idx").on(t.contestId)],
);

// ---------------------------------------------------------------------------
// Contest exclusions — members barred from voting in a specific contest
// (e.g. someone who is up for that office). They still see the contest and
// its open/closed status, but get no ballot and no published result.
// ---------------------------------------------------------------------------

export const contestExclusions = pgTable(
  "contest_exclusions",
  {
    contestId: uuid("contest_id")
      .notNull()
      .references(() => contests.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contestId, t.memberId] })],
);

// ---------------------------------------------------------------------------
// Ballots — one per (contest, member); enforced by unique index
// ---------------------------------------------------------------------------

export const ballots = pgTable(
  "ballots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contestId: uuid("contest_id")
      .notNull()
      .references(() => contests.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ballots_one_per_voter").on(t.contestId, t.memberId),
    index("ballots_contest_idx").on(t.contestId),
  ],
);

// Rankings: rank 1 = first choice. Partial rankings allowed (a voter may
// rank only their top N); a ballot whose ranked candidates are all
// eliminated becomes "exhausted" during tallying.
export const ballotRankings = pgTable(
  "ballot_rankings",
  {
    ballotId: uuid("ballot_id")
      .notNull()
      .references(() => ballots.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(), // 1-based, contiguous per ballot
  },
  (t) => [
    primaryKey({ columns: [t.ballotId, t.rank] }),
    uniqueIndex("rankings_candidate_once_per_ballot").on(
      t.ballotId,
      t.candidateId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Voter tokens — not used in v1 (name drop-down is trusted), but modeled now
// so per-voter signed links / QR codes can be added without a migration.
// ---------------------------------------------------------------------------

export const voterTokens = pgTable(
  "voter_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => members.id), // null = generic election link
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("tokens_election_idx").on(t.electionId)],
);

// ---------------------------------------------------------------------------
// Contest results — frozen IRV tally written when a contest is closed.
// `rounds` is the full round-by-round record (counts, eliminations,
// transfers, exhausted ballots, tie-break decisions) for auditability.
// ---------------------------------------------------------------------------

export const contestResults = pgTable("contest_results", {
  contestId: uuid("contest_id")
    .primaryKey()
    .references(() => contests.id, { onDelete: "cascade" }),
  winnerCandidateId: uuid("winner_candidate_id").references(
    () => candidates.id,
  ),
  isTie: boolean("is_tie").notNull().default(false), // unresolvable final tie
  rounds: jsonb("rounds").notNull(), // IrvRound[] from src/lib/irv.ts
  ballotCount: integer("ballot_count").notNull(),
  talliedAt: timestamp("tallied_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations (for drizzle relational queries)
// ---------------------------------------------------------------------------

export const electionsRelations = relations(elections, ({ many, one }) => ({
  contests: many(contests),
  voters: many(electionVoters),
  createdBy: one(admins, {
    fields: [elections.createdById],
    references: [admins.id],
  }),
}));

export const contestsRelations = relations(contests, ({ many, one }) => ({
  election: one(elections, {
    fields: [contests.electionId],
    references: [elections.id],
  }),
  candidates: many(candidates),
  ballots: many(ballots),
  exclusions: many(contestExclusions),
  result: one(contestResults, {
    fields: [contests.id],
    references: [contestResults.contestId],
  }),
}));

export const contestExclusionsRelations = relations(
  contestExclusions,
  ({ one }) => ({
    contest: one(contests, {
      fields: [contestExclusions.contestId],
      references: [contests.id],
    }),
    member: one(members, {
      fields: [contestExclusions.memberId],
      references: [members.id],
    }),
  }),
);

export const candidatesRelations = relations(candidates, ({ one }) => ({
  contest: one(contests, {
    fields: [candidates.contestId],
    references: [contests.id],
  }),
}));

export const ballotsRelations = relations(ballots, ({ many, one }) => ({
  rankings: many(ballotRankings),
  contest: one(contests, {
    fields: [ballots.contestId],
    references: [contests.id],
  }),
  member: one(members, {
    fields: [ballots.memberId],
    references: [members.id],
  }),
}));

export const ballotRankingsRelations = relations(ballotRankings, ({ one }) => ({
  ballot: one(ballots, {
    fields: [ballotRankings.ballotId],
    references: [ballots.id],
  }),
  candidate: one(candidates, {
    fields: [ballotRankings.candidateId],
    references: [candidates.id],
  }),
}));

export const electionVotersRelations = relations(electionVoters, ({ one }) => ({
  election: one(elections, {
    fields: [electionVoters.electionId],
    references: [elections.id],
  }),
  member: one(members, {
    fields: [electionVoters.memberId],
    references: [members.id],
  }),
}));
