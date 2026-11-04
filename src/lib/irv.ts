/**
 * Instant-runoff voting (IRV) tally — implemented from scratch, no deps.
 *
 * Rules:
 *  - A ballot counts for its highest-ranked *continuing* candidate.
 *  - Majority = strictly more than half of continuing (non-exhausted) ballots.
 *  - Exhausted ballots (all ranked candidates eliminated) leave the
 *    denominator and are reported per round.
 *  - Elimination order each round:
 *      1. Batch elimination: the largest trailing group whose combined total
 *         is strictly less than the next-lowest candidate (mathematically
 *         cannot affect the outcome).
 *      2. Unique lowest candidate.
 *      3. Tie for last → backward tie-break: fewest votes in the most recent
 *         prior round where the tied candidates differed.
 *
 * NO RANDOMNESS. There is deliberately no coin-flip, lot, or seeded draw
 * anywhere in this file. If a tie cannot be broken by the rules above, the
 * tally refuses to pick a winner and reports `winner: null, isTie: true`
 * with the tied candidates named, so the chapter can be told and a revote
 * held. Every result this module produces is a pure function of the ballots.
 *
 * `tallyIrvMultiSeat` (below) layers the bylaws' multi-seat rule on top:
 * seats are awarded one at a time, each winner removed from all ballots
 * before the next count. No runoff is ever required.
 */

export interface IrvBallot {
  /** Candidate IDs in preference order, index 0 = first choice. */
  rankings: string[];
}

export type EliminationReason =
  | "lowest" // unique lowest first-choice count
  | "batch" // trailing group mathematically eliminated together
  | "prior_round_tiebreak"; // lost a backward tie-break

export interface IrvRound {
  round: number;
  /** candidateId -> first-choice count among continuing ballots */
  tally: Record<string, number>;
  exhaustedBallots: number;
  eliminated: { candidateId: string; reason: EliminationReason }[];
  /** Human-readable audit notes, e.g. tie-break explanations. */
  notes: string[];
}

export interface IrvResult {
  winner: string | null; // candidateId, or null (no ballots / unresolvable tie)
  isTie: boolean;
  /**
   * When `isTie`, the candidates the count could not separate. These are
   * exactly the people a revote should be held between.
   */
  tiedCandidates: string[];
  rounds: IrvRound[];
  totalBallots: number;
}

/** One seat's tally in a (possibly multi-seat) contest. */
export interface SeatResult {
  seat: number; // 1-based
  winner: string | null;
  isTie: boolean;
  tiedCandidates: string[];
  rounds: IrvRound[];
}

export interface MultiSeatIrvResult {
  seats: number;
  /** Candidate IDs in the order they were elected. */
  winners: string[];
  /** True if filling stopped early on an unresolvable tie. */
  isTie: boolean;
  /** Candidates the count couldn't separate for the first unfilled seat. */
  tiedCandidates: string[];
  seatResults: SeatResult[];
  totalBallots: number;
}

/**
 * Validate a submitted ballot. Returns an error message or null if valid.
 * Ranks are implied by array order, so gaps are impossible; this rejects
 * empty ballots, duplicates, and unknown candidates.
 */
export function validateRankings(
  validCandidateIds: string[],
  rankings: unknown,
): string | null {
  if (!Array.isArray(rankings) || rankings.length === 0) {
    return "Ballot must rank at least one candidate.";
  }
  const valid = new Set(validCandidateIds);
  const seen = new Set<string>();
  for (const c of rankings) {
    if (typeof c !== "string" || !valid.has(c)) {
      return "Ballot contains an unknown candidate.";
    }
    if (seen.has(c)) return "Ballot ranks the same candidate twice.";
    seen.add(c);
  }
  return null;
}

