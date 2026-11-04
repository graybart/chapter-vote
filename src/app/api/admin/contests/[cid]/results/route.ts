import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import * as t from "@/db/schema";
import {
  tallyIrvMultiSeat,
  tallyPlurality,
  type MultiSeatIrvResult,
  type SeatResult,
} from "@/lib/irv";

export const dynamic = "force-dynamic";

/**
 * Live results for the admin view, polled every few seconds.
 * Open contests are tallied on the fly; closed contests return the frozen
 * result from contest_results.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cid: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cid } = await params;
  const contest = await db.query.contests.findFirst({
    where: eq(t.contests.id, cid),
    with: {
      candidates: { orderBy: [asc(t.candidates.sortOrder)] },
      result: true,
      exclusions: true,
      election: { with: { voters: { with: { member: true } } } },
    },
  });
  if (!contest) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ballotRows = await db.query.ballots.findMany({
    where: eq(t.ballots.contestId, cid),
    with: { rankings: { orderBy: [asc(t.ballotRankings.rank)] } },
  });

  const votedMemberIds = new Set(ballotRows.map((b) => b.memberId));
  // Members excluded from this contest aren't expected to vote — leave them
  // off the checklist and out of the eligible count.
  const excludedIds = new Set(contest.exclusions.map((x) => x.memberId));
  const eligibleVoters = contest.election.voters.filter(
    (v) => !excludedIds.has(v.memberId),
  );
  const checklist = eligibleVoters
    .map((v) => ({
      memberId: v.memberId,
      name: v.member.name,
      voted: votedMemberIds.has(v.memberId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  let result: MultiSeatIrvResult;
  if (contest.status === "closed" && contest.result) {
    // Frozen official tally. Rows written before multi-seat support stored
    // a bare IrvRound[]; wrap those as a single seat so the shape is uniform.
    const stored = contest.result.rounds as unknown;
    const seatResults: SeatResult[] =
      Array.isArray(stored) && stored.length > 0 && "seat" in stored[0]
        ? (stored as SeatResult[])
        : [
            {
              seat: 1,
              winner: contest.result.winnerCandidateId,
              isTie: contest.result.isTie,
              tiedCandidates: [],
              rounds: (stored ?? []) as SeatResult["rounds"],
            },
          ];
    result = {
      seats: contest.seats,
      winners:
        contest.result.winners ??
        (contest.result.winnerCandidateId
          ? [contest.result.winnerCandidateId]
          : []),
      isTie: contest.result.isTie,
      tiedCandidates:
        seatResults[seatResults.length - 1]?.tiedCandidates ?? [],
      seatResults,
      totalBallots: contest.result.ballotCount,
    };
  } else {
    const liveCandidates = contest.candidates
      .filter((c) => !c.withdrawn)
      .map((c) => c.id);
    const liveBallots = ballotRows.map((b) => ({
      rankings: b.rankings.map((r) => r.candidateId),
    }));
    result =
      contest.method === "single"
        ? tallyPlurality(liveCandidates, liveBallots, contest.seats)
        : tallyIrvMultiSeat(liveCandidates, liveBallots, contest.seats);
  }

  return NextResponse.json({
    viewerRole: session.user.role,
    contest: {
      id: contest.id,
      title: contest.title,
      status: contest.status,
      seats: contest.seats,
      method: contest.method,
      paused: contest.paused,
      resultsPublished: contest.resultsPublished,
      electionStatus: contest.election.status,
    },
    candidates: contest.candidates.map((c) => ({
      id: c.id,
      name: c.name,
      withdrawn: c.withdrawn,
    })),
    turnout: {
      voted: ballotRows.length,
      eligible: eligibleVoters.length,
      // Explicit abstentions: ballots submitted with no rankings.
      abstained: ballotRows.filter((b) => b.rankings.length === 0).length,
    },
    checklist,
    result,
  });
}
