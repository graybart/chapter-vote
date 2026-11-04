import { describe, it, expect } from "vitest";
import {
  tallyIrv,
  tallyIrvMultiSeat,
  tallyPlurality,
  validateRankings,
  type IrvBallot,
} from "./irv";

const b = (...rankings: string[]): IrvBallot => ({ rankings });
const times = (n: number, ...rankings: string[]): IrvBallot[] =>
  Array.from({ length: n }, () => ({ rankings: [...rankings] }));

describe("tallyIrv", () => {
  it("declares a first-round majority winner", () => {
    const result = tallyIrv(
      ["A", "B", "C"],
      [...times(3, "A"), b("B"), b("C")],
    );
    expect(result.winner).toBe("A");
    expect(result.isTie).toBe(false);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0].tally).toEqual({ A: 3, B: 1, C: 1 });
  });

  it("requires a STRICT majority (2-2 of 4 is not a win)", () => {
    const result = tallyIrv(["A", "B"], [...times(2, "A"), ...times(2, "B")]);
    expect(result.winner).toBeNull();
    expect(result.isTie).toBe(true);
  });

  it("eliminates the lowest candidate and redistributes", () => {
    // R1: A4 B3 C2 (9 active, no majority) → C out → C's votes go to B → B5 wins
    const result = tallyIrv(
      ["A", "B", "C"],
      [...times(4, "A"), ...times(3, "B"), ...times(2, "C", "B")],
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
    );
    expect(result.rounds[1].eliminated).toEqual([
      { candidateId: "C", reason: "prior_round_tiebreak" },
    ]);
    expect(result.winner).toBe("A");
  });

  it("refuses to break a last-place tie by chance and names the tied candidates", () => {
    // A2 B2 C3: A and B are tied for last with no earlier round to separate
    // them. Eliminating either by a draw could change the outcome, so the
    // count stops instead of guessing.
    const result = tallyIrv(
      ["A", "B", "C"],
      [...times(2, "A"), ...times(2, "B"), ...times(3, "C")],
    );
    expect(result.winner).toBeNull();
    expect(result.isTie).toBe(true);
    expect(result.tiedCandidates).toEqual(["A", "B"]);
  });

  it("is a pure function of the ballots — no hidden randomness", () => {
    const ballots = [...times(2, "A"), ...times(2, "B"), ...times(3, "C")];
    const runs = Array.from({ length: 25 }, () =>
      tallyIrv(["A", "B", "C"], ballots),
    );
    for (const r of runs) expect(r).toEqual(runs[0]);
  });

  it("never reports an elimination decided by chance", () => {
    // Exhaustively: no tally may ever produce a reason outside the three
    // deterministic ones.
    const allowed = new Set(["lowest", "batch", "prior_round_tiebreak"]);
    const scenarios = [
      [...times(5, "A"), ...times(4, "B"), ...times(3, "C"), b("D", "C")],
      [...times(6, "A"), ...times(5, "B"), ...times(2, "C"), b("D")],
      [...times(2, "A"), ...times(2, "B"), ...times(3, "C")],
      [...times(4, "A", "B"), ...times(3, "B", "C"), ...times(2, "C", "A")],
    ];
    for (const ballots of scenarios) {
      const r = tallyIrv(["A", "B", "C", "D"], ballots);
      for (const round of r.rounds) {
        for (const e of round.eliminated) expect(allowed.has(e.reason)).toBe(true);
      }
    }
  });

  it("reports an unresolvable exact tie instead of picking a winner", () => {
    const result = tallyIrv(
      ["A", "B"],
      [...times(2, "A"), ...times(2, "B")],
    );
    expect(result.winner).toBeNull();
    expect(result.isTie).toBe(true);
  });

  it("handles zero ballots", () => {
    const result = tallyIrv(["A", "B"], []);
    expect(result.winner).toBeNull();
    expect(result.isTie).toBe(false);
    expect(result.totalBallots).toBe(0);
  });

  it("handles a single candidate", () => {
    expect(tallyIrv(["A"], times(2, "A")).winner).toBe("A");
    expect(tallyIrv(["A"], []).winner).toBeNull();
  });

  it("handles no candidates", () => {
    const result = tallyIrv([], [b("X")]);
    expect(result.winner).toBeNull();
    expect(result.rounds).toHaveLength(0);
  });

  it("treats abstentions (empty ballots) as exhausted and outside the majority denominator", () => {
    // 5 ballots cast, 2 abstain. Majority = of the 3 active ballots, so A's
    // 2 votes win in round 1 (2 > 1.5).
    const result = tallyIrv(
      ["A", "B"],
      [...times(2, "A"), b("B"), { rankings: [] }, { rankings: [] }],
    );
    expect(result.winner).toBe("A");
    expect(result.rounds[0].exhaustedBallots).toBe(2);
    expect(result.totalBallots).toBe(5);
  });

  it("sanitizes duplicate and unknown candidates on stored ballots", () => {
    const result = tallyIrv(
      ["A", "B"],
      [...times(2, "A", "A"), b("B", "GHOST", "A")],
    );
    expect(result.rounds[0].tally).toEqual({ A: 2, B: 1 });
    expect(result.winner).toBe("A");
  });

  it("supports partial rankings that exhaust mid-count", () => {
    // R1: A4 B3 C3 (10 ballots, majority needs >5). C is the unique lowest
    // after the prior-round comparison? No — B and C tie at 3, and there is
    // no earlier round, so the count must stop rather than guess.
    const tie = tallyIrv(
      ["A", "B", "C"],
      [...times(4, "A"), ...times(3, "B", "A"), ...times(3, "C")],
    );
    expect(tie.isTie).toBe(true);
    expect(tie.tiedCandidates).toEqual(["B", "C"]);

    // With a clear ordering the transfers work normally: R1 A4 B3 C2 → C out
    // (its ballots exhaust) → A4 of 7 active wins.
    const resolved = tallyIrv(
      ["A", "B", "C"],
      [...times(4, "A"), ...times(3, "B", "A"), ...times(2, "C")],
    );
    expect(resolved.winner).toBe("A");
    expect(resolved.isTie).toBe(false);
  });
});

