"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq, inArray, asc, ne, sql } from "drizzle-orm";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { auth, signIn, signOut } from "@/auth";
import { db } from "@/db";
import * as t from "@/db/schema";
import { tallyIrvMultiSeat, tallyPlurality } from "@/lib/irv";
import { generateSlug, normalizeGtid } from "@/lib/utils";

/**
 * All mutating actions require a full admin account. Observer (view-only)
 * accounts can sign in and see everything, but every write is rejected
 * server-side — hiding the buttons in the UI is cosmetic, this is the
 * actual enforcement.
 */
async function requireAdmin(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (session.user.role !== "admin") {
    throw new Error("This account is view-only.");
  }
  return session.user.id;
}

/** Account management is restricted to the owner (bootstrap admin). */
async function requireOwner(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isOwner) {
    throw new Error("Only the owner account can manage accounts.");
  }
  return session.user.id;
}

// ---------------------------------------------------------------------------
// Account management (owner only)
// ---------------------------------------------------------------------------

export async function createAdminAccount(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string> {
  await requireOwner();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!name || !email) return "Name and email/username are required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (role !== "admin" && role !== "observer") return "Pick a role.";

  const passwordHash = await bcrypt.hash(password, 12);
  const inserted = await db
    .insert(t.admins)
    .values({ name, email, passwordHash, role })
    .onConflictDoNothing()
    .returning({ id: t.admins.id });
  if (inserted.length === 0) {
    return "An account with that email/username already exists.";
  }
  revalidatePath("/admin/accounts");
  return `Account created: ${email} (${role === "admin" ? "full admin" : "view-only"}).`;
}

export async function setAdminRole(
  adminId: string,
  role: "admin" | "observer",
) {
  await requireOwner();
  // The owner is always a full admin.
  await db
    .update(t.admins)
    .set({ role })
    .where(and(eq(t.admins.id, adminId), eq(t.admins.isOwner, false)));
  revalidatePath("/admin/accounts");
}

export async function setAdminPassword(
  adminId: string,
  _prevState: string | undefined,
  formData: FormData,
): Promise<string> {
  await requireOwner();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return "Password must be at least 8 characters.";
  const passwordHash = await bcrypt.hash(password, 12);
  await db
    .update(t.admins)
    .set({ passwordHash })
    .where(eq(t.admins.id, adminId));
  revalidatePath("/admin/accounts");
  return "Password updated.";
}

export async function deleteAdminAccount(adminId: string) {
  await requireOwner();
  const [target] = await db
    .select()
    .from(t.admins)
    .where(eq(t.admins.id, adminId));
  if (!target || target.isOwner) return;

  // Accounts that created/closed elections or contests are part of the
  // audit trail and can't be deleted — demote them to observer instead.
  const [{ n }] = await db
    .select({ n: count() })
    .from(t.elections)
    .where(eq(t.elections.createdById, adminId));
  const [{ n: n2 }] = await db
    .select({ n: count() })
    .from(t.contests)
    .where(eq(t.contests.createdById, adminId));
  const [{ n: n3 }] = await db
    .select({ n: count() })
    .from(t.elections)
    .where(sql`${t.elections.closedById} = ${adminId}`);
  const [{ n: n4 }] = await db
    .select({ n: count() })
    .from(t.contests)
    .where(sql`${t.contests.closedById} = ${adminId}`);
  if (n + n2 + n3 + n4 > 0) return;

  await db.delete(t.admins).where(eq(t.admins.id, adminId));
  revalidatePath("/admin/accounts");
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) return "Invalid email or password.";
    throw error; // NEXT_REDIRECT on success
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/admin/login" });
}

// ---------------------------------------------------------------------------
// Roster (persistent members list)
// ---------------------------------------------------------------------------

export async function addMember(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const gtid = normalizeGtid(formData.get("gtid")) || null;
  if (!name) return;
  if (gtid) {
    // Re-adding an existing name updates their GTID and reactivates them.
    await db
      .insert(t.members)
      .values({ name, gtid })
      .onConflictDoUpdate({
        target: t.members.name,
        set: { gtid, active: true },
      });
  } else {
    await db
      .insert(t.members)
      .values({ name })
      .onConflictDoUpdate({ target: t.members.name, set: { active: true } });
  }
  revalidatePath("/admin/roster");
}

