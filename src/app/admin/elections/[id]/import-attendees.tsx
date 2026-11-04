"use client";

import { useActionState, useEffect, useRef } from "react";
import { importAttendees } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * "Who's actually in the room" — paste the attendance list and the
 * election's voter list is set to exactly those people. Uses a native
 * <dialog> so Esc-to-close and the backdrop come for free.
 */
export function ImportAttendees({
  electionId,
  disabledReason,
}: {
  electionId: string;
  disabledReason?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [message, formAction, pending] = useActionState(
    importAttendees.bind(null, electionId),
    undefined,
  );

  // Keep the dialog's own Esc/backdrop closing in sync with nothing else —
  // the summary stays visible until the admin closes it deliberately.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      if (pending) e.preventDefault(); // don't close mid-import
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [pending]);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!!disabledReason}
        disabledReason={disabledReason}
        onClick={() => ref.current?.showModal()}
      >
        Import Attendees
      </Button>

      <dialog
        ref={ref}
        /* `m-auto` is what centres a native modal dialog: the browser's own
           stylesheet does it with `margin: auto`, which Tailwind's preflight
           resets to 0. Without this the dialog sits in the top-left. */
        className="m-auto max-h-[90vh] w-[min(42rem,92vw)] overflow-y-auto rounded-xl border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/50"
      >
        <form action={formAction} className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-lg font-semibold">Import attendees</h2>
            <p className="text-sm text-muted-foreground">
              Paste everyone who is in the room, one name per line. The voter
              list is set to exactly these people — anyone not listed is
              removed and would need re-adding with “Add individual member”.
            </p>
          </div>

          <Textarea
            name="names"
            rows={12}
            autoFocus
            required
            placeholder={"John Smith\nMike Jones\n…"}
            className="font-mono text-sm"
          />

          <p className="text-xs text-muted-foreground">
            Names must match the chapter roster (capitalisation doesn’t
            matter). Anything unrecognised is reported back rather than
            skipped silently, and members who have already voted are never
            removed.
          </p>

          {message && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">{message}</p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => ref.current?.close()}
              disabled={pending}
              disabledReason="Importing…"
            >
              {message ? "Done" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={pending}
              disabledReason="Importing the attendee list…"
            >
              {pending ? "Importing…" : "Set voter list"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
