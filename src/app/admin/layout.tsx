import Link from "next/link";
import { auth } from "@/auth";
import { signOutAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    /* force-light: the admin UI doesn't follow the device's dark mode, so
       the officer running the meeting always sees the same screen. */
    <div className="force-light min-h-screen bg-surface text-on-surface">
      {/* M3 top app bar: a tonal surface rather than a white bar + border. */}
      <nav className="bg-surface-container">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-6">
            <Link
              href="/admin"
              className="m3-title-lg font-serif text-primary"
            >
              ChapterVote
            </Link>
            {session?.user && (
              <>
                <Link
                  href="/admin"
                  className="m3-label text-on-surface-variant transition-colors hover:text-on-surface"
                >
                  Elections
                </Link>
                <Link
                  href="/admin/roster"
                  className="m3-label text-on-surface-variant transition-colors hover:text-on-surface"
                >
                  Roster
                </Link>
                {session.user.isOwner && (
                  <Link
                    href="/admin/accounts"
                    className="m3-label text-on-surface-variant transition-colors hover:text-on-surface"
                  >
                    Accounts
                  </Link>
                )}
              </>
            )}
          </div>
          {session?.user && (
            <form action={signOutAction} className="flex items-center gap-3">
              <span className="m3-body flex items-center gap-2 text-on-surface-variant">
                {session.user.name}
                {session.user.role === "observer" && (
                  <Badge variant="outline">view-only</Badge>
                )}
              </span>
              <Button variant="outlined" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          )}
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
