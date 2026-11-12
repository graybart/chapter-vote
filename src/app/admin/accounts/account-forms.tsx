"use client";

import { useActionState } from "react";
import { createAdminAccount, setAdminPassword } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function CreateAccountForm() {
  const [message, formAction, pending] = useActionState(
    createAdminAccount,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="acct-name">Name</Label>
          <Input id="acct-name" name="name" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="acct-email">Email or username</Label>
          <Input id="acct-email" name="email" type="text" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="acct-password">Password (min 8 chars)</Label>
          <Input
            id="acct-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="acct-role">Permission level</Label>
          <Select
            name="role"
            defaultValue="observer"
            options={[
              { value: "admin", label: "Full admin — run elections" },
              { value: "observer", label: "View-only — watch live results" },
            ]}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={pending}
          disabledReason="Creating the account…"
        >
          {pending ? "Creating…" : "Create account"}
        </Button>
        {message && <span className="text-sm">{message}</span>}
      </div>
    </form>
  );
}

export function SetPasswordForm({ adminId }: { adminId: string }) {
  const [message, formAction, pending] = useActionState(
    setAdminPassword.bind(null, adminId),
    undefined,
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <Input
        name="password"
        type="password"
        placeholder="New password"
        autoComplete="new-password"
        className="h-8 w-40 text-xs"
        required
      />
      <Button
        type="submit"
        size="sm"
        variant="outlined"
        disabled={pending}
        disabledReason="Updating the password…"
      >
        Set
      </Button>
      {message && (
        <span className="text-xs text-on-surface-variant">{message}</span>
      )}
    </form>
  );
}
