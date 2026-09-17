"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { closeContest, reopenContest, resetBallot } from "@/lib/actions";
import type { IrvResult, EliminationReason } from "@/lib/irv";
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
    electionStatus: string;
  };
  candidates: { id: string; name: string; withdrawn: boolean }[];
  turnout: { voted: number; eligible: number; abstained: number };
  checklist: { memberId: string; name: string; voted: boolean }[];
  result: IrvResult;
}

const REASON_LABEL: Record<EliminationReason, string> = {
  lowest: "fewest first-choice votes",
  batch: "batch elimination (mathematically eliminated)",
  prior_round_tiebreak: "tie broken by prior-round count",
  random_tiebreak: "tie broken by seeded random draw",
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

  return (
    <div className="flex flex-col gap-6">
      {/* Status + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          variant={
            contest.status === "open"
              ? "success"
              : contest.status === "closed"
                ? "outline"
                : "secondary"
          }
        >
          {contest.status === "open" ? "voting open — live" : contest.status}
        </Badge>
        {canManage && contest.status === "open" && (
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() => {
              if (
                confirm(
                  "Close voting for this contest? The result will be frozen.",
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
        )}
        {canManage && contest.status === "closed" && contest.electionStatus === "open" && (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
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

      {/* Winner / tie banner */}
      {result.winner && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <div className="text-sm text-emerald-700">
            {contest.status === "closed" ? "Winner (official)" : "Current leader"}
          </div>
          <div className="text-2xl font-bold text-emerald-900">
            {name(result.winner)}
          </div>
        </div>
      )}
      {result.isTie && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="font-semibold text-amber-900">Exact tie</div>
          <p className="text-sm text-amber-800">
            The remaining candidates are exactly tied. Per Robert’s Rules the
            chair should resolve this (revote or lot) — the app won’t pick.
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
          <CardTitle>Instant-runoff rounds</CardTitle>
          <CardDescription>
            {contest.status === "open"
              ? "Recomputed live as ballots come in."
              : "Frozen official tally."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {result.rounds.length === 0 && (
            <p className="text-sm text-muted-foreground">No ballots yet.</p>
          )}
          {result.rounds.map((round) => {
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
                      className="text-xs underline hover:text-destructive disabled:opacity-50"
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
