"use client";

import { useActionState } from "react";
import { bulkAddMembers } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Two-column paste import: copy the names column and the GTID column from
 * your spreadsheet separately. Lines pair up one-to-one.
 */
export function BulkAddForm() {
  const [message, formAction, pending] = useActionState(
    bulkAddMembers,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-names">Names (one per line)</Label>
          <Textarea
            id="bulk-names"
            name="names"
            rows={8}
            placeholder={"John Smith\nMike Jones\n…"}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-gtids">GTIDs (same order)</Label>
          <Textarea
            id="bulk-gtids"
            name="gtids"
            rows={8}
            placeholder={"903111222\n903333444\n…"}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Line 1 of each column is the same person, line 2 the next, and so on.
        Leave the GTID column empty to import names only; a blank GTID line
        means that member votes without verification. Re-importing an
        existing name updates their GTID.
      </p>
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={pending}
          disabledReason="Importing the roster…"
        >
          {pending ? "Importing…" : "Import"}
        </Button>
        {message && <span className="text-sm">{message}</span>}
      </div>
    </form>
  );
}