export function tallyIrv(
  candidateIds: string[],
  ballots: IrvBallot[],
): IrvResult {
  const totalBallots = ballots.length;
  const rounds: IrvRound[] = [];

  if (candidateIds.length === 0) {
    return {
      winner: null,
      isTie: false,
      tiedCandidates: [],
      rounds,
      totalBallots,
    };
  }

  // Defensive sanitation: drop unknown candidates, keep first occurrence of
  // duplicates. (The API layer rejects such ballots outright; historical
  // data is tallied leniently.)
  const candidateSet = new Set(candidateIds);
  const cleaned: string[][] = ballots.map((b) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of b.rankings) {
      if (candidateSet.has(c) && !seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    }
    return out;
  });

  const continuing = new Set(candidateIds);
  const history: Map<string, number>[] = [];

  for (let roundNum = 1; ; roundNum++) {
    // Count each ballot for its highest-ranked continuing candidate.
    const tally = new Map<string, number>();
    for (const c of continuing) tally.set(c, 0);
    let exhausted = 0;
    for (const r of cleaned) {
      const top = r.find((c) => continuing.has(c));
      if (top !== undefined) tally.set(top, tally.get(top)! + 1);
      else exhausted++;
    }
    const active = totalBallots - exhausted;

    const notes: string[] = [];
    const round: IrvRound = {
      round: roundNum,
      tally: Object.fromEntries(tally),
      exhaustedBallots: exhausted,
      eliminated: [],
      notes,
    };
    rounds.push(round);
    history.push(tally);

    if (active === 0) {
      notes.push("No active ballots remain; no winner can be determined.");
      return {
        winner: null,
        isTie: false,
        tiedCandidates: [],
        rounds,
        totalBallots,
      };
    }

    // Sort ascending by count, then by ID for a stable order.
    const entries = [...tally.entries()].sort(
      (a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1),
    );
    const max = entries[entries.length - 1][1];
    const min = entries[0][1];

    // Strict majority of continuing ballots? (At most one candidate can
    // exceed half of `active`.)
    if (max * 2 > active) {
      const winner = entries[entries.length - 1][0];
      notes.push(
        `Winner: majority of continuing ballots (${max} of ${active}).`,
      );
      return {
        winner,
        isTie: false,
        tiedCandidates: [],
        rounds,
        totalBallots,
      };
    }

    // Only one candidate left without a majority is impossible when
    // active > 0 (they hold every active ballot); guard regardless.
    if (continuing.size === 1) {
      return {
        winner: entries[0][0],
        isTie: false,
        tiedCandidates: [],
        rounds,
        totalBallots,
      };
    }

    // All remaining candidates exactly tied — IRV cannot resolve this, and
    // this module never breaks a tie by chance.
    if (min === max) {
      const tiedAll = entries.map((e) => e[0]).sort();
      notes.push(
        `All ${tiedAll.length} remaining candidates are exactly tied at ` +
          `${max} vote(s). The count cannot resolve this — a revote is required.`,
      );
      return {
        winner: null,
        isTie: true,
        tiedCandidates: tiedAll,
        rounds,
        totalBallots,
      };
    }

    // 1) Batch elimination: largest prefix whose combined total is strictly
    //    less than the next-lowest candidate's total.
    let batchEnd = -1;
    let prefixSum = 0;
    for (let i = 0; i < entries.length - 1; i++) {
      prefixSum += entries[i][1];
      if (prefixSum < entries[i + 1][1]) batchEnd = i;
    }

    if (batchEnd >= 1) {
      const batch = entries.slice(0, batchEnd + 1);
      const batchTotal = batch.reduce((s, e) => s + e[1], 0);
      for (const [c] of batch) {
        continuing.delete(c);
        round.eliminated.push({ candidateId: c, reason: "batch" });
      }
      notes.push(
        `Batch-eliminated ${batch.length} candidates (combined ${batchTotal} votes, ` +
          `fewer than the next candidate's ${entries[batchEnd + 1][1]}).`,
      );
      continue;
    }

    if (batchEnd === 0) {
      // 2) Unique lowest.
      const [loser] = entries[0];
      continuing.delete(loser);
      round.eliminated.push({ candidateId: loser, reason: "lowest" });
      continue;
    }

    // 3) Tie for last place.
    let tied = entries.filter((e) => e[1] === min).map((e) => e[0]);
    let narrowedByHistory = false;
    for (let h = history.length - 2; h >= 0 && tied.length > 1; h--) {
      const prev = history[h];
      const counts = tied.map((c) => prev.get(c) ?? 0);
      const lowest = Math.min(...counts);
      const next = tied.filter((_, i) => counts[i] === lowest);
      if (next.length < tied.length) {
        narrowedByHistory = true;
        notes.push(
          `Tie-break: round ${h + 1} counts used to narrow ` +
            `${tied.length} tied candidates to ${next.length}.`,
        );
      }
      tied = next;
    }

    if (tied.length === 1 && narrowedByHistory) {
      continuing.delete(tied[0]);
      round.eliminated.push({
        candidateId: tied[0],
        reason: "prior_round_tiebreak",
      });
      continue;
    }

    // 4) Still tied for last after every prior round was consulted. There is
    //    deliberately no draw or coin-flip here: eliminating one of these
    //    candidates by chance could change who wins, so the count stops and
    //    the chapter holds a revote.
    tied.sort();
    notes.push(
      `Tie for last place between ${tied.length} candidates at ${min} vote(s), ` +
        `not separated by any earlier round. The count cannot continue without ` +
        `breaking the tie by chance, so no winner is declared — a revote is required.`,
    );
    return {
      winner: null,
      isTie: true,
      tiedCandidates: tied,
      rounds,
      totalBallots,
    };
  }
}

/**
 * Multi-seat (sequential) IRV, per the bylaws for Judicial Board elections:
 * "All open seats shall be filled in a single election, with seats awarded
 * one at a time: after each candidate is elected, that candidate shall be
 * removed from all ballots and the count repeated until every open seat is
 * filled."
 *
 * Each seat is a full IRV count over the candidates not yet elected, using
 * every ballot's highest-ranked *remaining* choice — so a voter whose first
 * choice already won still has their ballot count fully toward the next
 * seat. No runoff is ever required.
 *
 * Filling stops at the first seat whose count ends in an unresolvable tie
 * (`isTie: true`, with the tied candidates named) rather than breaking it by
 * chance — the chapter is told and holds a revote. Seats already awarded
 * before that point stand, since they were decided outright.
 * `seats: 1` is exactly ordinary IRV.
 */
