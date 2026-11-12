"use client";

import { useActionState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { importAttendees } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * "Who's actually in the room" — paste the attendance list and the
 * election's voter list is set to exactly those people.
 *
 * On Base UI's Dialog rather than the native <dialog>, which needed a
 * margin hack to centre and gave no focus trap.
 */
export function ImportAttendees({
  electionId,
  disabledReason,
}: {
  electionId: string;
  disabledReason?: string;
}) {
  const [message, formAction, pending] = useActionState(
    importAttendees.bind(null, electionId),
    undefined,
  );

  return (
    <Dialog.Root>
      <Dialog.Trigger
        render={
          <Button
            type="button"
            variant="tonal"
            size="sm"
            disabled={!!disabledReason}
            disabledReason={disabledReason}
          >
            Import Attendees
          </Button>
        }
      />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
        <Dialog.Popup
          className="fixed left-1/2 top-1/2 z-50 w-[min(42rem,92vw)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-surface-high p-6 text-on-surface shadow-e3 outline-none"
        >
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Dialog.Title className="m3-headline">
                Import attendees
              </Dialog.Title>
              <Dialog.Description className="m3-body text-on-surface-variant">
                Paste everyone who is in the room, one name per line. The
                voter list is set to exactly these people — anyone not listed
                is removed and would need re-adding with “Add individual
                member”.
              </Dialog.Description>
            </div>

            <Textarea
              name="names"
              rows={12}
              autoFocus
              required
              placeholder={"John Smith\nMike Jones\n…"}
              className="font-mono text-sm"
            />

            <p className="m3-body-sm text-on-surface-variant">
              Names must match the chapter roster (capitalisation doesn’t
              matter). Anything unrecognised is reported back rather than
              skipped silently, and members who have already voted are never
              removed.
            </p>

            {message && (
              <p className="m3-body rounded-sm bg-secondary-container px-4 py-3 text-on-secondary-container">
                {message}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              <Dialog.Close
                render={
                  <Button
                    type="button"
                    variant="text"
                    disabled={pending}
                    disabledReason="Importing…"
                  >
                    {message ? "Done" : "Cancel"}
                  </Button>
                }
              />
              <Button
                type="submit"
                disabled={pending}
                disabledReason="Importing the attendee list…"
              >
                {pending ? "Importing…" : "Set voter list"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
