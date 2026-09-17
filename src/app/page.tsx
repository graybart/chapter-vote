import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">ChapterVote</h1>
      <p className="text-neutral-500">
        Voters: scan the QR code or use the link your chapter shared.
      </p>
      <Link href="/admin" className="underline">
        Admin login
      </Link>
    </main>
  );
}
