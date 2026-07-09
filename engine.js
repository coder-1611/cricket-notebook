// ============================================================================
// Cricket Notebook Game — deterministic dice-cricket engine (rules spec v3)
// ============================================================================

// Seeded RNG so a match is fully replayable from (seed + lineups).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollDie(rng) { return 1 + Math.floor(rng() * 6); }

// ----------------------------------------------------------------------------
// Resolve one ball: raw cell -> IA modifier -> rating branch -> runs+strikes.
// pair: [d1,d2] (order irrelevant). rating: striker batting. ia: striker flag.
// Returns { runs, strikes, label, big, iaApplied, branch }
// ----------------------------------------------------------------------------
function resolveBall(pair, rating, ia) {
  const lo = Math.min(pair[0], pair[1]);
  const hi = Math.max(pair[0], pair[1]);
  const key = lo + "," + hi;
  const high = rating > 5; // strictly greater than 5
  let runs = 0, strikes = 0, label = "", big = false, iaApplied = false;
  const branch = high ? ">5" : "≤5";

  switch (key) {
    case "1,1": runs = 1; label = "Single"; break;
    case "1,2":
      if (high) {
        if (ia) { runs = 1; label = "Single"; iaApplied = true; }
        else { runs = 2; label = "Double"; }
      } else { runs = 2; label = "Double"; }
      break;
    case "1,3": runs = 1; label = "Single"; break;
    case "1,4": runs = 1; label = "Single"; break;
    case "1,5": runs = 1; label = "Single"; break;
    case "1,6":
      if (high && ia) { runs = 12; label = "TWO SIXES"; big = true; iaApplied = true; }
      else { runs = 4; label = "FOUR"; big = true; }
      break;
    case "2,2": runs = 2; label = "Double"; break;
    case "2,3": strikes = 1; label = "Strike"; break;
    case "2,4": runs = 2; label = "Double"; break;
    case "2,5": strikes = 1; label = "Strike"; break;
    case "2,6": runs = 2; label = "Double"; break;
    case "3,3": label = "Dot"; break;
    case "3,4": label = "Dot"; break;
    case "3,5": strikes = 1; label = "Dot + Strike"; break;
    case "3,6": label = "Dot"; break;
    case "4,4": runs = 8; label = "TWO FOURS"; big = true; break;
    case "4,5":
      runs = 4; label = "FOUR"; big = true;
      // "+ Strike if IA" is the >5 column only; the ≤5 column is plain 4 runs.
      if (high && ia) { strikes = 1; label = "FOUR + Strike"; iaApplied = true; }
      break;
    case "4,6":
      if (high) { runs = 8; label = "TWO FOURS"; big = true; }
      else { label = "Dot"; }
      break;
    case "5,5":
      if (high && ia) { strikes = 4; label = "4 Strikes"; iaApplied = true; }
      else { strikes = 2; label = "Double Strike"; }
      break;
    case "5,6": strikes = 1; label = "Strike"; break;
    case "6,6":
      if (high) { runs = 12; label = "TWO SIXES"; big = true; }
      else { label = "Dot"; }
      break;
    default: label = "Dot"; break;
  }
  return { runs, strikes, label, big, iaApplied, branch };
}

// Dismissal thresholds. `bonus` (a format survival knob) is added to both the cap
// and the live average — ODI batsmen "set" longer so innings last the distance.
function dismissalInfo(battingRating, bowlingRating, accumulatedStrikes, bonus) {
  bonus = bonus || 0;
  const cap = battingRating + bonus;
  const avg = Math.floor((battingRating + bowlingRating) / 2) + bonus;
  const threshold = Math.min(cap, avg);
  // When the live average is NOT strictly below the cap, the batsman falls by
  // reaching their TOTAL strike count (the rating cap) — surface that as "cap".
  const which = avg < cap ? "average" : "cap";
  return { cap, avg, threshold, which, out: accumulatedStrikes >= threshold };
}

