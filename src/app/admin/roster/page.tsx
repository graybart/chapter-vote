import { asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import * as t from "@/db/schema";
import { addMember, clearRoster, setMemberActive } from "@/lib/actions";
import { BulkAddForm } from "./bulk-add-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function RosterPage() {
  const session = await auth();
  const readOnly = session?.user?.role !== "admin";
  const members = await db.query.members.findMany({
    orderBy: [asc(t.members.name)],
  });
  const activeCount = members.filter((m) => m.active).length;

  return (
    <div className="flex flex-col gap-6">
      {!readOnly && (
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add member</CardTitle>
            <CardDescription>
              GTID optional — used to verify voters. Re-adding an existing
              name updates their GTID.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={addMember} className="flex flex-wrap gap-2">
              <Input
                name="name"
                placeholder="Full name"
                required
                className="max-w-56"
              />
              <Input
                name="gtid"
                placeholder="GTID (optional)"
                inputMode="numeric"
                className="max-w-40"
              />
              <Button type="submit">Add</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bulk import from spreadsheet</CardTitle>
            <CardDescription>
              Paste the names column and the GTID column separately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BulkAddForm />
          </CardContent>
        </Card>
      </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <CardTitle>
                Chapter roster ({activeCount} active / {members.length} total)
              </CardTitle>
              <CardDescription>
                Inactive members are left out when an election imports the
                roster. Past elections keep their own voter snapshots, so
                edits here never change old results.
              </CardDescription>
            </div>
            {!readOnly && members.length > 0 && (
              <form action={clearRoster}>
                <ConfirmButton
                  type="submit"
                  variant="destructive"
                  size="sm"
                  confirmMessage="Clear the whole roster? Members with election history are deactivated (history is kept); everyone else is deleted. You can then import just the people present today."
                >
                  Clear roster
                </ConfirmButton>
              </form>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No members yet — add the chapter roster above.
            </p>
          ) : (
            <div className="divide-y">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-2"
                >
                  <span className={m.active ? "" : "text-muted-foreground line-through"}>
                    {m.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {m.gtid
                        ? readOnly
                          ? `GTID •••••${m.gtid.slice(-4)}`
                          : `GTID ${m.gtid}`
                        : "no GTID — votes unverified"}
                    </span>
                  </span>
                  <div className="flex items-center gap-3">
                    {!m.active && <Badge variant="outline">inactive</Badge>}
                    {!readOnly && (
                      <form
                        action={setMemberActive.bind(null, m.id, !m.active)}
                      >
                        <Button variant="ghost" size="sm" type="submit">
                          {m.active ? "Deactivate" : "Reactivate"}
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
