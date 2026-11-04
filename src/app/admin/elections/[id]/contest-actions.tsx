import Link from "next/link";
import {
  closeContest,
  closeContestAndPublish,
  deleteContest,
  openContest,
  reopenContest,
  revertContestToPending,
  setContestMethod,
  setContestPaused,
  setResultsPublished,
} from "@/lib/actions";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { SeatsField } from "./seats-field";

type ContestStatus = "pending" | "open" | "closed";

interface ContestLike {
  id: string;
  title: string;
  status: ContestStatus;
  method: "ranked" | "single";
  seats: number;
  resultsPublished: boolean;
  paused: boolean;
  candidates: { withdrawn: boolean }[];
}

interface ElectionLike {
  id: string;
  status: "draft" | "open" | "closed";
}

interface Action {
  label: string;
  /** Set when the action can't be used right now (shown on hover). */
  reason?: string;
  variant?: ButtonProps["variant"];
  /** Tooltip while the action IS usable. */
  hint?: string;
  action: () => void;
  confirmMessage?: string;
}

function ActionButton({ a }: { a: Action }) {
  const shared = {
    type: "submit" as const,
    size: "sm" as const,
    variant: a.variant,
    disabled: !!a.reason,
    disabledReason: a.reason,
    hint: a.hint,
  };

  return (
    <form action={a.action}>
      {a.confirmMessage ? (
        <ConfirmButton {...shared} confirmMessage={a.confirmMessage}>
          {a.label}
        </ConfirmButton>
      ) : (
        <Button {...shared}>{a.label}</Button>
      )}
    </form>
  );
}

/**
 * Buttons for one contest row.
 *
 * Only the actions that apply to the contest's current state are rendered —
 * anything that doesn't apply simply isn't there. The "More" menu holds the
 * contest's settings (seats, ballot type), which are rarely changed and
 * would otherwise clutter the row. It's a native <details>, so this stays a
 * server component.
 *
 * Nothing becomes unreachable by hiding inapplicable actions: a closed
 * contest gets back to draft via Reopen voting → Revert to draft, and a
 * contest can only be deleted once it's a draft, both of which are inline.
 */
export function ContestActions({
  contest: c,
  election,
  readOnly,
  ballots,
  otherOpenTitle,
}: {
  contest: ContestLike;
  election: ElectionLike;
  readOnly: boolean;
  ballots: number;
  otherOpenTitle?: string;
}) {
  const resultsLink = (
    <Link href={`/admin/elections/${election.id}/contests/${c.id}`}>
      <Button size="sm" variant="outline">
        {c.status === "open" ? "Live results" : "Results"}
      </Button>
    </Link>
  );

  if (readOnly) {
    return <div className="flex items-center gap-2">{resultsLink}</div>;
  }

  const optionWord = c.method === "single" ? "option" : "candidate";
  const liveCandidates = c.candidates.filter((x) => !x.withdrawn).length;
  const blockedByOther = otherOpenTitle
    ? `“${otherOpenTitle}” is open right now. Only one contest runs at a time — close that one first.`
    : undefined;

  const openReason =
    election.status === "draft"
      ? "Open the election first (button at the top of this page)."
      : election.status === "closed"
        ? "This election is closed. Reopen the election first."
        : (blockedByOther ??
          (liveCandidates < 1
            ? `Add at least one ${optionWord} to this contest first.`
            : undefined));

  const actions: Record<string, Action> = {
    pause: {
      label: c.paused ? "Resume voting" : "Pause voting",
      variant: c.paused ? "warning" : "secondary",
      hint: c.paused
        ? undefined
        : "Stops new ballots without closing the contest — use it to reset a ballot or exclude someone mid-vote.",
      action: setContestPaused.bind(null, c.id, !c.paused),
    },
    open: {
      label: c.status === "closed" ? "Reopen voting" : "Open voting",
      reason: openReason,
      action:
        c.status === "closed"
          ? reopenContest.bind(null, c.id)
          : openContest.bind(null, c.id),
    },
    closeAndShow: {
      label: "Close Voting and Display Results",
      action: closeContestAndPublish.bind(null, c.id),
      confirmMessage: `Close voting for “${c.title}” and put the result on the projector?`,
    },
    close: {
      label: "Close voting",
      variant: "destructive",
      action: closeContest.bind(null, c.id),
      confirmMessage: `Close voting for “${c.title}”? The result will be frozen but not shown on the projector yet.`,
    },
    publish: {
      label: c.resultsPublished
        ? "Hide result from projector"
        : "Show result on projector",
      variant: c.resultsPublished ? "outline" : "secondary",
      action: setResultsPublished.bind(null, c.id, !c.resultsPublished),
    },
    revert: {
      label: "Revert to draft",
      variant: "ghost",
      reason:
        ballots > 0
          ? `${ballots} ballot(s) have been cast. Reset them on the results page first.`
          : undefined,
      action: revertContestToPending.bind(null, c.id),
      confirmMessage: `Revert “${c.title}” to draft? It’s unpublished from the ballot until you open voting again. Candidates and exclusions are kept.`,
    },
    remove: {
      label: "Delete",
      variant: "ghost",
      action: deleteContest.bind(null, c.id),
      confirmMessage: `Delete the contest “${c.title}”? This can’t be undone.`,
    },
  };

  // Seats and ballot type are baked into ballots once voting starts.
  const settingsLockedReason =
    c.status === "open"
      ? "Voting is open — revert the contest to draft to change this."
      : c.status === "closed"
        ? "This contest is closed and can no longer be changed."
        : undefined;

  // Only what applies to this state.
  const inlineKeys =
    c.status === "pending"
      ? ["remove", "open"]
      : c.status === "open"
        ? ["pause", "closeAndShow", "close", "revert"]
        : ["open", "publish"];

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {inlineKeys.map((k) => (
        <ActionButton key={k} a={actions[k]} />
      ))}
      {resultsLink}

      <details className="relative">
        <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent [&::-webkit-details-marker]:hidden">
          More ▾
        </summary>
        <div className="absolute right-0 z-40 mt-1 flex w-72 flex-col gap-3 rounded-md border bg-card p-3 text-left shadow-lg">
          <p className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Contest settings
          </p>

          <SeatsField
            key={c.seats}
            contestId={c.id}
            seats={c.seats}
            lockedReason={settingsLockedReason}
          />

          <div className="flex flex-col gap-1">
            <form
              action={setContestMethod.bind(
                null,
                c.id,
                c.method === "single" ? "ranked" : "single",
              )}
            >
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="w-full"
                disabled={!!settingsLockedReason}
              >
                Switch to{" "}
                {c.method === "single" ? "ranked choice" : "multiple choice"}
              </Button>
            </form>
            <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">
              {settingsLockedReason ??
                `Currently ${c.method === "single" ? "multiple choice" : "ranked choice"}.`}
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}
