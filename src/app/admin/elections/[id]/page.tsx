import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { db } from "@/db";
import * as t from "@/db/schema";
import {
  addCandidate,
  addContest,
  addVoter,
  closeContest,
  closeElection,
  deleteContest,
  deleteElection,
  excludeVoter,
  importActiveRoster,
  includeVoter,
  openContest,
  openElection,
  removeCandidate,
  removeVoter,
  reopenContest,
  revertContestToPending,
  revertElectionToDraft,
  setResultsPublished,
} from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const statusVariant = {
  draft: "secondary",
  pending: "secondary",
  open: "success",
  closed: "outline",
} as const;

export default async function ElectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const readOnly = session?.user?.role !== "admin";

  const election = await db.query.elections.findFirst({
    where: eq(t.elections.id, id),
    with: {
      createdBy: true,
      voters: { with: { member: true } },
      contests: {
        orderBy: [asc(t.contests.sortOrder)],
        with: {
          candidates: { orderBy: [asc(t.candidates.sortOrder)] },
          result: true,
          exclusions: { with: { member: true } },
        },
      },
    },
  });
  if (!election) notFound();

  // Ballot counts per contest, and which members have voted anywhere.
  const contestIds = election.contests.map((c) => c.id);
  const ballotRows =
    contestIds.length > 0
      ? await db
          .select({
            contestId: t.ballots.contestId,
            memberId: t.ballots.memberId,
          })
          .from(t.ballots)
          .where(inArray(t.ballots.contestId, contestIds))
      : [];
  const ballotCount = new Map<string, number>();
  const votedMembers = new Set<string>();
  const votedByContest = new Map<string, Set<string>>();
  for (const b of ballotRows) {
    ballotCount.set(b.contestId, (ballotCount.get(b.contestId) ?? 0) + 1);
    votedMembers.add(b.memberId);
    if (!votedByContest.has(b.contestId)) {
      votedByContest.set(b.contestId, new Set());
    }
    votedByContest.get(b.contestId)!.add(b.memberId);
  }

  const voteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/vote/${election.slug}`;
  const qrDataUrl = await QRCode.toDataURL(voteUrl, { width: 256, margin: 1 });

  // Roster members not yet on this election's voter list.
  const allMembers = await db.query.members.findMany({
    orderBy: [asc(t.members.name)],
  });
  const voterIds = new Set(election.voters.map((v) => v.memberId));
  const addable = allMembers.filter((m) => !voterIds.has(m.id) && m.active);
  const sortedVoters = [...election.voters].sort((a, b) =>
    a.member.name.localeCompare(b.member.name),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{election.title}</h1>
          <p className="text-sm text-muted-foreground">
            Created by {election.createdBy.name} ·{" "}
            {election.createdAt.toLocaleString()}
            {election.closedAt &&
              ` · closed ${election.closedAt.toLocaleString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant[election.status]}>
            {election.status}
          </Badge>
          {!readOnly && election.status === "draft" && (
            <>
              <form action={openElection.bind(null, election.id)}>
                <Button type="submit">Open election</Button>
              </form>
              <form action={deleteElection.bind(null, election.id)}>
                <ConfirmButton
                  type="submit"
                  variant="destructive"
                  confirmMessage="Delete this draft election and everything in it? This cannot be undone."
                >
                  Delete draft
                </ConfirmButton>
              </form>
            </>
          )}
          {!readOnly && election.status === "open" && (
            <>
              {ballotRows.length === 0 && (
                <form action={revertElectionToDraft.bind(null, election.id)}>
                  <ConfirmButton
                    type="submit"
                    variant="outline"
                    confirmMessage="Revert this election to draft? The voter link/QR stops working and every contest returns to draft. (Only possible because no ballots have been cast.)"
                  >
                    Revert to draft
                  </ConfirmButton>
                </form>
              )}
              <form action={closeElection.bind(null, election.id)}>
                <ConfirmButton
                  type="submit"
                  variant="destructive"
                  confirmMessage="Close this election? Any contests still open will be closed and their results frozen."
                >
                  Close election
                </ConfirmButton>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Voter access */}
      <Card>
        <CardHeader>
          <CardTitle>Voter access</CardTitle>
          <CardDescription>
            Share this link or put the QR code on the projector. Voters pick
            their name from the roster — no login needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="Voter QR code" className="h-40 w-40" />
          <div className="flex flex-col gap-1">
            <code className="rounded bg-muted px-2 py-1 text-sm">{voteUrl}</code>
            <span className="text-xs text-muted-foreground">
              Active only while the election is open.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Contests */}
      <Card>
        <CardHeader>
          <CardTitle>Contests</CardTitle>
          <CardDescription>
            Add candidates while a contest is pending, then open it for
            voting. Closing a contest freezes the official IRV result.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {election.contests.map((c) => (
            <div key={c.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{c.title}</span>
                  <Badge variant={statusVariant[c.status]}>{c.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {ballotCount.get(c.id) ?? 0} /{" "}
                    {election.voters.length - c.exclusions.length} ballots
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!readOnly && c.status === "pending" && (
                    <>
                      <form action={openContest.bind(null, c.id)}>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={
                            election.status !== "open" ||
                            c.candidates.filter((x) => !x.withdrawn).length < 1
                          }
                        >
                          Open voting
                        </Button>
                      </form>
                      <form action={deleteContest.bind(null, c.id)}>
                        <Button type="submit" size="sm" variant="ghost">
                          Delete
                        </Button>
                      </form>
                    </>
                  )}
                  {!readOnly && c.status === "open" && (
                    <form action={closeContest.bind(null, c.id)}>
                      <ConfirmButton
                        type="submit"
                        size="sm"
                        variant="destructive"
                        confirmMessage={`Close voting for “${c.title}”? The result will be frozen.`}
                      >
                        Close voting
                      </ConfirmButton>
                    </form>
                  )}
                  {!readOnly &&
                    c.status === "closed" &&
                    election.status === "open" && (
                      <form action={reopenContest.bind(null, c.id)}>
                        <Button type="submit" size="sm" variant="outline">
                          Reopen voting
                        </Button>
                      </form>
                    )}
                  {!readOnly &&
                    c.status !== "pending" &&
                    (ballotCount.get(c.id) ?? 0) === 0 && (
                      <form action={revertContestToPending.bind(null, c.id)}>
                        <ConfirmButton
                          type="submit"
                          size="sm"
                          variant="ghost"
                          confirmMessage={`Revert “${c.title}” to draft? It’s unpublished from the ballot until you open voting again. Candidates and exclusions are kept.`}
                        >
                          Revert to draft
                        </ConfirmButton>
                      </form>
                    )}
                  {!readOnly && c.status === "closed" && (
                    <form
                      action={setResultsPublished.bind(
                        null,
                        c.id,
                        !c.resultsPublished,
                      )}
                    >
                      <Button
                        type="submit"
                        size="sm"
                        variant={c.resultsPublished ? "outline" : "secondary"}
                      >
                        {c.resultsPublished
                          ? "Hide results from voters"
                          : "Show results to voters"}
                      </Button>
                    </form>
                  )}
                  <Link
                    href={`/admin/elections/${election.id}/contests/${c.id}`}
                  >
                    <Button size="sm" variant="outline">
                      {c.status === "closed" ? "Results" : "Live results"}
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Official result (closed contests) */}
              {c.status === "closed" && c.result && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  {c.result.isTie ? (
                    <span className="font-medium text-amber-700">
                      Exact tie — to be resolved by the chair
                    </span>
                  ) : c.result.winnerCandidateId ? (
                    <span className="font-medium text-emerald-700">
                      🏆 Winner:{" "}
                      {c.candidates.find(
                        (x) => x.id === c.result!.winnerCandidateId,
                      )?.name ?? "Unknown"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      No winner — no ballots were cast
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    ({c.resultsPublished
                      ? "✓ visible to voters"
                      : "hidden from voters"})
                  </span>
                </div>
              )}

              {/* Candidates */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {c.candidates.map((cand) => (
                  <span
                    key={cand.id}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${
                      cand.withdrawn ? "line-through opacity-50" : ""
                    }`}
                  >
                    {cand.name}
                    {!readOnly && c.status !== "closed" && !cand.withdrawn && (
                      <form action={removeCandidate.bind(null, cand.id)}>
                        <button
                          type="submit"
                          className="ml-1 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${cand.name}`}
                        >
                          ×
                        </button>
                      </form>
                    )}
                  </span>
                ))}
                {c.candidates.length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    No candidates yet.
                  </span>
                )}
              </div>
              {!readOnly && c.status !== "closed" && (
                <form
                  action={addCandidate.bind(null, c.id)}
                  className="mt-3 flex max-w-sm gap-2"
                >
                  <Input name="name" placeholder="Candidate name" required />
                  <Button type="submit" size="sm" variant="secondary">
                    Add
                  </Button>
                </form>
              )}

              {/* Excluded voters — e.g. members up for this office */}
              {(c.exclusions.length > 0 ||
                (!readOnly && c.status !== "closed")) && (
                <div className="mt-3 border-t pt-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">
                      Not eligible to vote:
                    </span>
                    {c.exclusions.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        no one excluded
                      </span>
                    )}
                    {c.exclusions.map((x) => (
                      <span
                        key={x.memberId}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs"
                      >
                        {x.member.name}
                        {!readOnly && c.status !== "closed" && (
                          <form
                            action={includeVoter.bind(null, c.id, x.memberId)}
                          >
                            <button
                              type="submit"
                              className="ml-1 text-muted-foreground hover:text-destructive"
                              aria-label={`Allow ${x.member.name} to vote`}
                            >
                              ×
                            </button>
                          </form>
                        )}
                      </span>
                    ))}
                  </div>
                  {!readOnly && c.status !== "closed" && (
                    <form
                      action={excludeVoter.bind(null, c.id)}
                      className="mt-2 flex gap-2"
                    >
                      <select
                        name="memberId"
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        required
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Exclude a voter (e.g. a candidate)…
                        </option>
                        {sortedVoters
                          .filter(
                            (v) =>
                              !c.exclusions.some(
                                (x) => x.memberId === v.memberId,
                              ) &&
                              !votedByContest.get(c.id)?.has(v.memberId),
                          )
                          .map((v) => (
                            <option key={v.memberId} value={v.memberId}>
                              {v.member.name}
                            </option>
                          ))}
                      </select>
                      <Button type="submit" size="sm" variant="secondary">
                        Exclude
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}

          {!readOnly && election.status !== "closed" && (
            <form
              action={addContest.bind(null, election.id)}
              className="flex max-w-md gap-2"
            >
              <Input
                name="title"
                placeholder='New contest, e.g. "President"'
                required
              />
              <Button type="submit">Add contest</Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Voter list */}
      <Card>
        <CardHeader>
          <CardTitle>
            Eligible voters ({election.voters.length})
          </CardTitle>
          <CardDescription>
            Snapshot for this election. Members who already voted can’t be
            removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <form action={importActiveRoster.bind(null, election.id)}>
              <Button type="submit" variant="secondary" size="sm">
                Import active roster
              </Button>
            </form>
            {addable.length > 0 && (
              <form
                action={addVoter.bind(null, election.id)}
                className="flex gap-2"
              >
                <select
                  name="memberId"
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Add individual member…
                  </option>
                  {addable.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" variant="secondary">
                  Add
                </Button>
              </form>
            )}
          </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {sortedVoters.map((v) => (
              <div
                key={v.memberId}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {v.member.name}
                  {votedMembers.has(v.memberId) && (
                    <span className="ml-1 text-emerald-600">✓</span>
                  )}
                </span>
                {!readOnly && !votedMembers.has(v.memberId) && (
                  <form action={removeVoter.bind(null, election.id, v.memberId)}>
                    <button
                      type="submit"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${v.member.name}`}
                    >
                      ×
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