// ----------------------------------------------------------------------------
// Format scoring profiles (game-balance layer — see tactics.md "Run economy").
// The dice table in resolveBall() stays EXACTLY per the rules spec; this layer
// then dampens specific boundary cells and (ODI) raises survival, so mean scores
// land at T20 ~180-220 and ODI ~300. Overrides are keyed "lo,hi" with hi/lo =
// the value for the >5 / ≤5 branch. `skipIA` protects the IA reward on that cell.
// ----------------------------------------------------------------------------
var SCORING_PROFILES = {
  // T20: a light bowler-friendly trim — the two biggest cells come down a notch.
  T20: {
    thresholdBonus: 0,
    runs: {
      "4,6": { hi: 4 },              // two 4s (8) -> one 4 (4)
      "2,6": { hi: 1, lo: 1 },       // Double -> Single
      "2,2": { hi: 1, lo: 1 },       // Double -> Single
      "1,6": { hi: 2, skipIA: true } // 4 runs -> Double (keep the IA two-sixes)
    },
    // Powerplay & Death: field up / slog — Doubles fly to the boundary.
    boost: {
      "2,4": { hi: 4, lo: 4 },       // Double -> FOUR
      "1,6": { hi: 4, skipIA: true } // Double (base) -> FOUR (IA two-sixes intact)
    }
  },
  // ODI: heavier boundary damping (run rate ~6) + a survival bonus so a side
  // bats deep into the 50 overs rather than being bowled out early.
  ODI: {
    thresholdBonus: 4,
    runs: {
      // Keep genuine FOURS in the game (4,5 stays 4; 4,6 -> one four) so an ODI
      // has ~35 fours to ~10 sixes (a ~3.5:1 four:six ratio), then dot-trim the
      // low rolls so the run rate settles near 6/over and the mean lands ~300.
      "4,6": { hi: 4 },              // two 4s (8) -> one FOUR (4)
      "4,4": { hi: 2, lo: 2 },       // two 4s (8) -> Double
      "1,6": { hi: 2, iaHi: 6 },     // non-IA -> Double; IA two-sixes -> one SIX
      "6,6": { hi: 6 },              // two sixes (12) -> one SIX
      "2,6": { hi: 0, lo: 0 },       // Double -> Dot
      "1,4": { hi: 0, lo: 0 },       // Single -> Dot
      "1,3": { hi: 0, lo: 0 },       // Single -> Dot
      "2,4": { hi: 0, lo: 0 },       // Double -> Dot
      "2,2": { hi: 1, lo: 1 },       // Double -> Single
      "1,2": { hi: 1, lo: 1, skipIA: true }
    },
    // Powerplay & Death: the dot-trimmed low rolls come alive again.
    boost: {
      "2,4": { hi: 2, lo: 2 },       // Dot (base) -> Double
      "2,6": { hi: 2, lo: 2 },       // Dot (base) -> Double
      "1,4": { hi: 1, lo: 1 },       // Dot (base) -> Single
      "4,4": { hi: 4, lo: 4 }        // Double (base) -> FOUR
    }
  }
};

function labelFor(runs, strikes) {
  if (runs === 12) return "TWO SIXES";
  if (runs === 8) return "TWO FOURS";
  if (runs === 6) return "SIX";
  if (runs === 4) return strikes ? "FOUR + Strike" : "FOUR";
  if (runs === 2) return strikes ? "Double + Strike" : "Double";
  if (runs === 1) return strikes ? "Single + Strike" : "Single";
  if (strikes >= 4) return strikes + " Strikes";
  if (strikes === 2) return "Double Strike";
  if (strikes === 1) return "Strike";
  return "Dot";
}

// resolve a single run-override cell honouring iaHi / skipIA / branch
function overrideRuns(ro, high, ia) {
  if (!ro) return null;
  if (high && ia && ro.iaHi != null) return ro.iaHi;
  if (ro.skipIA && high && ia) return null;
  return high ? ro.hi : ro.lo;
}

