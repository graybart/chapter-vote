"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { NumberField } from "@base-ui/react/number-field";
import { setContestSeats } from "@/lib/actions";
import { Button } from "@/components/ui/button";
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
      variant={dirty ? "warning" : "text"}
      disabled={!!lockedReason || pending || !dirty}
      disabledReason={
        lockedReason ??
        (pending
          ? "Saving…"
          : "No changes to save — the value above matches what's saved.")
      }
      hint={dirty ? "Changes have not been applied yet." : undefined}
    >
      {pending ? "Saving…" : dirty ? "Save" : "Saved"}
    </Button>
  );
}

/**
 * Number of open seats for a contest, on Base UI's NumberField — proper
 * stepper buttons and a numeric input that behaves on phones. We track the
 * typed value so the Save button can flag an unapplied edit.
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
  const [value, setValue] = useState<number | null>(seats);
  const dirty = value !== null && value !== seats;

  const step =
    "flex h-9 w-9 shrink-0 items-center justify-center text-on-surface-variant transition-colors hover:bg-on-surface/8 disabled:text-on-surface/38 disabled:hover:bg-transparent";

  return (
    <form
      action={setContestSeats.bind(null, contestId)}
      className="flex flex-col gap-1.5"
    >
      <span className="m3-label-sm flex items-center gap-1.5 text-on-surface-variant">
        Open seats
        <InfoHint text={SEATS_HINT} />
      </span>
      <div className="flex items-center gap-2">
        <NumberField.Root
          name="seats"
          value={value}
          onValueChange={setValue}
          min={1}
          max={50}
          disabled={!!lockedReason}
          className="inline-flex"
        >
          <NumberField.Group
            className={`flex items-center overflow-hidden rounded-xs border ${
              dirty ? "border-brand-buff" : "border-outline"
            }`}
          >
            <NumberField.Decrement className={step} aria-label="One fewer seat">
              −
            </NumberField.Decrement>
            <NumberField.Input
              className="m3-body h-9 w-12 border-x border-outline-variant bg-transparent text-center text-on-surface outline-none disabled:text-on-surface/38"
              title={lockedReason}
            />
            <NumberField.Increment className={step} aria-label="One more seat">
              +
            </NumberField.Increment>
          </NumberField.Group>
        </NumberField.Root>
        <SaveButton dirty={dirty} lockedReason={lockedReason} />
      </div>
    </form>
  );
}
