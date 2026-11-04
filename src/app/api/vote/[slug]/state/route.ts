import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Voter-facing state, polled every few seconds. The voting screen is a
 * kiosk that follows the chair: exactly one contest runs at a time, so this
 * returns just the roster (for the name drop-down) and whichever contest is
 * open right now, if any.
 *
 * Never exposed: turnout counts, other members' ballots, rankings, or
 * results — those live on the admin view and the projector.
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
          exclusions: true,
        },
      },
    },
  });
  if (!election) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const open = election.contests.find((c) => c.status === "open") ?? null;

  let activeContest = null;
  if (open) {
    const excluded = memberId
      ? open.exclusions.some((x) => x.memberId === memberId)
      : false;

    let voted = false;
    if (memberId) {
      const [ballot] = await db
        .select({ id: t.ballots.id })
        .from(t.ballots)
        .where(
          and(
            eq(t.ballots.contestId, open.id),
            eq(t.ballots.memberId, memberId),
          ),
        );
      voted = !!ballot;
    }

    activeContest = {
      id: open.id,
      title: open.title,
      description: open.description,
      seats: open.seats,
      method: open.method,
      paused: open.paused,
      excluded,
      voted,
      candidates: open.candidates
        .filter((c) => !c.withdrawn)
        .map((c) => ({ id: c.id, name: c.name })),
    };
  }

  return NextResponse.json({
    election: { title: election.title, status: election.status },
    voters: election.voters
      .map((v) => ({ id: v.memberId, name: v.member.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    activeContest,
  });
}
