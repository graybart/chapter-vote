import { notFound } from "next/navigation";
import { asc, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import * as t from "@/db/schema";
import { deleteAdminAccount, setAdminRole } from "@/lib/actions";
import { CreateAccountForm, SetPasswordForm } from "./account-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user?.isOwner) notFound(); // owner only

  const accounts = await db.query.admins.findMany({
    orderBy: [asc(t.admins.createdAt)],
  });

  // Accounts referenced by the audit trail (created/closed something)
  // can't be deleted, only demoted.
  const refRows = await db.execute(sql`
    SELECT created_by_id AS id FROM elections
    UNION SELECT closed_by_id FROM elections WHERE closed_by_id IS NOT NULL
    UNION SELECT created_by_id FROM contests
    UNION SELECT closed_by_id FROM contests WHERE closed_by_id IS NOT NULL
  `);
  const referenced = new Set(
    (refRows as unknown as { id: string }[]).map((r) => r.id),
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>
            Full admins can run elections; view-only accounts (e.g. the A and
            B) can watch live results and turnout but can’t change anything.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateAccountForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounts ({accounts.length})</CardTitle>
          <CardDescription>
            Accounts that have run elections are part of the audit trail and
            can’t be deleted — demote them to view-only instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    {a.name}
                    {a.isOwner && <Badge>owner</Badge>}
                    <Badge variant={a.role === "admin" ? "success" : "outline"}>
                      {a.role === "admin" ? "full admin" : "view-only"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{a.email}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SetPasswordForm adminId={a.id} />
                  {(() => {
                    const roleReason = a.isOwner
                      ? "The owner account always keeps full admin rights."
                      : undefined;
                    const deleteReason = a.isOwner
                      ? "The owner account can't be deleted."
                      : referenced.has(a.id)
                        ? `${a.name} has created or closed an election, so the account is part of the audit trail. Make them view-only instead.`
                        : undefined;
                    return (
                      <>
                        <form
                          action={setAdminRole.bind(
                            null,
                            a.id,
                            a.role === "admin" ? "observer" : "admin",
                          )}
                        >
                          <Button
                            type="submit"
                            size="sm"
                            variant="secondary"
                            disabled={!!roleReason}
                            disabledReason={roleReason}
                          >
                            {a.role === "admin"
                              ? "Make view-only"
                              : "Make full admin"}
                          </Button>
                        </form>
                        <form action={deleteAdminAccount.bind(null, a.id)}>
                          <ConfirmButton
                            type="submit"
                            size="sm"
                            variant="destructive"
                            disabled={!!deleteReason}
                            disabledReason={deleteReason}
                            confirmMessage={`Delete the account for ${a.name} (${a.email})?`}
                          >
                            Delete
                          </ConfirmButton>
                        </form>
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
