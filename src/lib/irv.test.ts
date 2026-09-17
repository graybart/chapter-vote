import { describe, it, expect } from "vitest";
import { tallyIrv, validateRankings, type IrvBallot } from "./irv";

const b = (...rankings: string[]): IrvBallot => ({ rankings });
const times = (n: number, ...rankings: string[]): IrvBallot[] =>
  Array.from({ length: n }, () => ({ rankings: [...rankings] }));

describe("tallyIrv", () => {
  it("declares a first-round majority winner", () => {
    const result = tallyIrv(
      ["A", "B", "C"],
      [...times(3, "A"), b("B"), b("C")],
      "seed",
    );
    expect(result.winner).toBe("A");
    expect(result.isTie).toBe(false);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0].tally).toEqual({ A: 3, B: 1, C: 1 });
  });

  it("requires a STRICT majority (2-2 of 4 is not a win)", () => {
    const result = tallyIrv(["A", "B"], [...times(2, "A"), ...times(2, "B")], "s");
    expect(result.winner).toBeNull();
    expect(result.isTie).toBe(true);
  });

  it("eliminates the lowest candidate and redistributes", () => {
    // R1: A4 B3 C2 (9 active, no majority) → C out → C's votes go to B → B5 wins
    const result = tallyIrv(
      ["A", "B", "C"],
      [...times(4, "A"), ...times(3, "B"), ...times(2, "C", "B")],
      "seed",
    );
    expect(result.winner).toBe("B");
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0].eliminated).toEqual([
      { candidateId: "C", reason: "lowest" },
    ]);
    expect(result.rounds[1].tally).toEqual({ A: 4, B: 5 });
  });

  it("removes exhausted ballots from the majority denominator", () => {
    // R1: A4 B3 C2 → C out, C's ballots have no next choice → exhausted.
    // R2: 7 active, A4 > 3.5 → A wins.
    const result = tallyIrv(
      ["A", "B", "C"],
      [...times(4, "A"), ...times(3, "B"), ...times(2, "C")],
      "seed",
    );
    expect(result.winner).toBe("A");
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[1].exhaustedBallots).toBe(2);
    expect(result.rounds[1].tally).toEqual({ A: 4, B: 3 });
  });

  it("batch-eliminates a trailing group that cannot catch up", () => {
    // A6 B5 C2 D1 → D+C = 3 < B's 5 → both out in round 1.
    const result = tallyIrv(
      ["A", "B", "C", "D"],
      [...times(6, "A"), ...times(5, "B"), ...times(2, "C"), b("D")],
      "seed",
    );
    expect(result.rounds[0].eliminated).toHaveLength(2);
    expect(result.rounds[0].eliminated.map((e) => e.candidateId).sort()).toEqual(
      ["C", "D"],
    );
    for (const e of result.rounds[0].eliminated) expect(e.reason).toBe("batch");
    expect(result.winner).toBe("A"); // R2: A6 of 11 active
  });

  it("breaks last-place ties by the most recent differing prior round", () => {
    // R1: A5 B4 C3 D2 → D out (unique lowest); one D ballot flows to C.
    // R2: A5 B4 C4 → B/C tied; R1 had C3 < B4 → C eliminated by prior round.
    const result = tallyIrv(
      ["A", "B", "C", "D"],
      [
        ...times(5, "A"),
        ...times(4, "B"),
        ...times(3, "C"),
        b("D", "C"),
        b("D"),
      ],
      "seed",
    );
    expect(result.rounds[1].eliminated).toEqual([
      { candidateId: "C", reason: "prior_round_tiebreak" },
    ]);
    expect(result.winner).toBe("A");
  });

  it("uses a deterministic seeded draw when a tie has no differing prior round", () => {
    const ballots = [...times(2, "A"), ...times(2, "B"), ...times(3, "C")];
    const r1 = tallyIrv(["A", "B", "C"], ballots, "contest-123");
    const r2 = tallyIrv(["A", "B", "C"], ballots, "contest-123");
    expect(r1).toEqual(r2); // deterministic for the same seed
    expect(r1.rounds[0].eliminated[0].reason).toBe("random_tiebreak");
    expect(["A", "B"]).toContain(r1.rounds[0].eliminated[0].candidateId);
    // Whichever of A/B is eliminated, its ballots exhaust and C wins 3 of 5.
    expect(r1.winner).toBe("C");
  });

  it("reports an unresolvable exact tie instead of picking a winner", () => {
    const result = tallyIrv(
      ["A", "B"],
      [...times(2, "A"), ...times(2, "B")],
      "seed",
    );
    expect(result.winner).toBeNull();
    expect(result.isTie).toBe(true);
  });

  it("handles zero ballots", () => {
    const result = tallyIrv(["A", "B"], [], "seed");
    expect(result.winner).toBeNull();
    expect(result.isTie).toBe(false);
    expect(result.totalBallots).toBe(0);
  });

  it("handles a single candidate", () => {
    expect(tallyIrv(["A"], times(2, "A"), "s").winner).toBe("A");
    expect(tallyIrv(["A"], [], "s").winner).toBeNull();
  });

  it("handles no candidates", () => {
    const result = tallyIrv([], [b("X")], "s");
    expect(result.winner).toBeNull();
    expect(result.rounds).toHaveLength(0);
  });

  it("treats abstentions (empty ballots) as exhausted and outside the majority denominator", () => {
    // 5 ballots cast, 2 abstain. Majority = of the 3 active ballots, so A's
    // 2 votes win in round 1 (2 > 1.5).
    const result = tallyIrv(
      ["A", "B"],
      [...times(2, "A"), b("B"), { rankings: [] }, { rankings: [] }],
      "seed",
    );
    expect(result.winner).toBe("A");
    expect(result.rounds[0].exhaustedBallots).toBe(2);
    expect(result.totalBallots).toBe(5);
  });

  it("sanitizes duplicate and unknown candidates on stored ballots", () => {
    const result = tallyIrv(
      ["A", "B"],
      [...times(2, "A", "A"), b("B", "GHOST", "A")],
      "seed",
    );
    expect(result.rounds[0].tally).toEqual({ A: 2, B: 1 });
    expect(result.winner).toBe("A");
  });

  it("supports partial rankings that exhaust mid-count", () => {
    // 3×[A], 3×[B,A], 4×[C] ... wait: R1 A3 B3 C4 (10, need 6) —
    // tie at bottom A/B, no prior round → seeded draw; either way the
    // survivor collects transfers or C faces exhaustion checks.
    const result = tallyIrv(
      ["A", "B", "C"],
      [...times(3, "A"), ...times(3, "B", "A"), ...times(4, "C")],
      "x",
    );
    // If A eliminated: B3(+0) C4, B ballots' A next-choice gone → A3 exhausted? No:
    // A's own 3 ballots exhaust → active 7, C4 > 3.5 → C wins.
    // If B eliminated: transfers to A → A6 C4, A6 of 10 → A wins.
    expect(["A", "C"]).toContain(result.winner);
    expect(result.isTie).toBe(false);
  });
});

describe("validateRankings", () => {
  const cands = ["A", "B", "C"];

  it("accepts a valid full ranking", () => {
    expect(validateRankings(cands, ["B", "A", "C"])).toBeNull();
  });

  it("accepts a valid partial ranking", () => {
    expect(validateRankings(cands, ["C"])).toBeNull();
  });

  it("rejects an empty ballot", () => {
    expect(validateRankings(cands, [])).toMatch(/at least one/);
  });

  it("rejects non-array input", () => {
    expect(validateRankings(cands, "A")).toMatch(/at least one/);
  });

  it("rejects duplicates", () => {
    expect(validateRankings(cands, ["A", "A"])).toMatch(/twice/);
  });

  it("rejects unknown candidates", () => {
    expect(validateRankings(cands, ["A", "Z"])).toMatch(/unknown/i);
  });
});
