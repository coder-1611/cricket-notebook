// ============================================================================
// Engine self-tests — full 84-case dice table + dismissal + match integrity.
// Run: node test.js   (exit 0 = all pass)
// ============================================================================
const e = require("./engine.js");
let pass = 0, fail = 0;
const fails = [];
function eq(got, want, msg) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; fails.push(`${msg}: got ${g} want ${w}`); }
}

// ---- Full dice table: [runs, strikes] for [>5 no-IA, >5 IA, ≤5 no-IA, ≤5 IA] ----
// Each entry: roll -> { hi:[runs,strk], hiIA:[...], lo:[...], loIA:[...] }
const TABLE = {
  "1,1": { hi: [1,0], hiIA: [1,0], lo: [1,0], loIA: [1,0] },
  "1,2": { hi: [2,0], hiIA: [1,0], lo: [2,0], loIA: [2,0] },
  "1,3": { hi: [1,0], hiIA: [1,0], lo: [1,0], loIA: [1,0] },
  "1,4": { hi: [1,0], hiIA: [1,0], lo: [1,0], loIA: [1,0] },
  "1,5": { hi: [1,0], hiIA: [1,0], lo: [1,0], loIA: [1,0] },
  "1,6": { hi: [4,0], hiIA: [12,0], lo: [4,0], loIA: [4,0] },
  "2,2": { hi: [2,0], hiIA: [2,0], lo: [2,0], loIA: [2,0] },
  "2,3": { hi: [0,1], hiIA: [0,1], lo: [0,1], loIA: [0,1] },
  "2,4": { hi: [2,0], hiIA: [2,0], lo: [2,0], loIA: [2,0] },
  "2,5": { hi: [0,1], hiIA: [0,1], lo: [0,1], loIA: [0,1] },
  "2,6": { hi: [2,0], hiIA: [2,0], lo: [2,0], loIA: [2,0] },
  "3,3": { hi: [0,0], hiIA: [0,0], lo: [0,0], loIA: [0,0] },
  "3,4": { hi: [0,0], hiIA: [0,0], lo: [0,0], loIA: [0,0] },
  "3,5": { hi: [0,1], hiIA: [0,1], lo: [0,1], loIA: [0,1] },
  "3,6": { hi: [0,0], hiIA: [0,0], lo: [0,0], loIA: [0,0] },
  "4,4": { hi: [8,0], hiIA: [8,0], lo: [8,0], loIA: [8,0] },
  "4,5": { hi: [4,0], hiIA: [4,1], lo: [4,0], loIA: [4,0] },   // +Strike is >5 IA only
  "4,6": { hi: [8,0], hiIA: [8,0], lo: [0,0], loIA: [0,0] },
  "5,5": { hi: [0,2], hiIA: [0,4], lo: [0,2], loIA: [0,2] },
  "5,6": { hi: [0,1], hiIA: [0,1], lo: [0,1], loIA: [0,1] },
  "6,6": { hi: [12,0], hiIA: [12,0], lo: [0,0], loIA: [0,0] }
};
function rs(pair, rating, ia) { const o = e.resolveBall(pair, rating, ia); return [o.runs, o.strikes]; }
for (const key in TABLE) {
  const [a, b] = key.split(",").map(Number);
  const t = TABLE[key];
  eq(rs([a, b], 8, false), t.hi,  `${key} >5      `);
  eq(rs([a, b], 8, true),  t.hiIA,`${key} >5 IA   `);
  eq(rs([a, b], 3, false), t.lo,  `${key} ≤5      `);
  eq(rs([a, b], 3, true),  t.loIA,`${key} ≤5 IA   `);
  // order-independence
  eq(rs([b, a], 8, true), t.hiIA, `${key} reversed`);
}
// rating exactly 5 must use the ≤5 branch
eq(rs([6, 6], 5, false), [0, 0], "6,6 at rating 5 = ≤5 branch (Dot)");
eq(rs([4, 6], 5, false), [0, 0], "4,6 at rating 5 = ≤5 branch (Dot)");

// ---- Dismissal: two independent bars ------------------------------------
// dismissalInfo(batting, bowling, totalStrikes, bowlerStrikes, bonus)
//   cap   = batting rating          -> out when TOTAL strikes (any bowler) reach it
//   avg   = floor((bat+bowl)/2)+bon -> out when THIS bowler's own tally reaches it
// The live average is PER BOWLER: a strike from a different bowler advances the
// total but not this bowler's tally.
eq(e.dismissalInfo(7, 1, 0, 0).avg, 4, "7-bat vs 1-bowl live average = 4");
eq(e.dismissalInfo(7, 1, 0, 0).cap, 7, "7-bat cap = 7 (rating)");
eq(e.dismissalInfo(7, 1, 3, 3).out, false, "3 of this bowler's strikes (<4) -> not out");
eq(e.dismissalInfo(7, 1, 4, 4).which, "average", "4th strike from this bowler -> average bites");

