import Link from "next/link";
import { auth } from "@/auth";
import { signOutAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="min-h-screen">
      <nav className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-bold">
              ChapterVote
            </Link>
            {session?.user && (
              <>
                <Link
                  href="/admin"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Elections
                </Link>
                <Link
                  href="/admin/roster"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Roster
                </Link>
                {session.user.isOwner && (
                  <Link
                    href="/admin/accounts"
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Accounts
                  </Link>
                )}
              </>
            )}
          </div>
          {session?.user && (
            <form action={signOutAction} className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {session.user.name}
                {session.user.role === "observer" && (
                  <span className="ml-2 rounded-full border px-2 py-0.5 text-xs">
                    view-only
                  </span>
                )}
              </span>
              <Button variant="outline" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          )}
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
