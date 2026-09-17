"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface VoteState {
  election: { title: string; status: "draft" | "open" | "closed" };
  voters: { id: string; name: string }[];
  myVotedContestIds: string[];
  contests: {
    id: string;
    title: string;
    description: string | null;
    status: "pending" | "open" | "closed";
    /** True when this member is barred from voting in this contest. */
    excluded: boolean;
    /** Present only when the admin has published this contest's results. */
    result: { isTie: boolean; winnerName: string | null } | null;
    candidates: { id: string; name: string }[];
  }[];
}

const POLL_MS = 3000;

export function VoterApp({ slug }: { slug: string }) {
  const [state, setState] = useState<VoteState | null>(null);
  const [memberId, setMemberId] = useState<string>("");
  const [pendingId, setPendingId] = useState<string>("");
  const [gtidInput, setGtidInput] = useState<string>("");
  // GTID that passed server verification. Kept in sessionStorage (cleared
  // when the tab closes), and re-checked server-side on every ballot.
  const [verifiedGtid, setVerifiedGtid] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [abstains, setAbstains] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Remember who I am across refreshes on this device.
  useEffect(() => {
    const saved = localStorage.getItem(`cv-member-${slug}`);
    if (saved) setMemberId(saved);
    const g = sessionStorage.getItem(`cv-gtid-${slug}`);
    if (g !== null) setVerifiedGtid(g);
  }, [slug]);

  const refetch = useCallback(async () => {
    try {
      const qs = memberId ? `?memberId=${encodeURIComponent(memberId)}` : "";
      const res = await fetch(`/api/vote/${slug}/state${qs}`, {
        cache: "no-store",
      });
      if (res.ok) setState(await res.json());
    } catch {
      // transient — next poll will retry
    }
  }, [slug, memberId]);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, POLL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  if (!state) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const me = state.voters.find((v) => v.id === memberId);
  const loggedIn = !!me && verifiedGtid !== null;

  const verify = async (id: string, g: string): Promise<boolean> => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch(`/api/vote/${slug}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: id, gtid: g }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.error ?? "Verification failed.");
        return false;
      }
      sessionStorage.setItem(`cv-gtid-${slug}`, g);
      setVerifiedGtid(g);
      return true;
    } catch {
      setVerifyError("Network error — please try again.");
      return false;
    } finally {
      setVerifying(false);
    }
  };

  const lockIn = (id: string) => {
    setMemberId(id);
    setPendingId("");
    setGtidInput("");
    localStorage.setItem(`cv-member-${slug}`, id);
  };

  const logout = () => {
    setMemberId("");
    setPendingId("");
    setGtidInput("");
    setVerifiedGtid(null);
    setVerifyError(null);
    setDrafts({});
    localStorage.removeItem(`cv-member-${slug}`);
    sessionStorage.removeItem(`cv-gtid-${slug}`);
  };

  const rank = (contestId: string, candidateId: string) =>
    setDrafts((d) => ({
      ...d,
      [contestId]: [...(d[contestId] ?? []), candidateId],
    }));

  const unrank = (contestId: string, candidateId: string) =>
    setDrafts((d) => ({
      ...d,
      [contestId]: (d[contestId] ?? []).filter((c) => c !== candidateId),
    }));

  const move = (contestId: string, index: number, dir: -1 | 1) =>
    setDrafts((d) => {
      const list = [...(d[contestId] ?? [])];
      const j = index + dir;
      if (j < 0 || j >= list.length) return d;
      [list[index], list[j]] = [list[j], list[index]];
      return { ...d, [contestId]: list };
    });

  const submit = async (contestId: string) => {
    const abstaining = abstains[contestId] ?? false;
    // An abstention is an empty ballot — recorded, but ranks no one.
    const rankings = abstaining ? [] : (drafts[contestId] ?? []);
    if ((!abstaining && rankings.length === 0) || !memberId) return;
    setSubmitting(contestId);
    setErrors((e) => ({ ...e, [contestId]: "" }));
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contestId,
          memberId,
          gtid: verifiedGtid ?? "",
          rankings,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((e) => ({
          ...e,
          [contestId]: data.error ?? "Something went wrong.",
        }));
      } else {
        // Don't keep the ranking around on a shared device — ballots are
        // secret once cast.
        setDrafts((d) => {
          const { [contestId]: _, ...rest } = d;
          return rest;
        });
      }
      await refetch();
    } catch {
      setErrors((e) => ({
        ...e,
        [contestId]: "Network error — please try again.",
      }));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{state.election.title}</h1>
        {loggedIn && state.election.status === "draft" && (
          <p className="text-sm text-muted-foreground">
            Voting hasn’t opened yet. This page will update automatically.
          </p>
        )}
        {loggedIn && state.election.status === "closed" && (
          <p className="text-sm text-muted-foreground">
            This election is closed. Thanks for voting!
          </p>
        )}
      </div>

      {/* Identity: name → log in → GTID confirm, locked until "log out" */}
      {!memberId ? (
        <Card>
          <CardHeader>
            <CardTitle>Log in</CardTitle>
            <CardDescription>
              Select your name from the chapter roster.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={pendingId}
              onChange={(e) => {
                setPendingId(e.target.value);
                setVerifyError(null);
              }}
            >
              <option value="">Select your name…</option>
              {state.voters.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <Button disabled={!pendingId} onClick={() => lockIn(pendingId)}>
              Log in
            </Button>
          </CardContent>
        </Card>
      ) : me && verifiedGtid === null ? (
        <Card>
          <CardHeader>
            <CardTitle>Hi, {me.name}</CardTitle>
            <CardDescription>
              Enter your GTID to confirm it’s you.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              inputMode="numeric"
              autoComplete="off"
              placeholder="Your GTID (90XXXXXXX)"
              value={gtidInput}
              onChange={(e) => setGtidInput(e.target.value)}
            />
            {verifyError && (
              <p className="text-sm text-destructive">{verifyError}</p>
            )}
            <Button
              disabled={verifying}
              onClick={() => verify(memberId, gtidInput)}
            >
              {verifying ? "Checking…" : "Confirm"}
            </Button>
            <button
              onClick={logout}
              className="self-start text-xs text-muted-foreground underline hover:text-foreground"
            >
              Not {me.name}? Log out
            </button>
          </CardContent>
        </Card>
      ) : me ? (
        <div className="rounded-lg border bg-card px-4 py-3">
          <div className="font-medium">You’re voting as {me.name}.</div>
          <button
            onClick={logout}
            className="mt-0.5 text-xs text-muted-foreground underline hover:text-foreground"
          >
            Not {me.name}? Log out
          </button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card px-4 py-3">
          <div className="text-sm text-muted-foreground">
            Your saved name is no longer on the voter list.
          </div>
          <button
            onClick={logout}
            className="mt-0.5 text-xs text-muted-foreground underline hover:text-foreground"
          >
            Choose a different name
          </button>
        </div>
      )}

      {/* Contests — only visible once logged in */}
      {loggedIn &&
        state.contests.map((contest) => {
          const voted = state.myVotedContestIds.includes(contest.id);
          const abstain = abstains[contest.id] ?? false;
          const draft = drafts[contest.id] ?? [];
          const rankedSet = new Set(draft);
          const unranked = contest.candidates.filter(
            (c) => !rankedSet.has(c.id),
          );
          const cname = (id: string) =>
            contest.candidates.find((c) => c.id === id)?.name ?? "?";

          return (
            <Card key={contest.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{contest.title}</CardTitle>
                  <Badge
                    variant={
                      contest.status === "open"
                        ? "success"
                        : contest.status === "closed"
                          ? "outline"
                          : "secondary"
                    }
                  >
                    {contest.status === "pending"
                      ? "not open yet"
                      : contest.status}
                  </Badge>
                </div>
                {contest.description && (
                  <CardDescription>{contest.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {contest.excluded ? (
                  contest.status !== "pending" && (
                    <p className="text-sm text-muted-foreground">
                      You’re not eligible to vote in this contest.
                    </p>
                  )
                ) : contest.status === "closed" ? (
                  <div className="flex flex-col gap-2">
                    {voted ? (
                      <p className="text-sm font-medium text-emerald-700">
                        ✓ Your ballot was counted.
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        You didn’t cast a ballot in this contest.
                      </p>
                    )}
                    {contest.result &&
                      (contest.result.isTie ? (
                        <p className="text-sm font-medium text-amber-700">
                          Result: exact tie — to be resolved by the chair.
                        </p>
                      ) : contest.result.winnerName ? (
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
                          🏆 Winner: {contest.result.winnerName}
                        </div>
                      ) : null)}
                  </div>
                ) : contest.status !== "open" ? null : voted ? (
                  <div>
                    <p className="text-sm font-medium text-emerald-700">
                      ✓ Your ballot is in.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Made a mistake? The person running the election can
                      reset your ballot so you can vote again. Note that this
                      action is irreversible and permanently discards your
                      previous vote. No officer is able to see individualized
                      votes for any contests voted on using this system.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Ranked so far */}
                    {!abstain && (
                    <div>
                      <div className="mb-1 text-sm font-medium">
                        Your ranking
                      </div>
                      {draft.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Tap candidates below in order of preference — first
                          tap is your first choice. You don’t have to rank
                          everyone.
                        </p>
                      ) : (
                        <ol className="flex flex-col gap-1">
                          {draft.map((cid, i) => (
                            <li
                              key={cid}
                              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                            >
                              <span className="w-5 font-bold">{i + 1}.</span>
                              <span className="flex-1">{cname(cid)}</span>
                              <button
                                onClick={() => move(contest.id, i, -1)}
                                disabled={i === 0}
                                className="px-1 text-muted-foreground disabled:opacity-30"
                                aria-label="Move up"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => move(contest.id, i, 1)}
                                disabled={i === draft.length - 1}
                                className="px-1 text-muted-foreground disabled:opacity-30"
                                aria-label="Move down"
                              >
                                ↓
                              </button>
                              <button
                                onClick={() => unrank(contest.id, cid)}
                                className="px-1 text-muted-foreground hover:text-destructive"
                                aria-label="Remove"
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                    )}

                    {/* Unranked candidates */}
                    {!abstain && unranked.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {unranked.map((c) => (
                          <Button
                            key={c.id}
                            variant="outline"
                            size="sm"
                            onClick={() => rank(contest.id, c.id)}
                          >
                            + {c.name}
                          </Button>
                        ))}
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={abstain}
                        onChange={(e) =>
                          setAbstains((a) => ({
                            ...a,
                            [contest.id]: e.target.checked,
                          }))
                        }
                      />
                      Abstain from this vote
                    </label>
                    {abstain && (
                      <p className="text-xs text-muted-foreground">
                        Your ballot will be recorded as an abstention — it
                        won’t count toward any candidate.
                      </p>
                    )}

                    {errors[contest.id] && (
                      <p className="text-sm text-destructive">
                        {errors[contest.id]}
                      </p>
                    )}

                    <Button
                      onClick={() => submit(contest.id)}
                      disabled={
                        (!abstain && draft.length === 0) ||
                        submitting === contest.id
                      }
                    >
                      {submitting === contest.id
                        ? "Submitting…"
                        : abstain
                          ? "Submit abstention"
                          : "Submit ballot"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
