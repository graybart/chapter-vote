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
 *      4. Still tied → deterministic pseudo-random draw seeded from the
 *         contest ID + round number, recorded in the audit log.
 *  - If ALL remaining candidates are exactly tied, the tally reports
 *    `winner: null, isTie: true` for the chair to resolve (per Robert's
 *    Rules) rather than the app silently picking.
 */

export interface IrvBallot {
  /** Candidate IDs in preference order, index 0 = first choice. */
  rankings: string[];
}

export type EliminationReason =
  | "lowest" // unique lowest first-choice count
  | "batch" // trailing group mathematically eliminated together
  | "prior_round_tiebreak" // lost a backward tie-break
  | "random_tiebreak"; // seeded deterministic draw (logged)

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
  rounds: IrvRound[];
  totalBallots: number;
}

/** FNV-1a 32-bit string hash — deterministic tie-break source. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
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
  seed: string,
): IrvResult {
  const totalBallots = ballots.length;
  const rounds: IrvRound[] = [];

  if (candidateIds.length === 0) {
    return { winner: null, isTie: false, rounds, totalBallots };
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
      return { winner: null, isTie: false, rounds, totalBallots };
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
      return { winner, isTie: false, rounds, totalBallots };
    }

    // Only one candidate left without a majority is impossible when
    // active > 0 (they hold every active ballot); guard regardless.
    if (continuing.size === 1) {
      return { winner: entries[0][0], isTie: false, rounds, totalBallots };
    }

    // All remaining candidates exactly tied — IRV cannot resolve this.
    if (min === max) {
      notes.push(
        "All remaining candidates are exactly tied; result referred to the chair.",
      );
      return { winner: null, isTie: true, rounds, totalBallots };
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

    // 4) Deterministic seeded draw among the still-tied candidates.
    tied.sort();
    const idx = hashString(`${seed}:round${roundNum}`) % tied.length;
    const loser = tied[idx];
    continuing.delete(loser);
    round.eliminated.push({ candidateId: loser, reason: "random_tiebreak" });
    notes.push(
      `Tie for last place unresolved by prior rounds; deterministic seeded ` +
        `draw eliminated 1 of ${tied.length} (seed "${seed}", round ${roundNum}).`,
    );
  }
}
