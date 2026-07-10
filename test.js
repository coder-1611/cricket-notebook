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

// ---- Dismissal thresholds (spec worked examples) ----
eq(e.dismissalInfo(7, 1, 0).threshold, 4, "7-bat vs 1-bowl -> 4");
eq(e.dismissalInfo(7, 1, 0).which, "average", "7v1 average bites");
eq(e.dismissalInfo(7, 10, 0).threshold, 7, "7-bat vs 10-bowl -> 7 (cap)");
eq(e.dismissalInfo(7, 10, 0).which, "cap", "7v10 cap bites");
eq(e.dismissalInfo(7, 7, 0).threshold, 7, "7-bat vs 7-bowl -> 7");
// avg == cap ties resolve to the total-strikes cap (so a top batsman vs a weak
// bowler falls "by total strikes", which the player can actually see)
eq(e.dismissalInfo(10, 10, 0).which, "cap", "10-bat vs 10-bowl -> total-strikes cap");
eq(e.dismissalInfo(7, 7, 0).which, "cap", "7v7 tie -> total-strikes cap");

// ---- Base table must ignore profile === null (spec purity) ----
eq(e.applyProfile(e.resolveBall([4, 6], 8, false), [4, 6], true, false, null),
   e.resolveBall([4, 6], 8, false), "applyProfile(null) is identity");

// ---- Format profiles: balance layer overrides the right cells ----
const T = require("./teams.js");
const prof = (base, pair, high, ia, key) => e.applyProfile(base, pair, high, ia, e.SCORING_PROFILES[key]);
// T20: 4,6 >5 two-4s(8) -> 4 ; 1,6 >5 IA reward preserved (12)
eq(prof(e.resolveBall([4, 6], 8, false), [4, 6], true, false, "T20").runs, 4, "T20 4,6>5 -> 4 runs");
eq(prof(e.resolveBall([1, 6], 8, true), [1, 6], true, true, "T20").runs, 12, "T20 1,6>5 IA reward preserved");
// ODI: 6,6 >5 12 -> 6 ; 2,2 -> 1 ; 4,4 -> 2 ; fours survive (4,5 / 4,6) ; survival bonus raises threshold
eq(prof(e.resolveBall([6, 6], 8, false), [6, 6], true, false, "ODI").runs, 6, "ODI 6,6>5 -> 6 runs");
eq(prof(e.resolveBall([2, 2], 8, false), [2, 2], true, false, "ODI").runs, 1, "ODI 2,2 -> 1 run");
eq(prof(e.resolveBall([4, 4], 3, false), [4, 4], false, false, "ODI").runs, 2, "ODI 4,4 -> 2 runs");
eq(prof(e.resolveBall([4, 6], 8, false), [4, 6], true, false, "ODI").runs, 4, "ODI 4,6>5 -> FOUR kept");
eq(prof(e.resolveBall([4, 5], 8, false), [4, 5], true, false, "ODI").runs, 4, "ODI 4,5 -> FOUR untouched");
eq(prof(e.resolveBall([1, 6], 8, true), [1, 6], true, true, "ODI").runs, 6, "ODI 1,6 IA -> one SIX (iaHi)");
eq(e.dismissalInfo(7, 7, 0, 4).threshold, 11, "ODI survival bonus +4 on threshold");

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
