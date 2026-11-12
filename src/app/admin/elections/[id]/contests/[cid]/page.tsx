import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";
import { LiveResults } from "./live-results";

export const dynamic = "force-dynamic";

export default async function ContestResultsPage({
  params,
}: {
  params: Promise<{ id: string; cid: string }>;
}) {
  const { id, cid } = await params;
  const contest = await db.query.contests.findFirst({
    where: eq(t.contests.id, cid),
    with: { election: true },
  });
  if (!contest || contest.electionId !== id) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href={`/admin/elections/${id}`}
          className="text-sm text-on-surface-variant hover:text-on-surface"
        >
          ← {contest.election.title}
        </Link>
        <h1 className="text-2xl font-bold">{contest.title}</h1>
      </div>
      <LiveResults contestId={cid} />
    </div>
  );
}