/**
 * Clear the roster for a fresh import (e.g. only the people present today).
 * Members who never appear in any election are deleted outright; members
 * with history are deactivated instead, so past elections and results stay
 * intact. Re-importing a deactivated name reactivates it.
 */
export async function clearRoster() {
  await requireAdmin();
  await db.execute(sql`
    DELETE FROM members
    WHERE id NOT IN (SELECT member_id FROM election_voters)
      AND id NOT IN (SELECT member_id FROM ballots)
      AND id NOT IN (SELECT member_id FROM contest_exclusions)
  `);
  await db.update(t.members).set({ active: false });
  revalidatePath("/admin/roster");
}

function splitLines(raw: string): string[] {
  const lines = raw
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim());
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Bulk import: one names list and one GTIDs list, pasted straight from
 * spreadsheet columns — line N of each belongs to the same member. The
 * GTID list may be left empty entirely (no verification for those members),
 * but if present it must have exactly one line per name (blank lines allowed
 * for members without a GTID). Existing names get their GTID updated.
 * Returns a status message for the form.
 */
export async function bulkAddMembers(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string> {
  await requireAdmin();
  const names = splitLines(String(formData.get("names") ?? ""));
  const gtids = splitLines(String(formData.get("gtids") ?? ""));

  if (names.length === 0) return "Paste at least one name.";
  if (names.some((n) => !n)) {
    return "Remove blank lines from the names list (blank GTID lines are fine).";
  }
  if (gtids.length > 0 && gtids.length !== names.length) {
    return `Count mismatch: ${names.length} names but ${gtids.length} GTID lines. They must line up one-to-one.`;
  }

  let added = 0;
  let updated = 0;
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const gtid = normalizeGtid(gtids[i] ?? "") || null;
    if (gtid) {
      await db
        .insert(t.members)
        .values({ name, gtid })
        .onConflictDoUpdate({
          target: t.members.name,
          set: { gtid, active: true },
        });
      updated++;
    } else {
      await db
        .insert(t.members)
        .values({ name })
        .onConflictDoUpdate({
          target: t.members.name,
          set: { active: true },
        });
      added++;
    }
  }
  revalidatePath("/admin/roster");
  void added;
  const withGtid = gtids.length > 0 ? updated : 0;
  return `Imported ${names.length} members (${withGtid} with GTIDs).`;
}

export async function setMemberActive(memberId: string, active: boolean) {
  await requireAdmin();
  await db.update(t.members).set({ active }).where(eq(t.members.id, memberId));
  revalidatePath("/admin/roster");
}

// ---------------------------------------------------------------------------
// Elections
// ---------------------------------------------------------------------------

export async function createElection(formData: FormData) {
  const adminId = await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const [election] = await db
    .insert(t.elections)
    .values({ title, slug: generateSlug(), createdById: adminId })
    .returning();

  // Snapshot the current active roster as this election's voter list.
  const active = await db
    .select({ id: t.members.id })
    .from(t.members)
    .where(eq(t.members.active, true));
  if (active.length > 0) {
    await db
      .insert(t.electionVoters)
      .values(active.map((m) => ({ electionId: election.id, memberId: m.id })));
  }

  revalidatePath("/admin");
  redirect(`/admin/elections/${election.id}`);
}

export async function openElection(electionId: string) {
  await requireAdmin();
  await db
    .update(t.elections)
    .set({ status: "open", openedAt: new Date() })
    .where(and(eq(t.elections.id, electionId), eq(t.elections.status, "draft")));
  revalidatePath(`/admin/elections/${electionId}`);
  revalidatePath("/admin");
}

export async function closeElection(electionId: string) {
  const adminId = await requireAdmin();

  // Close (and tally) any still-open contests first.
  const openContests = await db
    .select({ id: t.contests.id })
    .from(t.contests)
    .where(
      and(eq(t.contests.electionId, electionId), eq(t.contests.status, "open")),
    );
  for (const c of openContests) await closeContestInternal(c.id, adminId);

  await db
    .update(t.elections)
    .set({ status: "closed", closedAt: new Date(), closedById: adminId })
    .where(and(eq(t.elections.id, electionId), eq(t.elections.status, "open")));
  revalidatePath(`/admin/elections/${electionId}`);
  revalidatePath("/admin");
}

/**
 * Undo an accidental "Close election". Contests stay closed and their
 * frozen results are untouched — reopening the election just makes them
 * individually reopenable again.
 */