// Apply a format profile to a base (spec) outcome. Returns the base unchanged if
// no override touches this cell, so commentary labels stay faithful. In the
// Powerplay and Death phases the profile's `boost` table is applied on top of the
// base overrides — batsmen attack the new ball and slog at the death.
function applyProfile(base, pair, high, ia, profile, phase) {
  if (!profile) return base;
  const lo = Math.min(pair[0], pair[1]), hi = Math.max(pair[0], pair[1]);
  const key = lo + "," + hi;
  let runs = base.runs, strikes = base.strikes, changed = false;

  const nv = overrideRuns(profile.runs && profile.runs[key], high, ia);
  if (nv != null && base.runs > 0 && nv !== runs) { runs = nv; changed = true; }

  const boosting = (phase === "Powerplay" || phase === "Death");
  if (boosting && profile.boost) {
    const bv = overrideRuns(profile.boost[key], high, ia);
    if (bv != null && bv !== runs) { runs = bv; changed = true; }
  }

  const so = profile.strikes && profile.strikes[key];
  if (so) { const sv = high ? so.hi : so.lo; if (sv != null && sv !== strikes) { strikes = sv; changed = true; } }

  if (!changed) return base;
  return { runs, strikes, label: labelFor(runs, strikes), big: runs >= 4, iaApplied: base.iaApplied, branch: base.branch };
}

function phaseFor(over, format) {
  return format.phases.find(ph => over <= ph.to) || format.phases[format.phases.length - 1];
}

// ----------------------------------------------------------------------------
// Bowler assignment — real T20/ODI tactics (see tactics.md):
//  • Powerplay: attack with the best PACE (new ball).
//  • Middle overs: turn to SPIN to choke the run rate.
//  • Death: bring the frontline pace back — and to make that possible the two
//    best pacers hold back `deathReserve` overs (they can't be bowled out early).
//  • Never two overs in a row; spread the load; keepers never bowl.
// ----------------------------------------------------------------------------
function buildBowlingPlan(fieldingLineup, format) {
  const totalOvers = format.overs, maxPer = format.maxOvers;
  const pool = fieldingLineup.map((p, idx) => ({ idx, p, type: p.type || "pace", overs: 0 }))
    .filter(b => !b.p.keeper);
  const lastPhase = format.phases[format.phases.length - 1];
  // the two frontline pace bowlers are the death specialists
  const deathSpec = new Set(
    pool.filter(b => b.type === "pace")
      .sort((a, b) => (a.p.bowling - b.p.bowling) || (a.idx - b.idx))
      .slice(0, 2).map(b => b.idx)
  );

  const plan = [];
  let prev = -1;
  for (let o = 1; o <= totalOvers; o++) {
    const ph = phaseFor(o, format);
    const isDeath = ph === lastPhase;
    let best = null, bestScore = Infinity;
    for (const b of pool) {
      // reserve death overs for the specialists outside the death phase
      const cap = (deathSpec.has(b.idx) && !isDeath) ? maxPer - format.deathReserve : maxPer;
      if (b.overs >= cap || b.idx === prev) continue;
      let score = b.p.bowling * 2 + b.overs * 0.6;   // skill first, then spread load
      if (b.type !== ph.prefer) score += 7;          // off-phase bowlers deprioritised
      if (score < bestScore) { bestScore = score; best = b; }
    }
    if (!best) { // relax the reserve/back-to-back constraints if nothing else is legal
      best = pool.filter(b => b.overs < maxPer).sort((a, b) => (a.p.bowling - b.p.bowling) || (a.overs - b.overs))[0];
    }
    best.overs++;
    prev = best.idx;
    plan.push(best.idx);
  }
  return plan;
}

function newBatCard(ref, order) {
  return {
    ref, order, name: ref.name, battingRating: ref.batting, ia: ref.ia,
    runs: 0, balls: 0, fours: 0, sixes: 0, strikes: 0,
    out: false, outMethod: null, outBowler: null, notOut: true, duck: false,
    onStrike: false
  };
}

