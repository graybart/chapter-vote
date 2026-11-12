"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { addContest } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { InfoHint } from "@/components/info-hint";

const SEATS_HINT =
  "Useful for elections where the top X candidates are chosen, such as " +
  "J-Board elections. For all normal elections, this value should be 1.";

/**
 * "Add contest" as a dialog rather than a permanent form block — the form
 * is only needed a few times per meeting and was taking up a third of the
 * Contests card the rest of the time.
 */
export function AddContestDialog({
  electionId,
  disabledReason,
}: {
  electionId: string;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    addContest.bind(null, electionId),
    undefined,
  );

  // Close once the contest is actually created; stay open on an error so
  // the admin can see what went wrong without retyping.
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={
          <Button
            type="button"
            size="sm"
            disabled={!!disabledReason}
            disabledReason={disabledReason}
          >
            Add contest
          </Button>
        }
      />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(30rem,92vw)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-surface-high p-6 text-on-surface shadow-e3 outline-none">
          <form action={formAction} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Dialog.Title className="m3-headline">New contest</Dialog.Title>
              <Dialog.Description className="m3-body text-on-surface-variant">
                One office or motion. You can add candidates after creating
                it.
              </Dialog.Description>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contest-title">Contest name</Label>
              <Input
                id="contest-title"
                name="title"
                placeholder='e.g. "President"'
                autoFocus
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contest-method">Ballot type</Label>
              <Select
                name="method"
                defaultValue="ranked"
                options={[
                  { value: "ranked", label: "Ranked choice" },
                  { value: "single", label: "Multiple choice" },
                ]}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="contest-seats"
                className="flex items-center gap-1.5"
              >
                Open seats
                <InfoHint text={SEATS_HINT} />
              </Label>
              <Input
                id="contest-seats"
                name="seats"
                type="number"
                min={1}
                max={50}
                defaultValue={1}
                className="w-28"
              />
            </div>

            {state && !state.ok && state.message && (
              <p className="m3-body rounded-sm bg-error-container px-4 py-3 text-on-error-container">
                {state.message}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              <Dialog.Close
                render={
                  <Button
                    type="button"
                    variant="text"
                    disabled={pending}
                    disabledReason="Creating…"
                  >
                    Cancel
                  </Button>
                }
              />
              <Button
                type="submit"
                disabled={pending}
                disabledReason="Creating the contest…"
              >
                {pending ? "Creating…" : "Create contest"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