export function tallyIrvMultiSeat(
  candidateIds: string[],
  ballots: IrvBallot[],
  seats = 1,
): MultiSeatIrvResult {
  const totalBallots = ballots.length;
  // Can't elect more people than there are candidates.
  const targetSeats = Math.max(1, Math.min(seats, candidateIds.length));

  const winners: string[] = [];
  const seatResults: SeatResult[] = [];
  let remaining = [...candidateIds];
  let isTie = false;
  let tiedCandidates: string[] = [];

  for (let seat = 1; seat <= targetSeats; seat++) {
    if (remaining.length === 0) break;

    const result = tallyIrv(remaining, ballots);
    seatResults.push({
      seat,
      winner: result.winner,
      isTie: result.isTie,
      tiedCandidates: result.tiedCandidates,
      rounds: result.rounds,
    });

    if (result.winner === null) {
      // Unresolvable tie, or no ballots left to count — stop filling here.
      isTie = result.isTie;
      tiedCandidates = result.tiedCandidates;
      break;
    }

    winners.push(result.winner);
    // "that candidate shall be removed from all ballots and the count
    // repeated" — dropping them from the candidate pool does exactly this,
    // since each count only ever looks at continuing candidates.
    remaining = remaining.filter((c) => c !== result.winner);
  }

  return {
    seats: targetSeats,
    winners,
    isTie,
    tiedCandidates,
    seatResults,
    totalBallots,
  };
}

// ---------------------------------------------------------------------------
// Plain multiple choice ("choose one")
// ---------------------------------------------------------------------------

/**
 * Simple plurality count for contests that don't need ranking — a yes/no
 * motion, or any ballot where each voter picks exactly one option.
 *
 * Ballots carry a single choice (`rankings: [choiceId]`); an empty ballot is
 * an abstention and counts toward neither side. With `seats` > 1 the top
 * `seats` options are elected.
 *
 * Same no-randomness guarantee as the IRV path: if a tie decides who takes
 * the last available seat, no winner is declared for it — the tied options
 * are named so the chapter can revote. An option with zero votes is never
 * elected. The result is returned in the same shape as the IRV tally so the
 * admin views can render either kind.
 */
export function tallyPlurality(
  candidateIds: string[],
  ballots: IrvBallot[],
  seats = 1,
): MultiSeatIrvResult {
  const totalBallots = ballots.length;
  const targetSeats = Math.max(1, Math.min(seats, candidateIds.length));

  const valid = new Set(candidateIds);
  const tally = new Map<string, number>();
  for (const c of candidateIds) tally.set(c, 0);

  let abstentions = 0;
  for (const ballot of ballots) {
    // Defensive: only the first valid choice counts, extras are ignored.
    const choice = ballot.rankings.find((c) => valid.has(c));
    if (choice === undefined) abstentions++;
    else tally.set(choice, tally.get(choice)! + 1);
  }
  const votesCast = totalBallots - abstentions;

  const notes: string[] = [];
  const round: IrvRound = {
    round: 1,
    tally: Object.fromEntries(tally),
    exhaustedBallots: abstentions,
    eliminated: [],
    notes,
  };

  const winners: string[] = [];
  let isTie = false;
  let tiedCandidates: string[] = [];

  if (votesCast === 0) {
    notes.push("No votes were cast; no winner can be determined.");
  } else {
    // Group options by vote count, highest first.
    const byCount = new Map<number, string[]>();
    for (const [candidate, n] of tally) {
      if (!byCount.has(n)) byCount.set(n, []);
      byCount.get(n)!.push(candidate);
    }
    const counts = [...byCount.keys()].sort((a, b) => b - a);

    for (const n of counts) {
      if (winners.length >= targetSeats) break;
      if (n === 0) {
        // Never seat an option nobody voted for.
        notes.push(
          `${targetSeats - winners.length} seat(s) had no remaining option with any votes.`,
        );
        break;
      }
      const group = byCount.get(n)!.sort();
      if (winners.length + group.length <= targetSeats) {
        winners.push(...group);
        continue;
      }
      // More options tied at this count than seats left — can't split them
      // without guessing.
      isTie = true;
      tiedCandidates = group;
      notes.push(
        `${group.length} options are tied at ${n} vote(s) for ` +
          `${targetSeats - winners.length} remaining seat(s). The count cannot ` +
          `separate them — a revote is required.`,
      );
      break;
    }

    if (winners.length > 0 && !isTie) {
      const top = tally.get(winners[0])!;
      notes.push(
        `${top} of ${votesCast} vote(s) cast` +
          (abstentions > 0 ? `, plus ${abstentions} abstention(s)` : "") +
          `. ${top * 2 > votesCast ? "This is a majority of votes cast." : "Note: this is a plurality, not a majority of votes cast."}`,
      );
    }
  }

  return {
    seats: targetSeats,
    winners,
    isTie,
    tiedCandidates,
    seatResults: [
      { seat: 1, winner: winners[0] ?? null, isTie, tiedCandidates, rounds: [round] },
    ],
    totalBallots,
  };
}