describe("tallyIrvMultiSeat (Judicial Board multi-seat rule)", () => {
  // 5×[A,B,C], 3×[B,C,A], 2×[C,A,B]
  const jbBallots = [
    ...times(5, "A", "B", "C"),
    ...times(3, "B", "C", "A"),
    ...times(2, "C", "A", "B"),
  ];

  it("fills every seat in one election, awarding them one at a time", () => {
    const result = tallyIrvMultiSeat(["A", "B", "C"], jbBallots, 3);
    // Seat 1: A5 B3 C2 → C out, transfers to A → A7 wins.
    // Seat 2: A removed from all ballots → B8 C2 → B wins.
    // Seat 3: only C remains → C wins.
    expect(result.winners).toEqual(["A", "B", "C"]);
    expect(result.isTie).toBe(false);
    expect(result.seats).toBe(3);
    expect(result.seatResults).toHaveLength(3);
    expect(result.seatResults[0].rounds).toHaveLength(2); // needed a transfer
    expect(result.totalBallots).toBe(10);
  });

  it("elects only as many winners as there are seats", () => {
    const result = tallyIrvMultiSeat(["A", "B", "C"], jbBallots, 2);
    expect(result.winners).toEqual(["A", "B"]);
    expect(result.seatResults).toHaveLength(2);
  });

  it("counts a ballot toward the next seat once its top choice is elected", () => {
    // The 5 [A,B,C] voters elect A in seat 1; in seat 2 those same ballots
    // must count for B (not sit idle), giving B 8 of 10.
    const result = tallyIrvMultiSeat(["A", "B", "C"], jbBallots, 2);
    expect(result.seatResults[1].rounds[0].tally).toEqual({ B: 8, C: 2 });
  });

  it("caps seats at the number of candidates", () => {
    const result = tallyIrvMultiSeat(
      ["A", "B"],
      [...times(3, "A", "B"), ...times(2, "B", "A")],
      5,
    );
    expect(result.seats).toBe(2);
    expect(result.winners).toEqual(["A", "B"]);
  });

  it("behaves exactly like single-seat IRV when seats = 1", () => {
    const multi = tallyIrvMultiSeat(["A", "B", "C"], jbBallots, 1);
    const single = tallyIrv(["A", "B", "C"], jbBallots);
    expect(multi.winners).toEqual([single.winner]);
    expect(multi.seatResults[0].rounds).toEqual(single.rounds);
  });

  it("stops filling at an unresolvable tie, keeping the seats already decided", () => {
    // 6×[A,B], 2×[C], 2×[D] over 3 seats.
    // Seat 1: A takes 6 of 10 outright. Seat 2: those ballots move to B, 6 of
    // 10. Seat 3: they exhaust, leaving C and D tied 2–2 — unbreakable without
    // guessing, so filling stops there.
    const result = tallyIrvMultiSeat(
      ["A", "B", "C", "D"],
      [...times(6, "A", "B"), ...times(2, "C"), ...times(2, "D")],
      3,
    );
    expect(result.winners).toEqual(["A", "B"]); // decided outright — these stand
    expect(result.isTie).toBe(true);
    expect(result.seatResults).toHaveLength(3);
    expect(result.seatResults[2].isTie).toBe(true);
    expect(result.seatResults[2].winner).toBeNull();
    // Names exactly who the revote should be between.
    expect(result.tiedCandidates).toEqual(["C", "D"]);
  });

  it("is a pure function of the ballots — no hidden randomness", () => {
    const runs = Array.from({ length: 25 }, () =>
      tallyIrvMultiSeat(["A", "B", "C"], jbBallots, 3),
    );
    for (const r of runs) expect(r).toEqual(runs[0]);
  });

  it("leaves a seat unfilled rather than electing a candidate with zero support", () => {
    // 2 seats, but nobody ranked B at all — every ballot is exhausted by the
    // time seat 2 is counted. B is not auto-elected; the seat goes unfilled
    // for the chapter to handle (re-nominate / revote).
    const result = tallyIrvMultiSeat(
      ["A", "B"],
      [...times(2, "A"), { rankings: [] }],
      2,
    );
    expect(result.winners).toEqual(["A"]);
    expect(result.isTie).toBe(false); // not a tie — simply no support
    expect(result.seatResults[1].winner).toBeNull();
  });

  it("still elects a sole remaining candidate who has real support", () => {
    // Seat 2: the [A,B] ballots transfer to B, so B is elected normally.
    const result = tallyIrvMultiSeat(
      ["A", "B"],
      [...times(2, "A", "B"), b("B")],
      2,
    );
    expect(result.winners).toEqual(["A", "B"]);
  });

  it("handles no ballots at all", () => {
    const empty = tallyIrvMultiSeat(["A", "B"], [], 2);
    expect(empty.winners).toEqual([]);
    expect(empty.isTie).toBe(false);
  });
});

