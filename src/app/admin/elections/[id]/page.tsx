import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { db } from "@/db";
import * as t from "@/db/schema";
import {
  addCandidate,
  addVoter,
  closeElection,
  deleteElection,
  excludeVoter,
  importActiveRoster,
  includeVoter,
  openElection,
  removeCandidate,
  removeVoter,
  reopenElection,
  revertElectionToDraft,
} from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { ImportAttendees } from "./import-attendees";
import { AddContestDialog } from "./add-contest-dialog";
import { CollapseToggle } from "./collapse-toggle";
import { ContestActions } from "./contest-actions";
import { InfoHint } from "@/components/info-hint";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const SEATS_HINT =
  "Useful for elections where the top X candidates are chosen, such as " +
  "J-Board elections. For all normal elections, this value should be 1.";

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
  // Keyed by the election id, not the voter slug — voters have the slug, and
  // turnout is deliberately hidden from their own screens.
  const displayUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/display/${election.id}`;
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
          <h1 className="m3-headline">{election.title}</h1>
          <p className="m3-body text-on-surface-variant">
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
          {!readOnly && (
            <>
              {/* Only the actions that apply right now — anything that
                  doesn't simply isn't rendered. */}
              {election.status === "draft" && (
                <>
                  <form action={openElection.bind(null, election.id)}>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={election.contests.length === 0}
                      disabledReason="Add at least one contest before opening the election."
                    >
                      Open election
                    </Button>
                  </form>
                  <form action={deleteElection.bind(null, election.id)}>
                    <ConfirmButton
                      type="submit"
                      size="sm"
                      variant="destructive"
                      confirmMessage="Delete this draft election and everything in it? This cannot be undone."
                    >
                      Delete draft
                    </ConfirmButton>
                  </form>
                </>
              )}

              {election.status === "open" && (
                <>
                  <form action={closeElection.bind(null, election.id)}>
                    <ConfirmButton
                      type="submit"
                      size="sm"
                      variant="destructive"
                      confirmMessage="Close this election? Any contests still open will be closed and their results frozen."
                    >
                      Close election
                    </ConfirmButton>
                  </form>
                  {ballotRows.length === 0 && (
                    <form
                      action={revertElectionToDraft.bind(null, election.id)}
                    >
                      <ConfirmButton
                        type="submit"
                        size="sm"
                        variant="outlined"
                        confirmMessage="Revert this election to draft? The voter link/QR stops working and every contest returns to draft."
                      >
                        Revert to draft
                      </ConfirmButton>
                    </form>
                  )}
                </>
              )}

              {election.status === "closed" && (
                <form action={reopenElection.bind(null, election.id)}>
                  <ConfirmButton
                    type="submit"
                    size="sm"
                    variant="outlined"
                    confirmMessage="Reopen this election? Contests stay closed with their results intact; you can then reopen individual contests."
                  >
                    Reopen election
                  </ConfirmButton>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {/* Voter access + projector, side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Voter access</CardTitle>
            <CardDescription>
              Share this link or put the QR code on the projector. Voters
              pick their name from the roster — no login needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="Voter QR code"
              className="h-32 w-32 rounded-sm bg-white p-1"
            />
            <div className="flex min-w-0 flex-col gap-1">
              <code className="truncate rounded-xs bg-surface-highest px-2 py-1 text-sm">
                {voteUrl}
              </code>
              <span className="m3-body-sm text-on-surface-variant">
                Active only while the election is open.
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projector view</CardTitle>
            <CardDescription>
              A full-screen turnout counter. No login needed, and it shows
              counts and published winners only — never names or ballots.
              It’s a different address from the voting link precisely so
              voters can’t reach it from their phones.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3">
            <a href={displayUrl} target="_blank" rel="noreferrer">
              <Button variant="tonal" size="sm">
                Open projector view ↗
              </Button>
            </a>
            <code className="w-full truncate rounded-xs bg-surface-highest px-2 py-1 text-xs">
              {displayUrl}
            </code>
          </CardContent>
        </Card>
      </div>

      {/* Contests */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle>Contests</CardTitle>
              <CardDescription>
                Add candidates while a contest is a draft, then open it for
                voting. Closing a contest freezes the official result.
              </CardDescription>
            </div>
            {!readOnly && (
              <AddContestDialog
                electionId={election.id}
                disabledReason={
                  election.status === "closed"
                    ? "This election is closed — no more contests can be added."
                    : undefined
                }
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {election.contests.map((c) => (
            <div
              key={c.id}
              className={`rounded-lg border ${
                c.collapsed ? "bg-surface-low px-3 py-2" : "p-4"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  {!readOnly && (
                    <CollapseToggle
                      contestId={c.id}
                      collapsed={c.collapsed}
                      canToggle={c.status !== "open"}
                      title={c.title}
                    />
                  )}
                  <span className="m3-title">{c.title}</span>
                  <Badge
                    variant={
                      c.status === "open" && c.paused
                        ? "destructive"
                        : statusVariant[c.status]
                    }
                  >
                    {c.status === "pending"
                      ? "draft"
                      : c.status === "open" && c.paused
                        ? "paused"
                        : c.status}
                  </Badge>
                  {c.seats > 1 && (
                    <Badge variant="outline">{c.seats} seats</Badge>
                  )}
                  <Badge variant="secondary">
                    {c.method === "single" ? "multiple choice" : "ranked"}
                  </Badge>
                  <span className="m3-body-sm text-on-surface-variant">
                    {ballotCount.get(c.id) ?? 0} /{" "}
                    {election.voters.length - c.exclusions.length} ballots
                  </span>
                  {/* Collapsed rows keep the result inline, so the page
                      reads as a summary of the night at a glance. */}
                  {c.collapsed && c.result && (
                    <span className="m3-body-sm font-semibold text-tertiary">
                      {(() => {
                        const won =
                          c.result.winners ??
                          (c.result.winnerCandidateId
                            ? [c.result.winnerCandidateId]
                            : []);
                        if (won.length === 0) {
                          return c.result.isTie ? "⚠️ Tie — revote required" : "";
                        }
                        const nameOf = (id: string) =>
                          c.candidates.find((x) => x.id === id)?.name ??
                          "Unknown";
                        return `🏆 ${won.map(nameOf).join(", ")}`;
                      })()}
                    </span>
                  )}
                </div>
                {!c.collapsed && (
                  <ContestActions
                    contest={c}
                    election={election}
                    readOnly={readOnly}
                    ballots={ballotCount.get(c.id) ?? 0}
                    otherOpenTitle={
                      election.contests.find(
                        (x) => x.status === "open" && x.id !== c.id,
                      )?.title
                    }
                  />
                )}
              </div>

              {/* Official result (closed contests) */}
              {!c.collapsed && c.status === "closed" && c.result && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  {(() => {
                    const won =
                      c.result.winners ??
                      (c.result.winnerCandidateId
                        ? [c.result.winnerCandidateId]
                        : []);
                    const nameOf = (id: string) =>
                      c.candidates.find((x) => x.id === id)?.name ?? "Unknown";
                    if (won.length === 0) {
                      return c.result.isTie ? (
                        <span className="font-medium text-amber-700">
                          ⚠️ Tie — no winner. A revote is required; see
                          Results for who is tied.
                        </span>
                      ) : (
                        <span className="text-on-surface-variant">
                          No winner — no ballots were cast
                        </span>
                      );
                    }
                    return (
                      <span className="font-medium text-emerald-700">
                        🏆 {c.seats > 1 ? "Elected" : "Winner"}:{" "}
                        {won.map(nameOf).join(", ")}
                        {c.seats > 1 && ` (${won.length} of ${c.seats} seats)`}
                        {c.result.isTie && (
                          <span className="ml-1 font-normal text-amber-700">
                            — ⚠️ remaining seat(s) tied; a revote is required
                          </span>
                        )}
                      </span>
                    );
                  })()}
                  <span className="text-xs text-on-surface-variant">
                    ({c.resultsPublished
                      ? "✓ on the projector"
                      : "not on the projector"})
                  </span>
                </div>
              )}

              {/* Candidates */}
              {!c.collapsed && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {c.candidates.map((cand) => (
                  <span
                    key={cand.id}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${
                      cand.withdrawn ? "line-through opacity-50" : ""
                    }`}
                  >
                    {cand.name}
                    {!readOnly && !cand.withdrawn && (
                      <form action={removeCandidate.bind(null, cand.id)}>
                        <button
                          type="submit"
                          disabled={c.status === "closed"}
                          title={
                            c.status === "closed"
                              ? "This contest is closed — its candidates are part of the final record."
                              : c.status === "open"
                                ? `Withdraw ${cand.name}. Ballots already cast skip over them.`
                                : `Remove ${cand.name}`
                          }
                          className="ml-1 text-on-surface-variant hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Remove ${cand.name}`}
                        >
                          ×
                        </button>
                      </form>
                    )}
                  </span>
                ))}
                {c.candidates.length === 0 && (
                  <span className="text-sm text-on-surface-variant">
                    No candidates yet.
                  </span>
                )}
              </div>
              )}
              {!readOnly && !c.collapsed && (
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <form
                    action={addCandidate.bind(null, c.id)}
                    className="flex max-w-sm gap-2"
                  >
                    <Input
                      name="name"
                      placeholder={
                        c.method === "single" ? "Option name" : "Candidate name"
                      }
                      required
                      disabled={c.status === "closed"}
                      title={
                        c.status === "closed"
                          ? "This contest is closed — its candidate list is part of the final record."
                          : undefined
                      }
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="tonal"
                      disabled={c.status === "closed"}
                      disabledReason="This contest is closed — its candidate list is part of the final record."
                    >
                      Add
                    </Button>
                  </form>
                </div>
              )}

              {/* Excluded voters — e.g. members up for this office */}
              {!c.collapsed && (c.exclusions.length > 0 || !readOnly) && (
                <div className="mt-3 border-t pt-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-xs font-medium text-on-surface-variant">
                      Not eligible to vote:
                    </span>
                    {c.exclusions.length === 0 && (
                      <span className="text-xs text-on-surface-variant">
                        no one excluded
                      </span>
                    )}
                    {c.exclusions.map((x) => (
                      <span
                        key={x.memberId}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs"
                      >
                        {x.member.name}
                        {!readOnly && (
                          <form
                            action={includeVoter.bind(null, c.id, x.memberId)}
                          >
                            <button
                              type="submit"
                              disabled={c.status === "closed"}
                              title={
                                c.status === "closed"
                                  ? "This contest is closed — its eligibility list is part of the final record."
                                  : `Allow ${x.member.name} to vote again`
                              }
                              className="ml-1 text-on-surface-variant hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`Allow ${x.member.name} to vote`}
                            >
                              ×
                            </button>
                          </form>
                        )}
                      </span>
                    ))}
                  </div>
                  {!readOnly && (
                    <form
                      action={excludeVoter.bind(null, c.id)}
                      className="mt-2 flex gap-2"
                    >
                      <Select
                        name="memberId"
                        required
                        placeholder="Exclude a voter (e.g. a candidate)…"
                        disabled={c.status === "closed"}
                        className="h-10 min-w-64"
                        title={
                          c.status === "closed"
                            ? "This contest is closed — its eligibility list is part of the final record."
                            : undefined
                        }
                        options={sortedVoters
                          .filter(
                            (v) =>
                              !c.exclusions.some(
                                (x) => x.memberId === v.memberId,
                              ) &&
                              !votedByContest.get(c.id)?.has(v.memberId),
                          )
                          .map((v) => ({
                            value: v.memberId,
                            label: v.member.name,
                          }))}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="tonal"
                        disabled={c.status === "closed"}
                        disabledReason="This contest is closed — its eligibility list is part of the final record."
                      >
                        Exclude
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}

        </CardContent>
      </Card>

      {/* Voter list */}
      <Card>
        <CardHeader>
          <CardTitle>
            Eligible voters ({election.voters.length})
          </CardTitle>
          <CardDescription>
            Snapshot for this election. “Import active roster” adds everyone
            on the chapter roster; “Import Attendees” sets the list to
            exactly who’s in the room. Members who already voted can’t be
            removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <form action={importActiveRoster.bind(null, election.id)}>
              <Button
                type="submit"
                variant="tonal"
                size="sm"
                disabled={election.status === "closed"}
                disabledReason="This election is closed — its voter list is part of the final record."
              >
                Import active roster
              </Button>
            </form>
            <ImportAttendees
              electionId={election.id}
              disabledReason={
                election.status === "closed"
                  ? "This election is closed — its voter list is part of the final record."
                  : undefined
              }
            />
            {(() => {
              const addReason =
                election.status === "closed"
                  ? "This election is closed — its voter list is part of the final record."
                  : addable.length === 0
                    ? "Everyone active on the chapter roster is already on this election's voter list. Add them on the Roster page first."
                    : undefined;
              return (
                <form
                  action={addVoter.bind(null, election.id)}
                  className="flex gap-2"
                >
                  <Select
                    name="memberId"
                    required
                    placeholder="Add individual member…"
                    disabled={!!addReason}
                    title={addReason}
                    className="h-10 min-w-56"
                    options={addable.map((m) => ({
                      value: m.id,
                      label: m.name,
                    }))}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="tonal"
                    disabled={!!addReason}
                    disabledReason={addReason}
                  >
                    Add
                  </Button>
                </form>
              );
            })()}
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
                {!readOnly && (
                  <form action={removeVoter.bind(null, election.id, v.memberId)}>
                    <button
                      type="submit"
                      disabled={
                        votedMembers.has(v.memberId) ||
                        election.status === "closed"
                      }
                      title={
                        votedMembers.has(v.memberId)
                          ? `${v.member.name} has already cast a ballot in this election, so they can't be removed. Reset their ballot on the results page first.`
                          : election.status === "closed"
                            ? "This election is closed — its voter list is part of the final record."
                            : `Remove ${v.member.name}`
                      }
                      className="text-on-surface-variant hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
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