export async function reopenElection(electionId: string) {
  await requireAdmin();
  await db
    .update(t.elections)
    .set({ status: "open", closedAt: null, closedById: null })
    .where(
      and(eq(t.elections.id, electionId), eq(t.elections.status, "closed")),
    );
  revalidatePath(`/admin/elections/${electionId}`);
  revalidatePath("/admin");
}

export async function deleteElection(electionId: string) {
  await requireAdmin();
  // Drafts only — closed elections are historical record.
  await db
    .delete(t.elections)
    .where(
      and(eq(t.elections.id, electionId), eq(t.elections.status, "draft")),
    );
  revalidatePath("/admin");
  redirect("/admin");
}

// ---------------------------------------------------------------------------
// Election voter list
// ---------------------------------------------------------------------------

export async function importActiveRoster(electionId: string) {
  await requireAdmin();
  const active = await db
    .select({ id: t.members.id })
    .from(t.members)
    .where(eq(t.members.active, true));
  if (active.length > 0) {
    await db
      .insert(t.electionVoters)
      .values(active.map((m) => ({ electionId, memberId: m.id })))
      .onConflictDoNothing();
  }
  revalidatePath(`/admin/elections/${electionId}`);
}

export async function addVoter(electionId: string, formData: FormData) {
  await requireAdmin();
  const memberId = String(formData.get("memberId") ?? "");
  if (!memberId) return;
  await db
    .insert(t.electionVoters)
    .values({ electionId, memberId })
    .onConflictDoNothing();
  revalidatePath(`/admin/elections/${electionId}`);
}

/**
 * Set the election's voter list to exactly the people in the room, from a
 * pasted attendance list (one name per line).
 *
 * Anyone not on the list is removed, so they'd have to be re-added with
 * "Add individual member" to vote. Two deliberate exceptions: a member who
 * has already cast a ballot is never removed (that would corrupt a count —
 * reset their ballot first), and a pasted name that doesn't match anyone on
 * the chapter roster is reported rather than silently ignored.
 */
