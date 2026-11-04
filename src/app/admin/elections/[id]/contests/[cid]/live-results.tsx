"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  closeContest,
  closeContestAndPublish,
  reopenContest,
  resetBallot,
  setContestPaused,
  setResultsPublished,
} from "@/lib/actions";
import type { MultiSeatIrvResult, EliminationReason } from "@/lib/irv";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ResultsPayload {
  viewerRole: "admin" | "observer";
  contest: {
    id: string;
    title: string;
    status: "pending" | "open" | "closed";
    seats: number;
    method: "ranked" | "single";
    paused: boolean;
    resultsPublished: boolean;
    electionStatus: string;
  };
  candidates: { id: string; name: string; withdrawn: boolean }[];
  turnout: { voted: number; eligible: number; abstained: number };
  checklist: { memberId: string; name: string; voted: boolean }[];
  result: MultiSeatIrvResult;
}

const REASON_LABEL: Record<EliminationReason, string> = {
  lowest: "fewest first-choice votes",
  batch: "batch elimination (mathematically eliminated)",
  prior_round_tiebreak: "tie broken by prior-round count",
};

const POLL_MS = 3000;

export function LiveResults({ contestId }: { contestId: string }) {
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/contests/${contestId}/results`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    }
  }, [contestId]);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, POLL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        {error ? `Couldn’t load results (${error}) — retrying…` : "Loading…"}
      </p>
    );
  }

  const names = new Map(data.candidates.map((c) => [c.id, c.name]));
  const name = (id: string | null) =>
    (id && names.get(id)) || "Unknown candidate";
  const { result, turnout, checklist, contest } = data;
  const canManage = data.viewerRole === "admin";
  const pct =
    turnout.eligible > 0
      ? Math.round((turnout.voted / turnout.eligible) * 100)
      : 0;
  const notVoted = checklist.filter((v) => !v.voted);
  const voted = checklist.filter((v) => v.voted);
  const multiSeat = contest.seats > 1;
  // A plain multiple-choice contest is one count, not a series of rounds.
  const isRanked = contest.method !== "single";

  return (
    <div className="flex flex-col gap-6">
      {/* Status + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          variant={
            contest.status === "open"
              ? contest.paused
                ? "destructive"
                : "success"
              : contest.status === "closed"
                ? "outline"
                : "secondary"
          }
        >
          {contest.status === "open"
            ? contest.paused
              ? "voting paused"
              : "voting open — live"
            : contest.status === "pending"
              ? "draft"
              : contest.status}
        </Badge>
        {canManage && contest.status === "open" && (
          <>
            <Button
              size="sm"
              variant={contest.paused ? "warning" : "secondary"}
              disabled={isPending}
              disabledReason="Working — please wait…"
              hint={
                contest.paused
                  ? undefined
                  : "Stops new ballots without closing the contest — use it while you reset a ballot or exclude someone."
              }
              onClick={() =>
                startTransition(async () => {
                  await setContestPaused(contestId, !contest.paused);
                  await refetch();
                })
              }
            >
              {contest.paused ? "Resume voting" : "Pause voting"}
            </Button>
            <Button
              size="sm"
              disabled={isPending}
              disabledReason="Working — please wait…"
              onClick={() => {
                if (
                  confirm(
                    "Close voting for this contest and put the result on the projector?",
                  )
                ) {
                  startTransition(async () => {
                    await closeContestAndPublish(contestId);
                    await refetch();
                  });
                }
              }}
            >
              Close Voting and Display Results
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isPending}
              disabledReason="Working — please wait…"
              onClick={() => {
                if (
                  confirm(
                    "Close voting for this contest? The result will be frozen but not shown on the projector yet.",
                  )
                ) {
                  startTransition(async () => {
                    await closeContest(contestId);
                    await refetch();
                  });
                }
              }}
            >
              Close voting
            </Button>
          </>
        )}
        {canManage && contest.status === "closed" && (
          <Button
            size="sm"
            variant={contest.resultsPublished ? "outline" : "secondary"}
            disabled={isPending}
            disabledReason="Working — please wait…"
            onClick={() =>
              startTransition(async () => {
                await setResultsPublished(contestId, !contest.resultsPublished);
                await refetch();
              })
            }
          >
            {contest.resultsPublished
              ? "Hide result from projector"
              : "Show result on projector"}
          </Button>
        )}
        {canManage && contest.status === "closed" && contest.electionStatus === "open" && (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            disabledReason="Working — please wait…"
            onClick={() =>
              startTransition(async () => {
                await reopenContest(contestId);
                await refetch();
              })
            }
          >
            Reopen voting
          </Button>
        )}
        {error && (
          <span className="text-xs text-destructive">
            Connection issue — retrying
          </span>
        )}
      </div>

      {/* Winner(s) / tie banner */}
      {result.winners.length > 0 && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <div className="text-sm text-emerald-700">
            {multiSeat
              ? `${contest.status === "closed" ? "Elected" : "Currently winning"} — ${result.winners.length} of ${contest.seats} seat${contest.seats === 1 ? "" : "s"} filled`
              : contest.status === "closed"
                ? "Winner (official)"
                : "Current leader"}
          </div>
          {multiSeat ? (
            <ol className="mt-1 flex flex-col gap-0.5">
              {result.winners.map((w, i) => (
                <li key={w} className="text-lg font-bold text-emerald-900">
                  <span className="mr-2 text-sm font-normal text-emerald-700">
                    Seat {i + 1}
                  </span>
                  {name(w)}
                </li>
              ))}
            </ol>
          ) : (
            <div className="text-2xl font-bold text-emerald-900">
              {name(result.winners[0])}
            </div>
          )}
        </div>
      )}
      {result.isTie && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
          <div className="font-semibold text-amber-900">
            Tie — no winner declared{multiSeat && ` for seat ${result.winners.length + 1}`}
          </div>
          <p className="mt-1 text-sm text-amber-900">
            The count cannot separate these candidates:{" "}
            <span className="font-semibold">
              {result.tiedCandidates.map(name).join(", ") || "—"}
            </span>
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Breaking this tie would require picking by chance, which this
            system will not do. Announce the tie to the chapter and hold a
            revote{multiSeat && " for the remaining seat(s)"}.
            {result.winners.length > 0 &&
              multiSeat &&
              " Seats already awarded above were decided outright and stand."}
          </p>
        </div>
      )}
      {!result.isTie &&
        contest.status === "closed" &&
        result.winners.length < contest.seats && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <div className="font-semibold text-amber-900">
              {contest.seats - result.winners.length} seat(s) unfilled
            </div>
            <p className="text-sm text-amber-800">
              No remaining candidate had any support left on the continuing
              ballots, so the count couldn’t fill every seat. The chapter will
              need to re-nominate or hold another vote for the rest.
            </p>
          </div>
        )}

      {/* Turnout */}
      <Card>
        <CardHeader>
          <CardTitle>
            Turnout: {turnout.voted} / {turnout.eligible} ({pct}%)
            {turnout.abstained > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                · {turnout.abstained} abstained
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* IRV rounds */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isRanked ? "Instant-runoff rounds" : "Vote count"}
          </CardTitle>
          <CardDescription>
            {contest.status === "open"
              ? "Recomputed live as ballots come in."
              : "Frozen official tally."}
            {isRanked
              ? multiSeat &&
                " Seats are awarded one at a time; each winner is removed from all ballots before the next seat is counted."
              : " Each voter picked one option; abstentions are excluded from the vote count."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {result.seatResults.length === 0 && (
            <p className="text-sm text-muted-foreground">No ballots yet.</p>
          )}
          {result.seatResults.map((seatResult) => (
            <div key={seatResult.seat} className="flex flex-col gap-3">
              {multiSeat && isRanked && (
                <div className="flex items-center gap-2 border-b pb-1">
                  <span className="font-semibold">Seat {seatResult.seat}</span>
                  {seatResult.winner ? (
                    <span className="text-sm text-emerald-700">
                      → {name(seatResult.winner)}
                    </span>
                  ) : (
                    <span className="text-sm text-amber-700">
                      → unresolved tie
                    </span>
                  )}
                </div>
              )}
              {seatResult.rounds.map((round) => {
            const eliminatedIds = new Set(
              round.eliminated.map((e) => e.candidateId),
            );
            const rows = Object.entries(round.tally).sort(
              (a, b) => b[1] - a[1],
            );
            const total = rows.reduce((s, [, n]) => s + n, 0);
            return (
              <div key={round.round} className="rounded-lg border p-4">
                <div className="mb-2 font-medium">Round {round.round}</div>
                <div className="flex flex-col gap-1">
                  {rows.map(([cid, votes]) => (
                    <div key={cid} className="flex items-center gap-2 text-sm">
                      <span
                        className={`w-40 truncate ${
                          eliminatedIds.has(cid)
                            ? "text-muted-foreground line-through"
                            : ""
                        }`}
                      >
                        {name(cid)}
                      </span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                        <div
                          className={`h-full ${
                            eliminatedIds.has(cid)
                              ? "bg-muted-foreground/40"
                              : "bg-primary"
                          }`}
                          style={{
                            width: total > 0 ? `${(votes / total) * 100}%` : 0,
                          }}
                        />
                      </div>
                      <span className="w-8 text-right tabular-nums">
                        {votes}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {round.exhaustedBallots > 0 && (
                    <span>{round.exhaustedBallots} exhausted ballot(s)</span>
                  )}
                  {round.eliminated.map((e) => (
                    <span key={e.candidateId}>
                      Eliminated {name(e.candidateId)} — {REASON_LABEL[e.reason]}
                    </span>
                  ))}
                  {round.notes.map((n, i) => (
                    <span key={i}>{n}</span>
                  ))}
                </div>
              </div>
            );
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Who has / hasn't voted */}
      <Card>
        <CardHeader>
          <CardTitle>Roster check</CardTitle>
          <CardDescription>
            Ballots are secret — this only shows who has turned one in. While
            voting is open, “reset” nullifies someone’s ballot (permanently
            discarded, never viewed) so they can vote again — e.g. after
            voting under the wrong name.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-medium text-amber-700">
              Hasn’t voted ({notVoted.length})
            </div>
            <div className="flex flex-col gap-1 text-sm">
              {notVoted.map((v) => (
                <span key={v.memberId}>{v.name}</span>
              ))}
              {notVoted.length === 0 && (
                <span className="text-muted-foreground">
                  Everyone has voted 🎉
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium text-emerald-700">
              Voted ({voted.length})
            </div>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              {voted.map((v) => (
                <div
                  key={v.memberId}
                  className="flex items-center justify-between gap-2"
                >
                  <span>✓ {v.name}</span>
                  {canManage && contest.status === "open" && (
                    <button
                      disabled={isPending}
                      title={isPending ? "Working — please wait…" : undefined}
                      onClick={() => {
                        if (
                          confirm(
                            `Reset ${v.name}’s ballot for “${contest.title}”? ` +
                              `Their vote will be permanently discarded (contents are never shown) and they can vote again.`,
                          )
                        ) {
                          startTransition(async () => {
                            await resetBallot(contestId, v.memberId);
                            await refetch();
                          });
                        }
                      }}
                      className="text-xs underline hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      reset
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
