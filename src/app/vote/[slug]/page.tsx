import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";
import { VoterApp } from "./voter-app";

export const dynamic = "force-dynamic";

export default async function VotePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const election = await db.query.elections.findFirst({
    where: eq(t.elections.slug, slug),
    columns: { id: true },
  });
  if (!election) notFound();

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <VoterApp slug={slug} />
    </main>
  );
}
