import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import * as t from "@/db/schema";
import { TurnoutDisplay } from "./turnout-display";

export const dynamic = "force-dynamic";

// No chrome around this page — it fills the projector screen.
export default async function DisplayPage({
  params,
}: {
  params: Promise<{ electionId: string }>;
}) {
  const { electionId } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      electionId,
    )
  ) {
    notFound();
  }
  const election = await db.query.elections.findFirst({
    where: eq(t.elections.id, electionId),
    columns: { id: true, slug: true },
  });
  if (!election) notFound();

  // The join link never changes during a meeting, so render its QR once
  // here rather than on every poll.
  const voteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/vote/${election.slug}`;
  const joinQr = await QRCode.toDataURL(voteUrl, {
    width: 600,
    margin: 1,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });

  return (
    <TurnoutDisplay
      electionId={electionId}
      voteUrl={voteUrl}
      joinQr={joinQr}
    />
  );
}
