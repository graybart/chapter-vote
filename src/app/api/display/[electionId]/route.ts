import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";

export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Everything the projector needs, polled every few seconds. Set the URL up
 * once at the start of the meeting and it follows the chair from then on:
 *
 *   contest open            → live turnout for that contest
 *   closed + result shown   → the winner
 *   otherwise               → waiting screen (with the join QR code)
 *
 * Deliberately unauthenticated so any laptop can display it, and keyed by
 * the election's id rather than its voter slug so voters — who have the
 * slug in their QR code — can't pull turnout up on their phones.
 *
 * Returns counts and published winners only: never names of who has voted,
 * never anyone's rankings, never an unpublished result.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ electionId: string }> },
) {
  const { electionId } = await params;
  if (!UUID.test(electionId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const election = await db.query.elections.findFirst({
    where: eq(t.elections.id, electionId),
    with: {
      voters: true,
      contests: {
        orderBy: [asc(t.contests.sortOrder)],
        with: { exclusions: true, candidates: true, result: true },
      },
    },
  });
  if (!election) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // --- The one contest currently taking votes ---------------------------
  const open = election.contests.find((c) => c.status === "open") ?? null;
  let active = null;
  if (open) {
    const excluded = new Set(open.exclusions.map((x) => x.memberId));
    const eligibleIds = election.voters
      .map((v) => v.memberId)
      .filter((id) => !excluded.has(id));

    const ballots = await db
      .select({ memberId: t.ballots.memberId })
      .from(t.ballots)
      .where(eq(t.ballots.contestId, open.id));
    const votedIds = new Set(ballots.map((b) => b.memberId));

    const voted = eligibleIds.filter((id) => votedIds.has(id)).length;
    active = {
      title: open.title,
      seats: open.seats,
      method: open.method,
      paused: open.paused,
      voted,
      remaining: eligibleIds.length - voted,
      eligible: eligibleIds.length,
    };
  }

  // --- Most recently closed contest whose result the chair published ----
  const publishedContests = election.contests.filter(
    (c) => c.status === "closed" && c.resultsPublished && c.result,
  );
  publishedContests.sort(
    (a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0),
  );
  const latest = publishedContests[0] ?? null;
  const published = latest
    ? {
        title: latest.title,
        seats: latest.seats,
        isTie: latest.result!.isTie,
        winnerNames: (
          latest.result!.winners ??
          (latest.result!.winnerCandidateId
            ? [latest.result!.winnerCandidateId]
            : [])
        ).map(
          (id) =>
            latest.candidates.find((c) => c.id === id)?.name ?? "Unknown",
        ),
      }
    : null;

  return NextResponse.json({
    electionTitle: election.title,
    electionStatus: election.status,
    active,
    published,
  });
}