// ----------------------------------------------------------------------------
// Simulate one innings. Returns full innings record + ball log.
// ----------------------------------------------------------------------------
function simulateInnings(battingTeam, fieldingTeam, rng, opts) {
  const format = opts.format;
  const totalOvers = format.overs;
  const target = opts.target; // null for 1st innings
  const inningNo = opts.inningNo;
  const plan = buildBowlingPlan(fieldingTeam.lineup, format);
  const profile = (typeof SCORING_PROFILES !== "undefined") ? SCORING_PROFILES[format.key] : null;
  const bonus = profile ? (profile.thresholdBonus || 0) : 0;

  const cards = battingTeam.lineup.map((p, i) => newBatCard(p, i));
  const bowlerStats = fieldingTeam.lineup.map((p, i) => ({
    idx: i, name: p.name, bowling: p.bowling, overs: 0, balls: 0, runs: 0, wickets: 0, maidens: 0, dots: 0
  }));

  let strikerIdx = 0, nonStrikerIdx = 1, nextBat = 2;
  cards[0].onStrike = true;
  let total = 0, wickets = 0, ballsBowled = 0;
  const ballLog = [];
  const fow = []; // fall of wickets
  const overSummaries = [];
  let ended = false, chaseWon = false;

  function creditBowlerWicket(bIdx) { bowlerStats[bIdx].wickets++; }

  for (let over = 0; over < totalOvers && !ended; over++) {
    const bowlerIdx = plan[over];
    const bowlingRating = fieldingTeam.lineup[bowlerIdx].bowling;
    const phaseName = phaseFor(over + 1, format).name;
    let overRuns = 0, overWk = 0;

    // Live-average walk-off check when a new bowler comes on (no ball needed):
    // a set batsman can fall the instant a much better bowler starts the over.
    for (const cIdx of [strikerIdx, nonStrikerIdx]) {
      if (cIdx == null || cards[cIdx].out) continue;
      const c = cards[cIdx];
      const di = dismissalInfo(c.battingRating, bowlingRating, c.strikes, bonus);
      if (di.out && di.which === "average") {
        // Only the live average can trigger a no-ball-faced dismissal.
        c.out = true; c.notOut = false; c.outMethod = "average";
        c.outBowler = fieldingTeam.lineup[bowlerIdx].name;
        c.duck = c.runs === 0;
        wickets++; overWk++; creditBowlerWicket(bowlerIdx);
        fow.push({ wicket: wickets, score: total, over: over, ball: 0, batsman: c.name, note: "new bowler on" });
        ballLog.push({
          inningNo, over: over + 1, ballInOver: 0, striker: c.name,
          bowler: fieldingTeam.lineup[bowlerIdx].name, pair: null, iaApplied: false,
          branch: null, label: "Bowler change", runs: 0, strikes: 0, totalStrikes: c.strikes,
          wicket: true, outMethod: "average", teamScore: total, wickets,
          commentary: `${fieldingTeam.lineup[bowlerIdx].name} comes on and ${c.name} is gone before facing — the live average dropped to ${di.threshold}. WICKET!`
        });
        if (cIdx === strikerIdx) {
          if (nextBat <= 10) { strikerIdx = nextBat++; cards[strikerIdx].onStrike = true; }
          else { strikerIdx = null; }
        } else {
          if (nextBat <= 10) { nonStrikerIdx = nextBat++; }
          else { nonStrikerIdx = null; }
        }
      }
    }
    if (wickets >= 10 || strikerIdx == null) { ended = true; break; }

    for (let bib = 0; bib < 6 && !ended; bib++) {
      const striker = cards[strikerIdx];
      const bstat = bowlerStats[bowlerIdx];
      const d1 = rollDie(rng), d2 = rollDie(rng);
      const res = applyProfile(resolveBall([d1, d2], striker.battingRating, striker.ia),
        [d1, d2], striker.battingRating > 5, striker.ia, profile, phaseName);

      // apply runs
      striker.runs += res.runs; striker.balls++;
      if (res.label.includes("FOUR")) striker.fours += res.label.includes("TWO") ? 2 : 1;
      if (res.label.includes("SIX")) striker.sixes += res.label.includes("TWO") ? 2 : 1;
      total += res.runs; overRuns += res.runs;
      bstat.runs += res.runs; bstat.balls++;
      if (res.runs === 0 && res.strikes === 0) bstat.dots++;

      // apply strikes
      striker.strikes += res.strikes;
      ballsBowled++;

      // dismissal check vs current bowler
      const di = dismissalInfo(striker.battingRating, bowlingRating, striker.strikes, bonus);
      let wicket = false, outMethod = null;
      if (di.out) {
        wicket = true; outMethod = di.which;
        striker.out = true; striker.notOut = false; striker.outMethod = di.which;
        striker.outBowler = fieldingTeam.lineup[bowlerIdx].name;
        striker.duck = striker.runs === 0;
        wickets++; overWk++; creditBowlerWicket(bowlerIdx);
        fow.push({ wicket: wickets, score: total, over, ball: bib + 1, batsman: striker.name });
      }

      const commentary = makeCommentary(res, striker, di, wicket, [d1, d2]);
      const partner = (nonStrikerIdx != null) ? cards[nonStrikerIdx] : null;
      const pdi = partner ? dismissalInfo(partner.battingRating, bowlingRating, partner.strikes, bonus) : null;
      ballLog.push({
        inningNo, over: over + 1, ballInOver: bib + 1, striker: striker.name,
        bowler: fieldingTeam.lineup[bowlerIdx].name, bowlerRating: bowlingRating,
        bowlerType: fieldingTeam.lineup[bowlerIdx].type || "pace",
        phase: phaseName,
        pair: [d1, d2], iaApplied: res.iaApplied,
        branch: res.branch, label: res.label, runs: res.runs, strikes: res.strikes,
        totalStrikes: striker.strikes, capThreshold: di.cap, avgThreshold: di.avg, threshold: di.threshold,
        wicket, outMethod, teamScore: total, wickets, big: res.big, commentary,
        // crease snapshot (for live playback rendering)
        strikerRuns: striker.runs, strikerBalls: striker.balls, strikerIA: striker.ia,
        nonStriker: partner ? partner.name : null, nonStrikerRuns: partner ? partner.runs : null,
        nonStrikerBalls: partner ? partner.balls : null, nonStrikerIA: partner ? partner.ia : false,
        nonStrikerStrikes: partner ? partner.strikes : null, nonStrikerThreshold: pdi ? pdi.threshold : null
      });

      // strike rotation on odd runs
      if (res.runs % 2 === 1) { const t = strikerIdx; strikerIdx = nonStrikerIdx; nonStrikerIdx = t; }

      if (wicket) {
        if (nextBat <= 10) {
          // new batsman comes to the striker's end (where the wicket fell)
          strikerIdx = nextBat++;
          cards[strikerIdx].onStrike = true;
        } else { ended = true; }
      }
      if (wickets >= 10) { ended = true; }

      // chase result
      if (target != null && total >= target) { ended = true; chaseWon = true; }
    }

    bowlerStats[bowlerIdx].overs++;
    if (overRuns === 0 && !ended) bowlerStats[bowlerIdx].maidens++;
    overSummaries.push({ over: over + 1, runs: overRuns, wickets: overWk, total, wkts: wickets, bowler: fieldingTeam.lineup[bowlerIdx].name });

    // end-of-over: change ends (swap striker/non-striker)
    if (!ended && strikerIdx != null && nonStrikerIdx != null) {
      const t = strikerIdx; strikerIdx = nonStrikerIdx; nonStrikerIdx = t;
    }
  }

  // mark on-strike flags off
  cards.forEach(c => c.onStrike = false);
  if (strikerIdx != null && !cards[strikerIdx].out) cards[strikerIdx].onStrike = true;

  const oversDecimal = Math.floor(ballsBowled / 6) + "." + (ballsBowled % 6);
  return {
    team: battingTeam.name, teamShort: battingTeam.short, inningNo,
    total, wickets, balls: ballsBowled, oversDecimal,
    cards, bowlerStats, ballLog, fow, overSummaries, chaseWon,
    runRate: ballsBowled ? (total / (ballsBowled / 6)) : 0
  };
}

