import Link from "next/link";
import { desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import * as t from "@/db/schema";
import { createElection } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const statusVariant = {
  draft: "secondary",
  open: "success",
  closed: "outline",
} as const;

export default async function AdminDashboard() {
  const session = await auth();
  const readOnly = session?.user?.role !== "admin";
  const elections = await db.query.elections.findMany({
    orderBy: [desc(t.elections.createdAt)],
    with: { createdBy: true, contests: { columns: { id: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      {!readOnly && (
        <Card>
          <CardHeader>
            <CardTitle>New election</CardTitle>
            <CardDescription>
              The current active roster is copied in as the voter list — you
              can adjust it afterwards.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createElection} className="flex gap-2">
              <Input
                name="title"
                placeholder='e.g. "Fall 2026 Officer Elections"'
                required
                className="max-w-md"
              />
              <Button type="submit">Create</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Elections</CardTitle>
        </CardHeader>
        <CardContent>
          {elections.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No elections yet.</p>
          ) : (
            <div className="divide-y">
              {elections.map((e) => (
                <Link
                  key={e.id}
                  href={`/admin/elections/${e.id}`}
                  className="flex items-center justify-between py-3 hover:bg-on-surface/4 -mx-2 px-2 rounded-md"
                >
                  <div>
                    <div className="font-medium">{e.title}</div>
                    <div className="text-xs text-on-surface-variant">
                      {e.contests.length} contest
                      {e.contests.length === 1 ? "" : "s"} · created by{" "}
                      {e.createdBy.name} ·{" "}
                      {e.createdAt.toLocaleDateString()}
                    </div>
                  </div>
                  <Badge variant={statusVariant[e.status]}>{e.status}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
