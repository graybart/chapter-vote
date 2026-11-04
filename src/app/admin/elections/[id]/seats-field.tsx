"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { setContestSeats } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoHint } from "@/components/info-hint";

const SEATS_HINT =
  "Useful for elections where the top X candidates are chosen, such as " +
  "J-Board elections. For all normal elections, this value should be 1.";

/** Save button that highlights itself while there are unsaved edits. */
function SaveButton({
  dirty,
  lockedReason,
}: {
  dirty: boolean;
  lockedReason?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      variant={dirty ? "warning" : "ghost"}
      disabled={!!lockedReason || pending || !dirty}
      disabledReason={
        lockedReason ??
        (pending ? "Saving…" : "No changes to save — the value above matches what's saved.")
      }
      hint={dirty ? "Changes have not been applied yet." : undefined}
    >
      {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
    </Button>
  );
}

/**
 * Number of open seats for a contest. The field is a plain uncontrolled
 * form post, but we track the typed value so the Save button can make it
 * obvious when an edit hasn't been applied yet.
 */
export function SeatsField({
  contestId,
  seats,
  lockedReason,
}: {
  contestId: string;
  seats: number;
  lockedReason?: string;
}) {
  const [value, setValue] = useState(String(seats));

  const parsed = Number.parseInt(value, 10);
  const dirty = Number.isNaN(parsed)
    ? value.trim() !== String(seats)
    : parsed !== seats;

  return (
    <form
      action={setContestSeats.bind(null, contestId)}
      className="flex items-center gap-2"
    >
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        Open seats
        <InfoHint text={SEATS_HINT} />
      </span>
      <Input
        name="seats"
        type="number"
        min={1}
        max={50}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={`h-8 w-20 ${dirty ? "border-amber-500 ring-1 ring-amber-500/40" : ""}`}
        disabled={!!lockedReason}
        title={lockedReason}
      />
      <SaveButton dirty={dirty} lockedReason={lockedReason} />
    </form>
  );
}
