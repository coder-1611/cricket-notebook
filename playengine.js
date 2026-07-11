// ============================================================================
// Cricket Notebook — PLAY mode step engine.
// Same dice table / profiles / two-bar dismissal model as engine.js, but driven
// one action at a time: the fielding player picks a bowler each over, the
// batting player clicks to face each ball.
//
// Deterministic replay: state = replay(config, actions[]). Both clients hold
// the same (seed, XIs, orders) config and the same ordered action log from
// Firebase, so they always compute identical match states — no results are
// ever sent over the wire.
//
// Actions:
//   { a: "choice", v: "bat"|"bowl" }        — toss winner's call
//   { a: "bowler", x: <xi slot> }           — fielding side sets the over's bowler
//   { a: "nextbat", x: <xi slot> }          — batting side sends in the next
//                                             batsman after a wicket (any not-out
//                                             player who hasn't batted yet)
//   { a: "ball", i: "att"|"def" }           — batting side faces one delivery,
//                                             choosing to ATTACK or DEFEND it:
//     att — boundary boost applied in EVERY phase (slog) but any strike outcome
//           lands one extra strike (risk to reward);
//     def — runs capped at 2 (no boundaries) but one strike soaked off the ball
//           (see off the pressure).
// ============================================================================
(function (root) {
  // engine.js primitives (globals in browser, require() in Node/tests)
  const E = (typeof module !== "undefined" && typeof require !== "undefined")
    ? require("./engine.js")
    : { resolveBall: root.resolveBall, applyProfile: root.applyProfile, dismissalInfo: root.dismissalInfo, mulberry32: root.mulberry32, SCORING_PROFILES: root.SCORING_PROFILES, phaseFor: root.phaseFor, labelFor: root.labelFor };

  function batCard(p, order) {
    return {
      name: p.name, battingRating: p.batting, ia: !!p.ia, keeper: !!p.keeper, order,
      runs: 0, balls: 0, fours: 0, sixes: 0, strikes: 0, byBowler: {},
      arrived: false, // has come to the crease (openers start true)
      out: false, outMethod: null, outBowler: null, duck: false
    };
  }

  // cfg = {
  //   seed, format,                       // format = FORMATS.T20 | FORMATS.ODI
  //   p1: { name, country, xi: [player objects in batting order] },
  //   p2: { name, country, xi: [...] }
  // }
  function createPlayMatch(cfg) {
    const rng = E.mulberry32(cfg.seed >>> 0);
    const tossWinner = rng() < 0.5 ? "p1" : "p2";
    // PLAY-only short formats (T10) borrow the T20 balance profile
    const profile = E.SCORING_PROFILES[cfg.format.key] || E.SCORING_PROFILES.T20;
    const bonus = profile ? (profile.thresholdBonus || 0) : 0;

    const m = {
      cfg, rng, profile, bonus, tossWinner,
      stage: "toss",              // toss -> bowler -> ball ... -> innings-break -> ... -> done
      tossChoice: null,
      inningNo: 0,                // 1 or 2 once play starts
      battingRole: null, fieldingRole: null,
      innings: [],                // finished + current innings records
      cur: null,                  // current innings state
      lastEvent: null,            // most recent ball/wicket event for the UI
      result: null
    };

    m.apply = function (action) { return applyAction(m, action); };
    m.turn = function () {       // whose click is needed right now
      if (m.stage === "toss") return m.tossWinner;
      if (m.stage === "bowler") return m.fieldingRole;
      if (m.stage === "ball" || m.stage === "nextbat" || m.stage === "innings-break") return m.battingRole;
      return null;
    };
    m.legalBowlers = function () { return m.cur ? legalBowlers(m) : []; };
    m.legalBatters = function () { return m.cur ? legalBatters(m) : []; };
    return m;
  }

  function newInnings(m, battingRole, target) {
    const cfgSide = m.cfg[battingRole];
    const fieldRole = battingRole === "p1" ? "p2" : "p1";
    const fieldSide = m.cfg[fieldRole];
    return {
      inningNo: m.inningNo, battingRole, target: target || null,
      team: cfgSide.country, owner: cfgSide.name,
      cards: cfgSide.xi.map((p, i) => batCard(p, i)),
      bowlers: fieldSide.xi.map((p, i) => ({
        slot: i, name: p.name, bowling: p.bowling, type: p.type || "pace", keeper: !!p.keeper,
        overs: 0, balls: 0, runs: 0, wickets: 0, maidens: 0
      })),
      strikerIdx: 0, nonStrikerIdx: 1,
      total: 0, wickets: 0, ballsBowled: 0,
      over: 0,                     // 0-based over currently being bowled
      ballInOver: 0,
      bowlerSlot: null, prevBowlerSlot: null,
      overRuns: 0,
      pendingHit: null,
      fow: [], overSummaries: [], events: [],
      done: false, chaseWon: false
    };
  }

  function legalBowlers(m) {
    const inn = m.cur, maxPer = m.cfg.format.maxOvers;
    let list = inn.bowlers.filter(b => !b.keeper && b.overs < maxPer && b.slot !== inn.prevBowlerSlot);
    if (!list.length) list = inn.bowlers.filter(b => !b.keeper && b.overs < maxPer);
    if (!list.length) list = inn.bowlers.filter(b => b.overs < maxPer);
    return list.map(b => b.slot);
  }

  // anyone not out who hasn't come to the crease yet can be sent in next
  function legalBatters(m) {
    return m.cur.cards.map((c, i) => (!c.out && !c.arrived) ? i : -1).filter(i => i >= 0);
  }

  function startInnings(m, battingRole, target) {
    m.inningNo++;
    m.battingRole = battingRole;
    m.fieldingRole = battingRole === "p1" ? "p2" : "p1";
    m.cur = newInnings(m, battingRole, target);
    m.cur.cards[0].arrived = true;
    m.cur.cards[1].arrived = true;
    m.innings.push(m.cur);
    m.stage = "bowler";
  }

  function applyAction(m, action) {
    if (m.stage === "done") return false;

    if (m.stage === "toss") {
      if (action.a !== "choice") return false;
      m.tossChoice = action.v === "bowl" ? "bowl" : "bat";
      const batsFirst = m.tossChoice === "bat" ? m.tossWinner : (m.tossWinner === "p1" ? "p2" : "p1");
      startInnings(m, batsFirst, null);
      return true;
    }

    if (m.stage === "bowler") {
      if (action.a !== "bowler") return false;
      const legal = legalBowlers(m);
      const slot = legal.includes(action.x) ? action.x : legal[0]; // never desync on an illegal pick
      m.cur.bowlerSlot = slot;
      m.cur.ballInOver = 0;
      m.cur.overRuns = 0;
      m.stage = "ball";
      return true;
    }

    if (m.stage === "ball") {
      if (action.a !== "ball") return false;
      playBall(m, action.i === "att" || action.i === "def" ? action.i : null);
      return true;
    }

    if (m.stage === "nextbat") {
      if (action.a !== "nextbat") return false;
      const legal = legalBatters(m);
      const idx = legal.includes(action.x) ? action.x : legal[0]; // never desync on an illegal pick
      const inn = m.cur;
      inn.cards[idx].arrived = true;
      if (inn.strikerIdx == null) inn.strikerIdx = idx;
      else inn.nonStrikerIdx = idx;
      m.stage = inn.bowlerSlot == null ? "bowler" : "ball";
      return true;
    }

    if (m.stage === "innings-break") {
      if (action.a !== "continue") return false;
      // roles were pre-swapped at the break: battingRole is already the chasing side
      startInnings(m, m.battingRole, m.innings[0].total + 1);
      return true;
    }
    return false;
  }

  function endInnings(m) {
    const inn = m.cur;
    inn.done = true;
    if (m.inningNo === 1) {
      m.stage = "innings-break";
      // roles swap at the break; startInnings sets them properly on continue
      m.battingRole = m.fieldingRole;
      m.fieldingRole = inn.battingRole;
    } else {
      m.stage = "done";
      const inn1 = m.innings[0], inn2 = m.innings[1];
      if (inn2.total >= inn2.target) {
        const w = 10 - inn2.wickets;
        m.result = { winnerRole: inn2.battingRole, margin: `${w} wicket${w === 1 ? "" : "s"}`, type: "chase" };
      } else if (inn2.total === inn1.total) {
        m.result = { winnerRole: null, margin: "Match tied", type: "tie" };
      } else {
        const r = inn1.total - inn2.total;
        m.result = { winnerRole: inn1.battingRole, margin: `${r} run${r === 1 ? "" : "s"}`, type: "defend" };
      }
    }
  }

  function playBall(m, intent) {
    const inn = m.cur, fmt = m.cfg.format;
    const striker = inn.cards[inn.strikerIdx];
    const bowler = inn.bowlers[inn.bowlerSlot];
    const phaseName = E.phaseFor(inn.over + 1, fmt).name;
    const lastBallOfInnings = (inn.over === fmt.overs - 1 && inn.ballInOver === 5);
    let d1, d2, res, compound = null;

    if (inn.pendingHit) {
      // second half of a compound is already in flight — intent doesn't apply
      d1 = inn.pendingHit.pair[0]; d2 = inn.pendingHit.pair[1];
      res = { runs: inn.pendingHit.runs, strikes: 0, label: inn.pendingHit.kind, big: true, iaApplied: false, branch: inn.pendingHit.branch };
      compound = { part: "second", toOther: striker.name !== inn.pendingHit.fromStriker };
      inn.pendingHit = null;
      intent = null;
    } else {
      d1 = 1 + Math.floor(m.rng() * 6); d2 = 1 + Math.floor(m.rng() * 6);
      // ATTACK slogs every ball: the boost table is always on AND rotation turns
      // into boundaries (1 -> 2, 2 -> 4) — but any ball that carries strikes
      // lands ONE MORE. High ceiling, real risk.
      const effPhase = intent === "att" ? "Death" : phaseName;
      res = E.applyProfile(E.resolveBall([d1, d2], striker.battingRating, striker.ia),
        [d1, d2], striker.battingRating > 5, striker.ia, m.profile, effPhase);
      if (intent === "att") {
        let r = res.runs === 1 ? 2 : res.runs === 2 ? 4 : res.runs;
        let s = res.strikes > 0 ? res.strikes + 1 : 0;
        res = { runs: r, strikes: s, label: E.labelFor(r, s), big: r >= 4, iaApplied: res.iaApplied, branch: res.branch };
      }
      // DEFEND blocks it out: never more than 2 off the bat, and a heavy ball
      // (2+ strikes) is partly seen off — but a single strike still sticks, so
      // even a blocker's total keeps creeping toward the cap.
      if (intent === "def") {
        const r = Math.min(res.runs, 2), s = res.strikes >= 2 ? res.strikes - 1 : res.strikes;
        res = { runs: r, strikes: s, label: E.labelFor(r, s), big: false, iaApplied: res.iaApplied, branch: res.branch };
      }
      // Compounds split across two balls; on the innings' FINAL ball there is
      // no next delivery, so only the first hit counts — the second is lost.
      if ((res.label === "TWO SIXES" || res.label === "TWO FOURS") && res.runs >= 8) {
        const kind = res.label === "TWO SIXES" ? "SIX" : "FOUR";
        const half = kind === "SIX" ? 6 : 4;
        if (!lastBallOfInnings) {
          inn.pendingHit = { runs: half, kind, pair: [d1, d2], branch: res.branch, fromStriker: striker.name };
        }
        res = { runs: half, strikes: 0, label: kind, big: true, iaApplied: res.iaApplied, branch: res.branch };
        compound = { part: lastBallOfInnings ? "only" : "first", toOther: false };
      }
    }

    striker.runs += res.runs; striker.balls++;
    if (res.label.includes("FOUR")) striker.fours += res.label.includes("TWO") ? 2 : 1;
    if (res.label.includes("SIX")) striker.sixes += res.label.includes("TWO") ? 2 : 1;
    inn.total += res.runs; inn.overRuns += res.runs;
    bowler.runs += res.runs; bowler.balls++;

    striker.strikes += res.strikes;
    if (res.strikes) striker.byBowler[inn.bowlerSlot] = (striker.byBowler[inn.bowlerSlot] || 0) + res.strikes;
    inn.ballsBowled++; inn.ballInOver++;

    const bowlerStrikes = striker.byBowler[inn.bowlerSlot] || 0;
    const di = E.dismissalInfo(striker.battingRating, bowler.bowling, striker.strikes, bowlerStrikes, m.bonus);
    let wicket = false;
    if (di.out) {
      wicket = true;
      striker.out = true; striker.outMethod = di.which; striker.outBowler = bowler.name;
      striker.duck = striker.runs === 0;
      inn.wickets++; bowler.wickets++;
      inn.fow.push({ wicket: inn.wickets, score: inn.total, over: inn.over, ball: inn.ballInOver, batsman: striker.name });
    }

    const partner = inn.nonStrikerIdx != null ? inn.cards[inn.nonStrikerIdx] : null;
    m.lastEvent = {
      inningNo: inn.inningNo, over: inn.over + 1, ballInOver: inn.ballInOver,
      striker: striker.name, bowler: bowler.name, bowlerType: bowler.type, phase: phaseName,
      pair: [d1, d2], label: res.label, runs: res.runs, strikes: res.strikes, big: res.big,
      intent, iaApplied: res.iaApplied, compound: compound ? compound.part : null,
      compoundToOther: compound ? compound.toOther : false,
      totalStrikes: striker.strikes, capThreshold: di.cap,
      bowlerStrikes, avgThreshold: di.avg,
      wicket, outMethod: wicket ? di.which : null,
      teamScore: inn.total, wickets: inn.wickets,
      strikerRuns: striker.runs, strikerBalls: striker.balls,
      nonStriker: partner ? partner.name : null
    };
    inn.events.push(m.lastEvent);

    // strike rotation on odd runs
    if (res.runs % 2 === 1) { const t = inn.strikerIdx; inn.strikerIdx = inn.nonStrikerIdx; inn.nonStrikerIdx = t; }

    let ended = false, vacancy = false;
    if (wicket) {
      // the crease slot is vacated; the batting player CHOOSES who walks in next
      inn.strikerIdx = null;
      if (legalBatters(m).length && inn.wickets < 10) vacancy = true;
      else ended = true;
    }
    if (inn.wickets >= 10) ended = true;
    if (inn.target != null && inn.total >= inn.target) { ended = true; inn.chaseWon = true; }

    if (inn.ballInOver >= 6 && !ended) {
      // over complete
      bowler.overs++;
      if (inn.overRuns === 0) bowler.maidens++;
      inn.overSummaries.push({ over: inn.over + 1, runs: inn.overRuns, total: inn.total, wkts: inn.wickets, bowler: bowler.name });
      inn.prevBowlerSlot = inn.bowlerSlot;
      inn.bowlerSlot = null;
      inn.over++;
      const t = inn.strikerIdx; inn.strikerIdx = inn.nonStrikerIdx; inn.nonStrikerIdx = t; // change ends (a vacant slot swaps too)
      if (inn.over >= fmt.overs) ended = true;
      else m.stage = "bowler";
    }
    if (ended) {
      if (inn.ballInOver >= 1 && inn.bowlerSlot != null) bowler.overs += inn.ballInOver >= 6 ? 1 : 0;
      endInnings(m);
    } else if (vacancy) {
      // batsman pick comes first; the bowler pick (if the over also ended)
      // follows once the new batter is in
      m.stage = "nextbat";
    }
  }

  const api = { createPlayMatch };
  if (typeof window !== "undefined") Object.assign(window, api);
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
