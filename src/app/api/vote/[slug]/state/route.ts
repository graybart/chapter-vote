import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Voter-facing election state, polled every few seconds:
 * roster names for the drop-down, contests with candidates, and (when
 * ?memberId= is supplied) which contests that member has already voted in.
 * Individual rankings are never exposed, and neither are turnout counts —
 * only admins see who/how many have voted.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const memberId = new URL(req.url).searchParams.get("memberId");

  const election = await db.query.elections.findFirst({
    where: eq(t.elections.slug, slug),
    with: {
      voters: { with: { member: true } },
      contests: {
        orderBy: [asc(t.contests.sortOrder)],
        with: {
          candidates: { orderBy: [asc(t.candidates.sortOrder)] },
          result: true,
        },
      },
    },
  });
  if (!election) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contestIds = election.contests.map((c) => c.id);

  let myVotedContestIds: string[] = [];
  let myExcludedContestIds = new Set<string>();
  if (memberId && contestIds.length > 0) {
    const mine = await db
      .select({ contestId: t.ballots.contestId })
      .from(t.ballots)
      .where(
        and(
          inArray(t.ballots.contestId, contestIds),
          eq(t.ballots.memberId, memberId),
        ),
      );
    myVotedContestIds = mine.map((r) => r.contestId);

    const exclusions = await db
      .select({ contestId: t.contestExclusions.contestId })
      .from(t.contestExclusions)
      .where(
        and(
          inArray(t.contestExclusions.contestId, contestIds),
          eq(t.contestExclusions.memberId, memberId),
        ),
      );
    myExcludedContestIds = new Set(exclusions.map((r) => r.contestId));
  }

  return NextResponse.json({
    election: { title: election.title, status: election.status },
    voters: election.voters
      .map((v) => ({ id: v.memberId, name: v.member.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    myVotedContestIds,
    contests: election.contests.map((c) => {
      const excluded = myExcludedContestIds.has(c.id);
      // Winner is only revealed once the admin publishes results — and
      // never to a member excluded from this contest.
      const published = c.status === "closed" && c.resultsPublished && !excluded;
      const winner =
        published && c.result?.winnerCandidateId
          ? (c.candidates.find((x) => x.id === c.result!.winnerCandidateId)
              ?.name ?? null)
          : null;
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        status: c.status,
        excluded,
        result: published
          ? { isTie: c.result?.isTie ?? false, winnerName: winner }
          : null,
        candidates: c.candidates
          .filter((cand) => !cand.withdrawn)
          .map((cand) => ({ id: cand.id, name: cand.name })),
      };
    }),
  });
}