describe("tallyPlurality (plain multiple choice)", () => {
  it("elects the option with the most votes", () => {
    const result = tallyPlurality(
      ["YES", "NO"],
      [...times(7, "YES"), ...times(3, "NO")],
    );
    expect(result.winners).toEqual(["YES"]);
    expect(result.isTie).toBe(false);
    expect(result.seatResults[0].rounds[0].tally).toEqual({ YES: 7, NO: 3 });
  });

  it("refuses to break a tie and names the tied options", () => {
    const result = tallyPlurality(
      ["YES", "NO"],
      [...times(5, "YES"), ...times(5, "NO")],
    );
    expect(result.winners).toEqual([]);
    expect(result.isTie).toBe(true);
    expect(result.tiedCandidates).toEqual(["NO", "YES"]);
  });

  it("keeps abstentions out of the vote count but records them", () => {
    const result = tallyPlurality(
      ["YES", "NO"],
      [...times(3, "YES"), b("NO"), { rankings: [] }, { rankings: [] }],
    );
    expect(result.winners).toEqual(["YES"]);
    expect(result.totalBallots).toBe(6);
    expect(result.seatResults[0].rounds[0].exhaustedBallots).toBe(2);
    // Majority is judged against the 4 votes actually cast, not all 6 ballots.
    expect(result.seatResults[0].rounds[0].notes.join(" ")).toContain(
      "majority of votes cast",
    );
  });

  it("flags a winner who only has a plurality, not a majority", () => {
    const result = tallyPlurality(
      ["A", "B", "C"],
      [...times(4, "A"), ...times(3, "B"), ...times(3, "C")],
    );
    expect(result.winners).toEqual(["A"]);
    expect(result.seatResults[0].rounds[0].notes.join(" ")).toContain(
      "not a majority",
    );
  });

  it("takes the top N when several seats are open", () => {
    const result = tallyPlurality(
      ["A", "B", "C", "D"],
      [...times(5, "A"), ...times(4, "B"), ...times(2, "C"), b("D")],
      2,
    );
    expect(result.winners).toEqual(["A", "B"]);
    expect(result.isTie).toBe(false);
  });

  it("reports a tie only when it decides the last open seat", () => {
    // A is clearly in; B and C tie for the single remaining seat.
    const result = tallyPlurality(
      ["A", "B", "C"],
      [...times(5, "A"), ...times(3, "B"), ...times(3, "C")],
      2,
    );
    expect(result.winners).toEqual(["A"]);
    expect(result.isTie).toBe(true);
    expect(result.tiedCandidates).toEqual(["B", "C"]);
  });

  it("seats tied options when there is room for all of them", () => {
    // B and C tie, but both fit in the 3 open seats — no tie to resolve.
    const result = tallyPlurality(
      ["A", "B", "C"],
      [...times(5, "A"), ...times(3, "B"), ...times(3, "C")],
      3,
    );
    expect(result.winners).toEqual(["A", "B", "C"]);
    expect(result.isTie).toBe(false);
  });

  it("never elects an option with zero votes", () => {
    const result = tallyPlurality(["A", "B"], times(3, "A"), 2);
    expect(result.winners).toEqual(["A"]);
    expect(result.isTie).toBe(false);
  });

  it("handles an all-abstention contest", () => {
    const result = tallyPlurality(["A", "B"], [{ rankings: [] }]);
    expect(result.winners).toEqual([]);
    expect(result.isTie).toBe(false);
  });

  it("is a pure function of the ballots — no hidden randomness", () => {
    const ballots = [...times(5, "A"), ...times(5, "B"), ...times(2, "C")];
    const runs = Array.from({ length: 25 }, () =>
      tallyPlurality(["A", "B", "C"], ballots),
    );
    for (const r of runs) expect(r).toEqual(runs[0]);
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
