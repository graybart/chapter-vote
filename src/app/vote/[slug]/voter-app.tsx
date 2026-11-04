"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

interface ActiveContest {
  id: string;
  title: string;
  description: string | null;
  seats: number;
  method: "ranked" | "single";
  paused: boolean;
  excluded: boolean;
  voted: boolean;
  candidates: { id: string; name: string }[];
}

interface VoteState {
  election: { title: string; status: "draft" | "open" | "closed" };
  voters: { id: string; name: string }[];
  activeContest: ActiveContest | null;
}

const POLL_MS = 3000;

/**
 * Kiosk-style voting screen, modelled on a handheld clicker: the voter logs
 * in once at the start of the meeting and then this screen simply follows
 * the chair. Exactly one contest is open at a time, so there's nothing to
 * scroll and nothing to choose between — it's either "waiting for the next
 * vote" or a live ballot.
 */
export function VoterApp({ slug }: { slug: string }) {
  const [state, setState] = useState<VoteState | null>(null);
  const [memberId, setMemberId] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [gtidInput, setGtidInput] = useState("");
  // Verified GTID persists for the whole meeting (see lockIn/logout) so a
  // locked phone or a reloaded tab doesn't mean re-authenticating.
  const [verifiedGtid, setVerifiedGtid] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [ranking, setRanking] = useState<string[]>([]);
  const [abstain, setAbstain] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which contest the on-screen draft belongs to, so a new contest opening
  // never inherits the previous one's selections.
  const lastContestId = useRef<string | null>(null);

  useEffect(() => {
    const savedMember = localStorage.getItem(`cv-member-${slug}`);
    if (savedMember) setMemberId(savedMember);
    const savedGtid = localStorage.getItem(`cv-gtid-${slug}`);
    if (savedGtid !== null) setVerifiedGtid(savedGtid);
  }, [slug]);

  const refetch = useCallback(async () => {
    try {
      const qs = memberId ? `?memberId=${encodeURIComponent(memberId)}` : "";
      const res = await fetch(`/api/vote/${slug}/state${qs}`, {
        cache: "no-store",
      });
      if (res.ok) setState(await res.json());
    } catch {
      // transient — the next poll retries
    }
  }, [slug, memberId]);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, POLL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  // Clear the draft whenever the chair moves to a different contest.
  const activeId = state?.activeContest?.id ?? null;
  useEffect(() => {
    if (lastContestId.current !== activeId) {
      lastContestId.current = activeId;
      setRanking([]);
      setAbstain(false);
      setError(null);
    }
  }, [activeId]);

  const verify = async (id: string, g: string) => {
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
      localStorage.setItem(`cv-gtid-${slug}`, g);
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
    setRanking([]);
    setAbstain(false);
    localStorage.removeItem(`cv-member-${slug}`);
    localStorage.removeItem(`cv-gtid-${slug}`);
  };

  const submit = async () => {
    const contest = state?.activeContest;
    if (!contest || !memberId) return;
    const rankings = abstain ? [] : ranking;
    if (!abstain && rankings.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contestId: contest.id,
          memberId,
          gtid: verifiedGtid ?? "",
          rankings,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      else {
        // Don't leave the selection on screen on a shared device.
        setRanking([]);
        setAbstain(false);
      }
      await refetch();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!state) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const me = state.voters.find((v) => v.id === memberId);
  const loggedIn = !!me && verifiedGtid !== null;
  const contest = state.activeContest;

  // ---- Not logged in yet: name, then GTID -------------------------------
  if (!memberId) {
    return (
      <Shell title={state.election.title}>
        <Card>
          <CardHeader>
            <CardTitle>Log in</CardTitle>
            <CardDescription>
              Select your name from the chapter roster.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <select
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
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
            <Button
              size="lg"
              disabled={!pendingId}
              disabledReason="Choose your name from the list above first."
              onClick={() => lockIn(pendingId)}
            >
              Log in
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (me && verifiedGtid === null) {
    return (
      <Shell title={state.election.title}>
        <Card>
          <CardHeader>
            <CardTitle>Hi, {me.name}</CardTitle>
            <CardDescription>Enter your GTID to confirm it’s you.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              inputMode="numeric"
              autoComplete="off"
              placeholder="Your GTID (90XXXXXXX)"
              value={gtidInput}
              onChange={(e) => setGtidInput(e.target.value)}
              className="h-11 text-base"
            />
            {verifyError && (
              <p className="text-sm text-destructive">{verifyError}</p>
            )}
            <Button
              size="lg"
              disabled={verifying}
              disabledReason="Checking your GTID…"
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
      </Shell>
    );
  }

  if (!me) {
    return (
      <Shell title={state.election.title}>
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <p className="text-sm text-muted-foreground">
              Your saved name is no longer on the voter list for this election.
            </p>
            <button
              onClick={logout}
              className="self-start text-xs text-muted-foreground underline hover:text-foreground"
            >
              Choose a different name
            </button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // ---- Logged in: follow the chair --------------------------------------
  const waiting = !contest;

  return (
    <Shell title={state.election.title} who={me.name} onLogout={logout}>
      {waiting ? (
        <WaitingCard electionStatus={state.election.status} />
      ) : contest.excluded ? (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/40">
          <CardHeader>
            <CardTitle className="text-amber-900 dark:text-amber-100">{contest.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-amber-900 dark:text-amber-100">
              You’re not eligible to vote in this one. The screen will move on
              by itself when the next vote opens.
            </p>
          </CardContent>
        </Card>
      ) : contest.paused && !contest.voted ? (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/40">
          <CardHeader>
            <CardTitle className="text-amber-900 dark:text-amber-100">
              Voting is paused
            </CardTitle>
            <CardDescription className="text-amber-800 dark:text-amber-200/90">
              {contest.title}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-900 dark:text-amber-100">
              The person running the election has paused this vote for a
              moment. Keep this page open — your ballot will come back by
              itself when voting resumes.
            </p>
          </CardContent>
        </Card>
      ) : contest.voted ? (
        <Card className="border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-950/40">
          <CardHeader>
            <CardTitle className="text-emerald-900 dark:text-emerald-100">
              ✓ Your vote is in
            </CardTitle>
            <CardDescription className="text-emerald-800 dark:text-emerald-200/90">
              {contest.title}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm text-emerald-900 dark:text-emerald-100">
              Hold tight — this screen will show the next vote automatically.
            </p>
            <p className="text-xs text-emerald-800/80 dark:text-emerald-200/70">
              Made a mistake? The person running the election can reset your
              ballot so you can vote again. Note that this action is
              irreversible and permanently discards your previous vote. No
              one, including officers, is able to see individualized votes
              for any contests voted on using this system.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Ballot
          contest={contest}
          ranking={ranking}
          setRanking={setRanking}
          abstain={abstain}
          setAbstain={setAbstain}
          submitting={submitting}
          error={error}
          onSubmit={submit}
        />
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------

function Shell({
  title,
  who,
  onLogout,
  children,
}: {
  title: string;
  who?: string;
  onLogout?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {who && (
          <div className="mt-0.5 text-sm text-muted-foreground">
            Voting as <span className="font-medium">{who}</span>
            {onLogout && (
              <>
                {" · "}
                <button
                  onClick={onLogout}
                  className="underline hover:text-foreground"
                >
                  Not {who}? Log out
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function WaitingCard({
  electionStatus,
}: {
  electionStatus: "draft" | "open" | "closed";
}) {
  const closed = electionStatus === "closed";
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        {!closed && (
          <span className="flex h-3 w-3">
            <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
        )}
        <p className="text-lg font-semibold">
          {closed ? "Voting has concluded" : "Waiting for the next vote"}
        </p>
        {!closed && (
          <p className="max-w-xs text-sm text-muted-foreground">
            Keep this page open. When the next vote opens, your ballot will
            appear here automatically.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Ballot({
  contest,
  ranking,
  setRanking,
  abstain,
  setAbstain,
  submitting,
  error,
  onSubmit,
}: {
  contest: ActiveContest;
  ranking: string[];
  setRanking: (f: (r: string[]) => string[]) => void;
  abstain: boolean;
  setAbstain: (v: boolean) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  const single = contest.method === "single";
  const nameOf = (id: string) =>
    contest.candidates.find((c) => c.id === id)?.name ?? "?";
  const unranked = contest.candidates.filter((c) => !ranking.includes(c.id));
  const move = (index: number, dir: -1 | 1) =>
    setRanking((r) => {
      const list = [...r];
      const j = index + dir;
      if (j < 0 || j >= list.length) return r;
      [list[index], list[j]] = [list[j], list[index]];
      return list;
    });

  return (
    <Card className="border-2 border-primary/40">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-2xl">{contest.title}</CardTitle>
          <Badge variant="success">voting open</Badge>
        </div>
        <CardDescription>
          {contest.description}
          {contest.description && " · "}
          {single
            ? contest.seats > 1
              ? `Pick one option — the top ${contest.seats} are elected`
              : "Pick one option"
            : contest.seats > 1
              ? `Rank in order of preference — the top ${contest.seats} are elected`
              : "Rank in order of preference"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {single ? (
          !abstain && (
            <div className="flex flex-col gap-2">
              {contest.candidates.map((c) => (
                <label
                  key={c.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-base ${
                    ranking[0] === c.id
                      ? "border-primary bg-accent"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="choice"
                    className="h-5 w-5 accent-primary"
                    checked={ranking[0] === c.id}
                    onChange={() => setRanking(() => [c.id])}
                  />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          )
        ) : (
          !abstain && (
            <>
              <div>
                <div className="mb-1 text-sm font-medium">Your ranking</div>
                {ranking.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Tap candidates below in order of preference — first tap is
                    your first choice. You don’t have to rank everyone.
                  </p>
                ) : (
                  <ol className="flex flex-col gap-1">
                    {ranking.map((cid, i) => (
                      <li
                        key={cid}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-base"
                      >
                        <span className="w-5 font-bold">{i + 1}.</span>
                        <span className="flex-1">{nameOf(cid)}</span>
                        <button
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          title={
                            i === 0 ? "Already your first choice." : "Move up"
                          }
                          className="px-2 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => move(i, 1)}
                          disabled={i === ranking.length - 1}
                          title={
                            i === ranking.length - 1
                              ? "Already your last choice."
                              : "Move down"
                          }
                          className="px-2 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() =>
                            setRanking((r) => r.filter((x) => x !== cid))
                          }
                          className="px-2 text-muted-foreground hover:text-destructive"
                          aria-label="Remove"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              {unranked.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {unranked.map((c) => (
                    <Button
                      key={c.id}
                      variant="outline"
                      onClick={() => setRanking((r) => [...r, c.id])}
                    >
                      + {c.name}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={abstain}
            onChange={(e) => setAbstain(e.target.checked)}
          />
          Abstain from this vote
        </label>
        {abstain && (
          <p className="text-xs text-muted-foreground">
            Your ballot will be recorded as an abstention — it won’t count
            toward any {single ? "option" : "candidate"}.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          size="lg"
          onClick={onSubmit}
          disabled={(!abstain && ranking.length === 0) || submitting}
          disabledReason={
            submitting
              ? "Submitting your ballot…"
              : single
                ? "Pick one option above, or check “Abstain from this vote”."
                : "Tap at least one candidate to rank them, or check “Abstain from this vote”."
          }
        >
          {submitting
            ? "Submitting…"
            : abstain
              ? "Submit abstention"
              : single
                ? "Submit vote"
                : "Submit ballot"}
        </Button>
      </CardContent>
    </Card>
  );
}