function makeCommentary(res, striker, di, wicket, pair) {
  const dice = `[${pair[0]}-${pair[1]}]`;
  const who = striker.name;
  if (wicket) {
    const how = di.which === "cap"
      ? `reaches ${striker.strikes} TOTAL strikes — the rating cap`
      : `crosses the live average of ${di.avg} vs this bowler`;
    return `${dice} OUT! ${who} ${how}. ${striker.runs === 0 ? "Gone for a DUCK." : `Departs for ${striker.runs}.`}`;
  }
  if (res.big && res.runs >= 12) return `${dice} MAXIMUM! ${who} clears the ropes twice — ${res.runs} runs!`;
  if (res.big && res.runs === 8) return `${dice} Back-to-back boundaries — ${res.runs} runs for ${who}!`;
  if (res.big && res.runs === 6) return `${dice} SIX! ${who} goes big.`;
  if (res.big && res.runs === 4) return `${dice} FOUR! Cracked away by ${who}.`;
  if (res.strikes >= 2) return `${dice} Real pressure — ${res.strikes} strikes on ${who} (${striker.strikes}/${di.threshold}).`;
  if (res.strikes === 1 && res.runs > 0) return `${dice} ${res.runs} run(s) but a strike too — ${who} living dangerously.`;
  if (res.strikes === 1) return `${dice} Beaten! A strike on ${who} (${striker.strikes}/${di.threshold}).`;
  if (res.runs === 0) return `${dice} Dot ball. ${who} watchful.`;
  if (res.runs === 1) return `${dice} Quick single, ${who} rotates strike.`;
  if (res.runs === 2) return `${dice} Two more for ${who}.`;
  return `${dice} ${res.runs} to ${who}.`;
}

