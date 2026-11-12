"use client";

import { useActionState } from "react";
import { authenticate } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const [errorMessage, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );

  return (
    <div className="flex justify-center pt-12">
      <Card variant="elevated" className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="m3-headline">Admin sign in</CardTitle>
          <CardDescription>
            Election officers only. Voters use the link or QR code shared at
            the meeting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-5">
            <input type="hidden" name="redirectTo" value="/admin" />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email or username</Label>
              <Input
                id="email"
                name="email"
                type="text"
                autoComplete="username"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {errorMessage && (
              <p className="m3-body rounded-sm bg-error-container px-4 py-3 text-on-error-container">
                {errorMessage}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              disabled={isPending}
              disabledReason="Signing you in…"
            >
              {isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