export async function importAttendees(
  electionId: string,
  _prevState: string | undefined,
  formData: FormData,
): Promise<string> {
  await requireAdmin();

  const lines = String(formData.get("names") ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "Paste at least one name.";

  const members = await db.select().from(t.members);
  const byName = new Map(members.map((m) => [m.name.trim().toLowerCase(), m]));

  const presentIds = new Set<string>();
  const unmatched: string[] = [];
  for (const line of lines) {
    const match = byName.get(line.toLowerCase());
    if (match) presentIds.add(match.id);
    else unmatched.push(line);
  }

  const current = await db
    .select({ memberId: t.electionVoters.memberId })
    .from(t.electionVoters)
    .where(eq(t.electionVoters.electionId, electionId));
  const currentIds = new Set(current.map((v) => v.memberId));

  const toAdd = [...presentIds].filter((id) => !currentIds.has(id));
  const candidatesForRemoval = [...currentIds].filter(
    (id) => !presentIds.has(id),
  );

  // Never drop someone who has already voted in this election.
  const contestIds = (
    await db
      .select({ id: t.contests.id })
      .from(t.contests)
      .where(eq(t.contests.electionId, electionId))
  ).map((c) => c.id);
  let votedAlready = new Set<string>();
  if (contestIds.length > 0 && candidatesForRemoval.length > 0) {
    const rows = await db
      .select({ memberId: t.ballots.memberId })
      .from(t.ballots)
      .where(
        and(
          inArray(t.ballots.contestId, contestIds),
          inArray(t.ballots.memberId, candidatesForRemoval),
        ),
      );
    votedAlready = new Set(rows.map((r) => r.memberId));
  }
  const toRemove = candidatesForRemoval.filter((id) => !votedAlready.has(id));

  await db.transaction(async (tx) => {
    if (toRemove.length > 0) {
      await tx
        .delete(t.electionVoters)
        .where(
          and(
            eq(t.electionVoters.electionId, electionId),
            inArray(t.electionVoters.memberId, toRemove),
          ),
        );
      if (contestIds.length > 0) {
        await tx
          .delete(t.contestExclusions)
          .where(
            and(
              inArray(t.contestExclusions.contestId, contestIds),
              inArray(t.contestExclusions.memberId, toRemove),
            ),
          );
      }
    }
    if (toAdd.length > 0) {
      await tx
        .insert(t.electionVoters)
        .values(toAdd.map((memberId) => ({ electionId, memberId })))
        .onConflictDoNothing();
    }
  });

  revalidatePath(`/admin/elections/${electionId}`);

  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.name ?? "Unknown";
  const parts = [
    `${presentIds.size} present · ${toAdd.length} added · ${toRemove.length} removed.`,
  ];
  if (votedAlready.size > 0) {
    parts.push(
      `Kept (already voted — reset their ballot first to remove them): ${[...votedAlready].map(nameOf).join(", ")}.`,
    );
  }
  if (unmatched.length > 0) {
    parts.push(
      `Not on the chapter roster, so skipped: ${unmatched.join(", ")}. Add them on the Roster page, then re-import.`,
    );
  }
  return parts.join(" ");
}

export async function removeVoter(electionId: string, memberId: string) {
  await requireAdmin();

  // Refuse if this member already cast a ballot in this election.
  const contestIds = (
    await db
      .select({ id: t.contests.id })
      .from(t.contests)
      .where(eq(t.contests.electionId, electionId))
  ).map((c) => c.id);
  if (contestIds.length > 0) {
    const [existing] = await db
      .select({ n: count() })
      .from(t.ballots)
      .where(
        and(
          inArray(t.ballots.contestId, contestIds),
          eq(t.ballots.memberId, memberId),
        ),
      );
    if (existing.n > 0) return;
  }

  await db
    .delete(t.electionVoters)
    .where(
      and(
        eq(t.electionVoters.electionId, electionId),
        eq(t.electionVoters.memberId, memberId),
      ),
    );
  // Clean up any per-contest exclusions for them in this election.
  if (contestIds.length > 0) {
    await db
      .delete(t.contestExclusions)
      .where(
        and(
          inArray(t.contestExclusions.contestId, contestIds),
          eq(t.contestExclusions.memberId, memberId),
        ),
      );
  }
  revalidatePath(`/admin/elections/${electionId}`);
}

// ---------------------------------------------------------------------------
// Contests & candidates
// ---------------------------------------------------------------------------

export async function addContest(electionId: string, formData: FormData) {
  const adminId = await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  // Number of open seats (Judicial Board elections fill several at once).
  const seats = Math.min(
    50,
    Math.max(1, Math.floor(Number(formData.get("seats") ?? 1) || 1)),
  );
  // Ranked-choice unless the admin explicitly picks plain multiple choice.
  const method = formData.get("method") === "single" ? "single" : "ranked";
  const [{ n }] = await db
    .select({ n: count() })
    .from(t.contests)
    .where(eq(t.contests.electionId, electionId));
  await db.insert(t.contests).values({
    electionId,
    title,
    seats,
    method,
    sortOrder: n,
    createdById: adminId,
  });
  revalidatePath(`/admin/elections/${electionId}`);
}

/** Switch a contest between ranked-choice and multiple choice (pre-voting). */
export async function setContestMethod(
  contestId: string,
  method: "ranked" | "single",
) {
  await requireAdmin();
  const [contest] = await db
    .select()
    .from(t.contests)
    .where(eq(t.contests.id, contestId));
  // Only while pending — ballots already cast were built for one format.
  if (!contest || contest.status !== "pending") return;
  await db
    .update(t.contests)
    .set({ method })
    .where(eq(t.contests.id, contestId));
  revalidatePath(`/admin/elections/${contest.electionId}`);
}

/** Change the number of open seats — only before voting opens. */
export async function setContestSeats(contestId: string, formData: FormData) {
  await requireAdmin();
  const seats = Math.min(
    50,
    Math.max(1, Math.floor(Number(formData.get("seats") ?? 1) || 1)),
  );
  const [contest] = await db
    .select()
    .from(t.contests)
    .where(eq(t.contests.id, contestId));
  if (!contest || contest.status !== "pending") return;
  await db
    .update(t.contests)
    .set({ seats })
    .where(eq(t.contests.id, contestId));
  revalidatePath(`/admin/elections/${contest.electionId}`);
}

export async function deleteContest(contestId: string) {
  await requireAdmin();
  const [contest] = await db
    .select()
    .from(t.contests)
    .where(eq(t.contests.id, contestId));
  if (!contest || contest.status !== "pending") return; // no ballots yet
  await db.delete(t.contests).where(eq(t.contests.id, contestId));
  revalidatePath(`/admin/elections/${contest.electionId}`);
}

export async function addCandidate(contestId: string, formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const [contest] = await db
    .select()
    .from(t.contests)
    .where(eq(t.contests.id, contestId));
  if (!contest || contest.status === "closed") return;
  const [{ n }] = await db
    .select({ n: count() })
    .from(t.candidates)
    .where(eq(t.candidates.contestId, contestId));
  await db.insert(t.candidates).values({ contestId, name, sortOrder: n });
  revalidatePath(`/admin/elections/${contest.electionId}`);
}

export async function removeCandidate(candidateId: string) {
  await requireAdmin();
  const [candidate] = await db
    .select()
    .from(t.candidates)
    .where(eq(t.candidates.id, candidateId));
  if (!candidate) return;
  const [contest] = await db
    .select()
    .from(t.contests)
    .where(eq(t.contests.id, candidate.contestId));
  if (!contest) return;

  if (contest.status === "pending") {
    // No ballots can reference it yet — hard delete.
    await db.delete(t.candidates).where(eq(t.candidates.id, candidateId));
  } else {
    // Ballots may reference it — mark withdrawn; tally ignores withdrawn
    // candidates and their rankings are skipped over.
    await db
      .update(t.candidates)
      .set({ withdrawn: true })
      .where(eq(t.candidates.id, candidateId));
  }
  revalidatePath(`/admin/elections/${contest.electionId}`);
}

export async function openContest(contestId: string) {
  await requireAdmin();
  const contest = await db.query.contests.findFirst({
    where: eq(t.contests.id, contestId),
    with: { election: true, candidates: true },
  });
  if (!contest || contest.status !== "pending") return;
  if (contest.election.status !== "open") return; // open the election first
  if (contest.candidates.filter((c) => !c.withdrawn).length < 1) return;

  // Exactly one contest runs at a time — voters' screens and the projector
  // both follow "the open contest", so a second one would be ambiguous.
  const [alreadyOpen] = await db
    .select({ id: t.contests.id })
    .from(t.contests)
    .where(
      and(
        eq(t.contests.electionId, contest.electionId),
        eq(t.contests.status, "open"),
      ),
    );
  if (alreadyOpen) return;

  // Starting a new vote clears the previous contest's result off the
  // projector, so a stale winner can't reappear when this one closes.
  await unpublishOtherResults(contest.electionId);
  await db
    .update(t.contests)
    .set({ status: "open", openedAt: new Date(), paused: false })
    .where(eq(t.contests.id, contestId));
  revalidatePath(`/admin/elections/${contest.electionId}`);
}

/**
 * Pause or resume an open contest. Paused keeps it the active contest —
 * admins can still reach live results, reset ballots and change exclusions
 * — but no new ballots are accepted until it resumes.
 */
export async function setContestPaused(contestId: string, paused: boolean) {
  await requireAdmin();
  const [contest] = await db
    .select()
    .from(t.contests)
    .where(eq(t.contests.id, contestId));
  if (!contest || contest.status !== "open") return;
  await db
    .update(t.contests)
    .set({ paused })
    .where(eq(t.contests.id, contestId));
  revalidatePath(`/admin/elections/${contest.electionId}`);
}

async function closeContestInternal(contestId: string, adminId: string) {
  const contest = await db.query.contests.findFirst({
    where: eq(t.contests.id, contestId),
    with: { candidates: true },
  });
  if (!contest || contest.status !== "open") return;

  const ballotRows = await db.query.ballots.findMany({
    where: eq(t.ballots.contestId, contestId),
    with: { rankings: { orderBy: [asc(t.ballotRankings.rank)] } },
  });
  const irvBallots = ballotRows.map((b) => ({
    rankings: b.rankings.map((r) => r.candidateId),
  }));
  const candidateIds = contest.candidates
    .filter((c) => !c.withdrawn)
    .map((c) => c.id);

  // Multi-seat aware: seats = 1 is ordinary IRV, >1 awards seats one at a
  // time per the bylaws. `rounds` stores the full SeatResult[] audit trail.
  const result =
    contest.method === "single"
      ? tallyPlurality(candidateIds, irvBallots, contest.seats)
      : tallyIrvMultiSeat(candidateIds, irvBallots, contest.seats);

  await db.transaction(async (tx) => {
    await tx
      .update(t.contests)
      .set({
        status: "closed",
        closedAt: new Date(),
        closedById: adminId,
        paused: false,
      })
      .where(eq(t.contests.id, contestId));
    await tx
      .insert(t.contestResults)
      .values({
        contestId,
        winnerCandidateId: result.winners[0] ?? null,
        winners: result.winners,
        isTie: result.isTie,
        rounds: result.seatResults,
        ballotCount: ballotRows.length,
      })
      .onConflictDoUpdate({
        target: t.contestResults.contestId,
        set: {
          winnerCandidateId: result.winners[0] ?? null,
          winners: result.winners,
          isTie: result.isTie,
          rounds: result.seatResults,
          ballotCount: ballotRows.length,
          talliedAt: new Date(),
        },
      });
  });

  return contest.electionId;
}

export async function closeContest(contestId: string) {
  const adminId = await requireAdmin();
  const electionId = await closeContestInternal(contestId, adminId);
  if (electionId) revalidatePath(`/admin/elections/${electionId}`);
}

/**
 * Close voting and put the result on the projector in one step — the usual
 * night-of action, so the chair doesn't have to hit two buttons between
 * contests.
 */
export async function closeContestAndPublish(contestId: string) {
  const adminId = await requireAdmin();
  const electionId = await closeContestInternal(contestId, adminId);
  if (!electionId) return;
  await unpublishOtherResults(electionId, contestId);
  await db
    .update(t.contests)
    .set({ resultsPublished: true })
    .where(eq(t.contests.id, contestId));
  revalidatePath(`/admin/elections/${electionId}`);
}

/**
 * Bar a member from voting in one contest (e.g. they're up for that office).
 * Blocked if they've already voted — reset their ballot first.
 */
export async function excludeVoter(contestId: string, formData: FormData) {
  await requireAdmin();
  const memberId = String(formData.get("memberId") ?? "");
  if (!memberId) return;
  const [contest] = await db
    .select()
    .from(t.contests)
    .where(eq(t.contests.id, contestId));
  if (!contest || contest.status === "closed") return;
  const [hasBallot] = await db
    .select({ id: t.ballots.id })
    .from(t.ballots)
    .where(
      and(eq(t.ballots.contestId, contestId), eq(t.ballots.memberId, memberId)),
    );
  if (hasBallot) return; // reset their ballot first, then exclude
  await db
    .insert(t.contestExclusions)
    .values({ contestId, memberId })
    .onConflictDoNothing();
  revalidatePath(`/admin/elections/${contest.electionId}`);
}

export async function includeVoter(contestId: string, memberId: string) {
  await requireAdmin();
  const [contest] = await db
    .select()
    .from(t.contests)
    .where(eq(t.contests.id, contestId));
  if (!contest || contest.status === "closed") return;
  await db
    .delete(t.contestExclusions)
    .where(
      and(
        eq(t.contestExclusions.contestId, contestId),
        eq(t.contestExclusions.memberId, memberId),
      ),
    );
  revalidatePath(`/admin/elections/${contest.electionId}`);
}

/**
 * Take every other contest's result off the projector.
 *
 * The projector shows at most one published result, so a stale winner from
 * an earlier contest must never linger: once the chair moves on, the old
 * result goes with it.
 */
async function unpublishOtherResults(electionId: string, exceptId?: string) {
  await db
    .update(t.contests)
    .set({ resultsPublished: false })
    .where(
      exceptId
        ? and(
            eq(t.contests.electionId, electionId),
            ne(t.contests.id, exceptId),
          )
        : eq(t.contests.electionId, electionId),
    );
}

/**
 * Show/hide a closed contest's winner on the voter page. Off by default —
 * the election runner announces results when ready.
 */
export async function setResultsPublished(
  contestId: string,
  published: boolean,
) {
  await requireAdmin();
  const [contest] = await db
    .select()
    .from(t.contests)
    .where(eq(t.contests.id, contestId));
  if (!contest || contest.status !== "closed") return;
  // Only one result is on the projector at a time.
  if (published) await unpublishOtherResults(contest.electionId, contestId);
  await db
    .update(t.contests)
    .set({ resultsPublished: published })
    .where(eq(t.contests.id, contestId));
  revalidatePath(`/admin/elections/${contest.electionId}`);
}

/**
 * Nullify a member's ballot in an open contest so they can vote again —
 * e.g. someone accidentally voted under the wrong name. The ballot and its
 * rankings are permanently deleted (cascade); nothing about its contents is
 * ever read or shown. Closed contests are frozen and cannot be altered.
 */
export async function resetBallot(contestId: string, memberId: string) {
  await requireAdmin();
  const [contest] = await db
    .select()
    .from(t.contests)
    .where(eq(t.contests.id, contestId));
  if (!contest || contest.status !== "open") return;
  await db
    .delete(t.ballots)
    .where(
      and(
        eq(t.ballots.contestId, contestId),
        eq(t.ballots.memberId, memberId),
      ),
    );
  revalidatePath(`/admin/elections/${contest.electionId}`);
}

/**
 * Revert an open or closed contest back to draft ("pending") — only while
 * it has zero ballots. Unpublishes it from the ballot until reopened;
 * candidates and exclusions are kept.
 */
export async function revertContestToPending(contestId: string) {
  await requireAdmin();
  const [contest] = await db
    .select()
    .from(t.contests)
    .where(eq(t.contests.id, contestId));
  if (!contest || contest.status === "pending") return;
  const [{ n }] = await db
    .select({ n: count() })
    .from(t.ballots)
    .where(eq(t.ballots.contestId, contestId));
  if (n > 0) return; // ballots exist — close/reopen instead

  await db.transaction(async (tx) => {
    await tx
      .delete(t.contestResults)
      .where(eq(t.contestResults.contestId, contestId));
    await tx
      .update(t.contests)
      .set({
        status: "pending",
        openedAt: null,
        closedAt: null,
        closedById: null,
        paused: false,
        resultsPublished: false,
      })
      .where(eq(t.contests.id, contestId));
  });
  revalidatePath(`/admin/elections/${contest.electionId}`);
}

/**
 * Revert a whole open election back to draft — only while zero ballots have
 * been cast anywhere in it. The voter link stops working and every contest
 * returns to draft. Escape hatch for "opened too early" mistakes.
 */
export async function revertElectionToDraft(electionId: string) {
  await requireAdmin();
  const [election] = await db
    .select()
    .from(t.elections)
    .where(eq(t.elections.id, electionId));
  if (!election || election.status !== "open") return;

  const contestIds = (
    await db
      .select({ id: t.contests.id })
      .from(t.contests)
      .where(eq(t.contests.electionId, electionId))
  ).map((c) => c.id);
  if (contestIds.length > 0) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(t.ballots)
      .where(inArray(t.ballots.contestId, contestIds));
    if (n > 0) return;
  }

  await db.transaction(async (tx) => {
    if (contestIds.length > 0) {
      await tx
        .delete(t.contestResults)
        .where(inArray(t.contestResults.contestId, contestIds));
      await tx
        .update(t.contests)
        .set({
          status: "pending",
          openedAt: null,
          closedAt: null,
          closedById: null,
          paused: false,
          resultsPublished: false,
        })
        .where(eq(t.contests.electionId, electionId));
    }
    await tx
      .update(t.elections)
      .set({ status: "draft", openedAt: null })
      .where(eq(t.elections.id, electionId));
  });
  revalidatePath(`/admin/elections/${electionId}`);
  revalidatePath("/admin");
}

/** Undo an accidental close: discards the frozen result, resumes voting. */
export async function reopenContest(contestId: string) {
  await requireAdmin();
  const contest = await db.query.contests.findFirst({
    where: eq(t.contests.id, contestId),
    with: { election: true },
  });
  if (!contest || contest.status !== "closed") return;
  if (contest.election.status !== "open") return;
  // Only one contest open at a time (see openContest).
  const [alreadyOpen] = await db
    .select({ id: t.contests.id })
    .from(t.contests)
    .where(
      and(
        eq(t.contests.electionId, contest.electionId),
        eq(t.contests.status, "open"),
      ),
    );
  if (alreadyOpen) return;

  await unpublishOtherResults(contest.electionId);
  await db.transaction(async (tx) => {
    await tx
      .delete(t.contestResults)
      .where(eq(t.contestResults.contestId, contestId));
    await tx
      .update(t.contests)
      .set({
        status: "open",
        closedAt: null,
        closedById: null,
        paused: false,
        resultsPublished: false, // back to hidden until re-closed + re-shown
      })
      .where(eq(t.contests.id, contestId));
  });
  revalidatePath(`/admin/elections/${contest.electionId}`);
}