// The user's headline example, encoded exactly:
//  10-bat takes 4 strikes from a 1-bowl (bar = floor(11/2)=5) -> survives.
eq(e.dismissalInfo(10, 1, 4, 4).out, false, "10v1: 4 strikes from this bowler (<5) -> survives");
//  then 4 "random" strikes from OTHER bowlers -> total 8, this bowler still on 4.
eq(e.dismissalInfo(10, 1, 8, 4).out, false, "10v1: 4 random strikes elsewhere don't matter (total 8<10, bowler 4<5)");
//  the 1-bowl returns and lands a 5th -> total 9, this bowler on 5 -> OUT (average).
eq(e.dismissalInfo(10, 1, 9, 5).which, "average", "10v1: same bowler's 5th strike -> OUT by live average");

// Rating cap is universal: total strikes reach the rating even when no single
// bowler filled their bar.
eq(e.dismissalInfo(10, 5, 10, 3).which, "cap", "total strikes reach rating (no bowler at avg) -> out by total strikes");
eq(e.dismissalInfo(10, 5, 9, 3).out, false, "9 total (<10) and bowler 3 (<7) -> not out");

// ---- Base table must ignore profile === null (spec purity) ----
eq(e.applyProfile(e.resolveBall([4, 6], 8, false), [4, 6], true, false, null),
   e.resolveBall([4, 6], 8, false), "applyProfile(null) is identity");

// ---- Format profiles: balance layer overrides the right cells ----
const T = require("./teams.js");
const prof = (base, pair, high, ia, key) => e.applyProfile(base, pair, high, ia, e.SCORING_PROFILES[key]);
// T20: 4,6 >5 two-4s(8) -> 4 ; 1,6 >5 IA reward preserved (12)
eq(prof(e.resolveBall([4, 6], 8, false), [4, 6], true, false, "T20").runs, 4, "T20 4,6>5 -> 4 runs");
eq(prof(e.resolveBall([1, 6], 8, true), [1, 6], true, true, "T20").runs, 12, "T20 1,6>5 IA reward preserved");
// T20 strike production: three pure-dot cells become "beaten" balls (a strike),
// so wickets rise without lowering any threshold. Base table keeps them as dots.
eq(e.resolveBall([3, 4], 8, false).strikes, 0, "base 3,4 is a dot (profiles off)");
eq(prof(e.resolveBall([3, 4], 8, false), [3, 4], true, false, "T20").strikes, 1, "T20 3,4 -> Strike");
eq(prof(e.resolveBall([3, 6], 8, false), [3, 6], true, false, "T20").strikes, 1, "T20 3,6 -> Strike");
eq(prof(e.resolveBall([3, 3], 3, false), [3, 3], false, false, "T20").strikes, 1, "T20 3,3 -> Strike (both branches)");
eq(prof(e.resolveBall([3, 4], 8, false), [3, 4], true, false, "T20").runs, 0, "T20 3,4 strike concedes no runs");
// ODI: 6,6 >5 12 -> 6 ; 4,4 -> 2 ; fours survive (4,5 / 4,6) ; strike-damp on 5,6 & 5,5
eq(prof(e.resolveBall([6, 6], 8, false), [6, 6], true, false, "ODI").runs, 6, "ODI 6,6>5 -> 6 runs");
eq(prof(e.resolveBall([2, 2], 8, false), [2, 2], true, false, "ODI").runs, 0, "ODI 2,2 -> Dot");
eq(prof(e.resolveBall([4, 4], 3, false), [4, 4], false, false, "ODI").runs, 2, "ODI 4,4 -> 2 runs");
eq(prof(e.resolveBall([4, 6], 8, false), [4, 6], true, false, "ODI").runs, 4, "ODI 4,6>5 -> FOUR kept");
eq(prof(e.resolveBall([4, 5], 8, false), [4, 5], true, false, "ODI").runs, 4, "ODI 4,5 -> FOUR untouched");
eq(prof(e.resolveBall([1, 6], 8, true), [1, 6], true, true, "ODI").runs, 6, "ODI 1,6 IA -> one SIX (iaHi)");
eq(prof(e.resolveBall([5, 6], 8, false), [5, 6], true, false, "ODI").strikes, 0, "ODI 5,6 strike -> dot");
eq(prof(e.resolveBall([5, 5], 8, false), [5, 5], true, false, "ODI").strikes, 1, "ODI 5,5 double-strike -> single");