// ----------------------------------------------------------------------------
// Full match
// ----------------------------------------------------------------------------
function simulateMatch(teamA, teamB, opts) {
  const format = opts.format || (typeof FORMATS !== "undefined" ? FORMATS.T20 : { key: "T20", overs: 20, maxOvers: 4, deathReserve: 2, phases: [{ name: "Powerplay", to: 6, prefer: "pace" }, { name: "Middle", to: 15, prefer: "spin" }, { name: "Death", to: 20, prefer: "pace" }] });
  const overs = format.overs;
  const seed = opts.seed >>> 0;
  const rng = mulberry32(seed);

  // toss (deterministic from seed): winner bats first
  const tossWinner = rng() < 0.5 ? teamA : teamB;
  const battingFirst = tossWinner;
  const battingSecond = tossWinner === teamA ? teamB : teamA;

  const inn1 = simulateInnings(battingFirst, battingSecond, rng, { format, target: null, inningNo: 1 });
  const target = inn1.total + 1;
  const inn2 = simulateInnings(battingSecond, battingFirst, rng, { format, target, inningNo: 2 });

  let result;
  if (inn2.total >= target) {
    const wktsLeft = 10 - inn2.wickets;
    result = { winner: battingSecond.name, margin: `${wktsLeft} wicket${wktsLeft === 1 ? "" : "s"}`, type: "chase" };
  } else if (inn2.total === inn1.total) {
    result = { winner: null, margin: "Match tied", type: "tie" };
  } else {
    result = { winner: battingFirst.name, margin: `${inn1.total - inn2.total} run${inn1.total - inn2.total === 1 ? "" : "s"}`, type: "defend" };
  }

  return {
    seed, overs, format, stadium: opts.stadium,
    toss: { winner: tossWinner.name, decision: "bat" },
    battingFirst: battingFirst.name, battingSecond: battingSecond.name,
    innings: [inn1, inn2], target, result
  };
}

if (typeof module !== "undefined") {
  module.exports = { resolveBall, dismissalInfo, simulateMatch, simulateInnings, mulberry32, buildBowlingPlan, phaseFor, applyProfile, labelFor, SCORING_PROFILES };
}
