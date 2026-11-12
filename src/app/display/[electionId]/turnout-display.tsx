"use client";

import { useCallback, useEffect, useState } from "react";

interface ActiveContest {
  title: string;
  seats: number;
  method: "ranked" | "single";
  paused: boolean;
  voted: number;
  remaining: number;
  eligible: number;
}

interface PublishedResult {
  title: string;
  seats: number;
  isTie: boolean;
  winnerNames: string[];
}

interface DisplayState {
  electionTitle: string;
  electionStatus: "draft" | "open" | "closed";
  active: ActiveContest | null;
  published: PublishedResult | null;
}

// Fast enough that opening a contest or a ballot landing looks immediate
// from the back of the room. It's one screen on the local network, so the
// extra requests cost nothing.
const POLL_MS = 1000;

/**
 * Projector view. Set the URL once at the start of the meeting and leave it:
 * it switches between three screens on its own as the chair opens contests,
 * closes them and publishes results.
 *
 * Sized in min(vw, vh) so it fills a 16:9 projector without overflowing a
 * 4:3 one or a laptop screen.
 */
export function TurnoutDisplay({
  electionId,
  voteUrl,
  joinQr,
}: {
  electionId: string;
  voteUrl: string;
  joinQr: string;
}) {
  const [data, setData] = useState<DisplayState | null>(null);
  const [stale, setStale] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/display/${electionId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setStale(false);
    } catch {
      setStale(true); // keep the last good numbers on screen
    }
  }, [electionId]);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, POLL_MS);
    // Catch up straight away when the laptop wakes or the tab is re-shown.
    const onWake = () => {
      if (!document.hidden) refetch();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [refetch]);

  const active = data?.active ?? null;
  const pct =
    active && active.eligible > 0
      ? Math.round((active.voted / active.eligible) * 100)
      : 0;
  const everyoneIn = !!active && active.eligible > 0 && active.remaining === 0;
  // The QR stays up all meeting; it's only the hero element between votes.
  const bigQr = !active && !data?.published && data?.electionStatus !== "closed";
  const showCornerQr = !!data && !bigQr && data.electionStatus !== "closed";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0b1a2a] text-[#f5f1e8]">
      {/* Header: election name with the live status chip beneath it, and
          the join QR tucked into the corner. */}
      <header className="flex items-start justify-between gap-[2vw] px-[3vw] pt-[3vh]">
        <div className="min-w-0">
          <h1 className="truncate text-[min(2.4vw,4.2vh)] font-semibold leading-none text-[#9fb3c8]">
            {data?.electionTitle ?? "Loading…"}
          </h1>
          {active && (
            <span
              className={`mt-[1.2vh] inline-block rounded-full px-[1.2vw] py-[0.7vh] text-[min(1.4vw,2.4vh)] font-semibold uppercase tracking-wide ${
                active.paused
                  ? "bg-[#f1bd19]/20 text-[#f7d978]"
                  : "bg-[#00a98e]/20 text-[#6cdbbe]"
              }`}
            >
              {active.paused ? "Voting paused" : "Voting open"}
            </span>
          )}
        </div>
        {showCornerQr && (
          <div className="shrink-0 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={joinQr}
              alt="Scan to open the voting page"
              className="h-[15vh] w-[15vh] rounded-[0.8vh] bg-white p-[0.6vh]"
            />
            <div className="mt-[0.6vh] text-[min(0.9vw,1.6vh)] font-medium text-[#7d93aa]">
              Scan to vote
            </div>
          </div>
        )}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-[3vw]">
        {!data ? null : active ? (
          <>
            <h2 className="mb-[3vh] max-w-full truncate text-center font-serif text-[min(5.5vw,9vh)] font-semibold leading-none">
              {active.title}
            </h2>

            {everyoneIn ? (
              <div className="text-center">
                <div className="text-[min(15vw,30vh)] font-black leading-none text-[#2fcfae]">
                  {active.voted}
                </div>
                <div className="mt-[1.5vh] text-[min(2.8vw,4.8vh)] font-bold uppercase tracking-wide text-[#6cdbbe]">
                  Everyone has voted
                </div>
              </div>
            ) : (
              <div className="flex w-full items-center justify-evenly">
                <div className="text-center">
                  <div className="text-[min(16vw,32vh)] font-black leading-[0.85] tabular-nums text-[#f1bd19]">
                    {active.remaining}
                  </div>
                  <div className="mt-[1.2vh] text-[min(2.4vw,4.2vh)] font-bold uppercase tracking-[0.08em] text-[#f7d978]">
                    Still to vote
                  </div>
                </div>
                <div
                  aria-hidden
                  className="h-[34vh] w-[2px] shrink-0 bg-white/10"
                />
                <div className="text-center">
                  <div className="text-[min(16vw,32vh)] font-black leading-[0.85] tabular-nums text-[#2fcfae]">
                    {active.voted}
                  </div>
                  <div className="mt-[1.2vh] text-[min(2.4vw,4.2vh)] font-bold uppercase tracking-[0.08em] text-[#a8e8d7]">
                    Voted
                  </div>
                </div>
              </div>
            )}
          </>
        ) : data.published ? (
          /* Between contests, with a result the chair has published */
          <div className="w-full text-center">
            <div className="text-[min(2.2vw,3.8vh)] font-semibold uppercase tracking-[0.12em] text-[#7d93aa]">
              {data.published.title}
            </div>
            {data.published.isTie && data.published.winnerNames.length === 0 ? (
              <div className="mt-[3vh] text-[min(6vw,10vh)] font-black leading-tight text-[#f1bd19]">
                Tie — revote required
              </div>
            ) : (
              <>
                <div className="mt-[1.5vh] text-[min(2.6vw,4.4vh)] font-bold uppercase tracking-[0.1em] text-[#6cdbbe]">
                  {data.published.winnerNames.length > 1 ? "Elected" : "Winner"}
                </div>
                <div className="mt-[1.5vh] flex flex-col items-center gap-[1.5vh]">
                  {data.published.winnerNames.map((n) => (
                    <div
                      key={n}
                      className="max-w-full truncate text-[min(8vw,15vh)] font-black leading-none text-[#2fcfae]"
                    >
                      {n}
                    </div>
                  ))}
                </div>
                {data.published.isTie && (
                  <div className="mt-[2.5vh] text-[min(2vw,3.4vh)] font-semibold text-[#f1bd19]">
                    Remaining seat(s) tied — revote required
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* Between contests, nothing published — the QR takes the stage */
          <div className="flex items-center gap-[5vw]">
            <div className="text-left">
              <div className="flex items-center gap-[1.2vw]">
                {data.electionStatus !== "closed" && (
                  <span className="relative flex h-[1.6vh] w-[1.6vh]">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2fcfae] opacity-75" />
                    <span className="relative inline-flex h-full w-full rounded-full bg-[#2fcfae]" />
                  </span>
                )}
                <span className="text-[min(4vw,7vh)] font-black leading-none">
                  {data.electionStatus === "closed"
                    ? "Voting has concluded"
                    : "Waiting for the next vote"}
                </span>
              </div>
              {data.electionStatus !== "closed" && (
                <>
                  <p className="mt-[2.5vh] text-[min(2vw,3.4vh)] text-[#9fb3c8]">
                    Not joined yet? Scan to vote from your phone:
                  </p>
                  <p className="mt-[0.8vh] text-[min(1.8vw,3vh)] font-semibold text-[#e4ddcc]">
                    {voteUrl}
                  </p>
                </>
              )}
            </div>
            {data.electionStatus !== "closed" && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={joinQr}
                alt="Scan to open the voting page"
                className="h-[38vh] w-[38vh] rounded-[1vh] bg-white p-[1vh]"
              />
            )}
          </div>
        )}
      </main>

      {/* Progress bar — only meaningful while a contest is taking votes */}
      <footer className="px-[3vw] pb-[3vh]">
        {active ? (
          <>
            <div className="mb-[1vh] flex items-baseline justify-between text-[min(1.6vw,2.8vh)] font-medium text-[#9fb3c8]">
              <span>
                {active.voted} of {active.eligible} ballots in
              </span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <div className="h-[4vh] w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                  active.paused ? "bg-[#f1bd19]" : "bg-[#2fcfae]"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        ) : (
          <div className="h-[4vh]" />
        )}
        {stale && (
          <p className="mt-[1vh] text-[min(1.2vw,2.2vh)] text-[#f1bd19]">
            Reconnecting — numbers may be a few seconds behind.
          </p>
        )}
      </footer>
    </div>
  );
}