// The rating cap is the EXACT batting rating (format-independent); the survival
// bonus lifts only the per-bowler live average.
eq(e.dismissalInfo(10, 1, 0, 0, 0).cap, 10, "cap = batting rating (T20, no bonus)");
eq(e.dismissalInfo(10, 1, 0, 0, 4).cap, 10, "cap = batting rating (ODI bonus does NOT raise cap)");
eq(e.dismissalInfo(10, 1, 0, 0, 4).avg, 9, "ODI bonus +4 lifts the live average only (floor((10+1)/2)+4)");
// With the +4 bonus a single bowler's bar (9) sits below the cap (10) but needs
// 9 strikes from ONE bowler — so in ODI almost everyone falls by total strikes.
eq(e.dismissalInfo(10, 2, 10, 5, 4).which, "cap", "ODI: total reaches rating before any bowler fills their +4 bar");

// ---- Powerplay/Death boost layer ----
const bprof = (pair, r, ia, key, phase) =>
  e.applyProfile(e.resolveBall(pair, r, ia), pair, r > 5, ia, e.SCORING_PROFILES[key], phase);
eq(bprof([2, 4], 8, false, "T20", "Powerplay").runs, 4, "T20 PP boost: 2,4 -> FOUR");
eq(bprof([2, 4], 8, false, "T20", "Death").runs, 4, "T20 Death boost: 2,4 -> FOUR");
eq(bprof([2, 4], 8, false, "T20", "Middle").runs, 2, "T20 Middle: 2,4 stays Double");
eq(bprof([2, 6], 8, false, "ODI", "Middle").runs, 0, "ODI Middle: 2,6 dot-trimmed");
eq(bprof([2, 6], 8, false, "ODI", "Powerplay").runs, 2, "ODI PP boost: 2,6 -> Double");
eq(bprof([4, 4], 8, false, "ODI", "Death").runs, 4, "ODI Death boost: 4,4 -> FOUR");
eq(bprof([1, 6], 8, true, "T20", "Powerplay").runs, 12, "T20 PP: IA two-sixes never dampened");

// ---- Match integrity across seeds & formats ----
let seedsChecked = 0, ties = 0;
for (const fmt of [T.FORMATS.T20, T.FORMATS.ODI]) {
  for (let s = 1; s <= 150; s++) {
    const m = e.simulateMatch(T.India, T.Australia, { format: fmt, seed: s, stadium: "x" });
    seedsChecked++;
    for (const inn of m.innings) {
      if (inn.wickets > 10) fails.push(`${fmt.key} seed ${s}: >10 wickets`), fail++;
      for (const b of inn.bowlerStats) if (b.overs > fmt.maxOvers) fails.push(`${fmt.key} seed ${s}: ${b.name} bowled ${b.overs} overs`), fail++;
    }
    const i2 = m.innings[1];
    if (i2.total >= m.target && m.result.type !== "chase") fails.push(`${fmt.key} seed ${s}: chase result wrong`), fail++;
    if (m.result.type === "tie") ties++;

    // ---- compound (two-sixes / two-fours) split-across-two-balls invariants ----
    for (const inn of m.innings) {
      const bs = inn.ballLog.reduce((sum, b) => sum + b.runs, 0);
      if (bs !== inn.total) fails.push(`${fmt.key} seed ${s} inn${inn.inningNo}: ballsum ${bs} != total ${inn.total}`), fail++;
      inn.ballLog.forEach((b, i) => {
        // an un-split TWO SIXES/TWO FOURS may only appear on the final ball of the innings
        if ((b.label === "TWO SIXES" || b.label === "TWO FOURS") && i !== inn.ballLog.length - 1)
          fails.push(`${fmt.key} seed ${s}: un-split compound mid-innings`), fail++;
        // a compound first-half is followed by its second-half unless the innings ended right after
        if (b.compound === "first") {
          const nxt = inn.ballLog[i + 1];
          if (nxt && nxt.compound !== "second") fails.push(`${fmt.key} seed ${s}: first not followed by second`), fail++;
          // a split half is only ever worth 6 (SIX) or 4 (FOUR), never the compound 12/8
          if (b.runs !== 6 && b.runs !== 4) fails.push(`${fmt.key} seed ${s}: split first half worth ${b.runs}`), fail++;
        }
      });
    }
  }
}
if (seedsChecked === 300) pass++; else fail++;

console.log(`\nDice table + profiles + dismissal + ${seedsChecked} seeds (${ties} ties)`);
console.log(`PASS ${pass}  FAIL ${fail}`);
if (fails.length) { console.log("\nFailures:"); fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("✓ All engine tests passed.");
