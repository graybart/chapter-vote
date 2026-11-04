import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";
import { validateRankings } from "@/lib/irv";
import { normalizeGtid } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Cast a ballot: { contestId, memberId, gtid, rankings: candidateId[] }.
 * If the member has a GTID on file, it must match — re-checked here so the
 * verify endpoint can't be skipped. The DB unique index guarantees one
 * ballot per member per contest.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const { contestId, memberId, gtid, rankings } = (body ?? {}) as {
    contestId?: string;
    memberId?: string;
    gtid?: string;
    rankings?: unknown;
  };
  if (!contestId || !memberId) {
    return NextResponse.json(
      { error: "contestId and memberId are required." },
      { status: 400 },
    );
  }

  const contest = await db.query.contests.findFirst({
    where: eq(t.contests.id, contestId),
    with: { election: true, candidates: true },
  });
  if (!contest) {
    return NextResponse.json({ error: "Contest not found." }, { status: 404 });
  }
  if (contest.status !== "open" || contest.election.status !== "open") {
    return NextResponse.json(
      { error: "Voting is not open for this contest." },
      { status: 409 },
    );
  }
  // Paused mid-vote while the chair sorts something out.
  if (contest.paused) {
    return NextResponse.json(
      { error: "Voting is paused. Please wait — it will resume shortly." },
      { status: 409 },
    );
  }

  const [eligible] = await db
    .select()
    .from(t.electionVoters)
    .where(
      and(
        eq(t.electionVoters.electionId, contest.electionId),
        eq(t.electionVoters.memberId, memberId),
      ),
    );
  if (!eligible) {
    return NextResponse.json(
      { error: "You are not on the voter list for this election." },
      { status: 403 },
    );
  }

  // Per-contest exclusion (e.g. the member is up for this office).
  const [excluded] = await db
    .select()
    .from(t.contestExclusions)
    .where(
      and(
        eq(t.contestExclusions.contestId, contestId),
        eq(t.contestExclusions.memberId, memberId),
      ),
    );
  if (excluded) {
    return NextResponse.json(
      { error: "You are not eligible to vote in this contest." },
      { status: 403 },
    );
  }

  // GTID verification (members without one on file are exempt).
  const [member] = await db
    .select()
    .from(t.members)
    .where(eq(t.members.id, memberId));
  const stored = normalizeGtid(member?.gtid);
  if (stored && stored !== normalizeGtid(gtid)) {
    return NextResponse.json(
      { error: "GTID verification failed. Log out and try again." },
      { status: 403 },
    );
  }

  // An empty rankings array is an explicit abstention: the ballot is
  // recorded (so the member shows as having voted and can't vote twice)
  // but carries no preferences and never counts toward any candidate.
  if (!Array.isArray(rankings)) {
    return NextResponse.json({ error: "rankings must be a list." }, { status: 400 });
  }
  const ranked = rankings as string[];
  if (ranked.length > 0) {
    const validIds = contest.candidates
      .filter((c) => !c.withdrawn)
      .map((c) => c.id);
    const validationError = validateRankings(validIds, ranked);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    // Multiple-choice contests take exactly one selection.
    if (contest.method === "single" && ranked.length > 1) {
      return NextResponse.json(
        { error: "This contest allows only one choice." },
        { status: 400 },
      );
    }
  }

  try {
    await db.transaction(async (tx) => {
      const [ballot] = await tx
        .insert(t.ballots)
        .values({ contestId, memberId })
        .returning();
      if (ranked.length > 0) {
        await tx.insert(t.ballotRankings).values(
          ranked.map((candidateId, i) => ({
            ballotId: ballot.id,
            candidateId,
            rank: i + 1,
          })),
        );
      }
    });
  } catch (e) {
    // 23505 = unique_violation → this member already voted in this contest.
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code?: string }).code === "23505"
    ) {
      return NextResponse.json(
        { error: "A ballot has already been cast under this name." },
        { status: 409 },
      );
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
