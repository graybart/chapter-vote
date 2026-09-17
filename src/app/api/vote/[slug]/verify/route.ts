import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";
import { normalizeGtid } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Verify a voter's identity: { memberId, gtid }.
 * If the member has a GTID on file it must match (digits-only comparison).
 * Members with no GTID on file pass without verification.
 * GTIDs are never sent to the client — only ok/not-ok comes back.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const { memberId, gtid } = (body ?? {}) as {
    memberId?: string;
    gtid?: string;
  };
  if (!memberId) {
    return NextResponse.json({ error: "memberId is required." }, { status: 400 });
  }

  const election = await db.query.elections.findFirst({
    where: eq(t.elections.slug, slug),
    columns: { id: true },
  });
  if (!election) {
    return NextResponse.json({ error: "Election not found." }, { status: 404 });
  }

  const [eligible] = await db
    .select()
    .from(t.electionVoters)
    .where(
      and(
        eq(t.electionVoters.electionId, election.id),
        eq(t.electionVoters.memberId, memberId),
      ),
    );
  if (!eligible) {
    return NextResponse.json(
      { error: "You are not on the voter list for this election." },
      { status: 403 },
    );
  }

  const [member] = await db
    .select()
    .from(t.members)
    .where(eq(t.members.id, memberId));
  if (!member) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  const stored = normalizeGtid(member.gtid);
  if (stored && stored !== normalizeGtid(gtid)) {
    return NextResponse.json(
      {
        error:
          "That GTID doesn’t match our records for this name. Check for typos, or see the election officer.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true });
}
