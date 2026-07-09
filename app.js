// ============================================================================
// Cricket Notebook — UI controller (playback, scorecards, worm chart)
// ============================================================================
const $ = (id) => document.getElementById(id);
const T = window.TEAMS;

const state = { match: null, timeline: [], idx: -1, playing: false, timer: null };

function teamColor(name) { return name === "India" ? "var(--ind)" : "var(--aus)"; }
function teamObj(name) { return name === "India" ? T.India : T.Australia; }

// average batting rating helper for the matchup card
function avgBat(team) {
  const b = team.lineup.reduce((s, p) => s + p.batting, 0) / team.lineup.length;
  const bo = team.lineup.reduce((s, p) => s + p.bowling, 0) / team.lineup.length;
  return `Bat ${b.toFixed(1)} · Bowl ${bo.toFixed(1)}`;
}

// ---------- init ----------
function init() {
  const stadSel = $("stadium");
  window.STADIUMS.forEach(s => {
    const o = document.createElement("option");
    o.value = s.id; o.textContent = `${s.name} — ${s.city}`;
    stadSel.appendChild(o);
  });
  stadSel.value = "mumbai";
  updateStadiumTag();

  const fmtSel = $("format");
  Object.values(window.FORMATS).forEach(f => {
    const o = document.createElement("option");
    o.value = f.key; o.textContent = f.label;
    fmtSel.appendChild(o);
  });
  fmtSel.value = "T20";

  $("indAvg").textContent = avgBat(T.India);
  $("ausAvg").textContent = avgBat(T.Australia);
  renderLineups();

  $("btnSim").onclick = () => runMatch();
  $("btnReplay").onclick = () => { if (state.match) runMatch(state.match.seed); };
  $("btnRules").onclick = showRules;
  $("stadium").onchange = updateStadiumTag;
  $("format").onchange = updateStadiumTag;
  $("toggleLineups").onclick = () => {
    const el = $("lineups"); const hidden = el.classList.toggle("hidden");
    $("toggleLineups").textContent = hidden ? "Show lineups ▾" : "Hide lineups ▴";
  };
  $("btnPlay").onclick = togglePlay;
  $("btnStep").onclick = () => { pause(); step(1); };
  $("btnStepBack").onclick = () => { pause(); step(-1); };
  $("btnSkip").onclick = skipInnings;
  $("speed").oninput = () => { if (state.playing) { pause(); play(); } };

  document.querySelectorAll(".tab").forEach(t => t.onclick = () => switchTab(t.dataset.tab));

  // hidden replay/testing deep-link: ?seed=7&format=ODI&stadium=mumbai&auto=1
  const q = new URLSearchParams(location.search);
  const linkSeed = q.get("seed") ? (parseInt(q.get("seed")) >>> 0) : null;
  if (q.get("format") && window.FORMATS[q.get("format")]) $("format").value = q.get("format");
  if (q.get("stadium") && window.STADIUMS.some(s => s.id === q.get("stadium"))) { $("stadium").value = q.get("stadium"); updateStadiumTag(); }
  if (q.get("auto")) { runMatch(linkSeed); if (q.get("to")) { const n = parseInt(q.get("to")); while (state.idx < Math.min(n, state.timeline.length - 1)) step(1); } if (q.get("tab")) switchTab(q.get("tab")); }
}

function updateStadiumTag() {
  const s = window.STADIUMS.find(x => x.id === $("stadium").value);
  const fmt = window.FORMATS[$("format") && $("format").value] || window.FORMATS.T20;
  $("stadiumTag").textContent = `📍 ${s.name}, ${s.city} · ${fmt.overs} overs`;
}

function renderLineups() {
  const box = $("lineups");
  box.innerHTML = ["India", "Australia"].map(tn => {
    const t = teamObj(tn);
    const rows = t.lineup.map(p =>
      `<div class="lp"><b>${p.name}${p.captain ? " (c)" : ""}${p.keeper ? " †" : ""}</b>
        <span class="rt">B${p.batting}/O${p.bowling} ${p.ia ? '<span class="ia">IA</span>' : ""}</span></div>`
    ).join("");
    return `<div style="margin-bottom:12px"><div style="color:${teamColor(tn)};font-weight:700;margin-bottom:4px">${tn}</div>${rows}</div>`;
  }).join("");
}

// ---------- run ----------
// Seed is never user-chosen: each simulate draws a fresh random seed.
// (seedOverride powers Replay and the hidden ?seed= replay/testing deep-link.)
function randomSeed() {
  if (window.crypto && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  }
  return Math.floor(Math.random() * 0xFFFFFFFF) || 1;
}

function runMatch(seedOverride) {
  pause();
  const format = window.FORMATS[$("format").value] || window.FORMATS.T20;
  const seed = (seedOverride != null) ? (seedOverride >>> 0) : randomSeed();
  const stadium = window.STADIUMS.find(x => x.id === $("stadium").value);
  const m = simulateMatch(T.India, T.Australia, { format, seed, stadium: stadium.name });
  state.match = m;
  state.timeline = [...m.innings[0].ballLog, ...m.innings[1].ballLog];
  state.idx = -1;
  $("liveArea").classList.remove("hidden");
  $("resultBanner").classList.add("hidden");
  $("feed").innerHTML = "";
  // scorecard + worm now build progressively from renderAt() as balls are played
  step(1);
  switchTab("feed");
}

// ---------- playback ----------
function togglePlay() { state.playing ? pause() : play(); }
function play() {
  if (state.idx >= state.timeline.length - 1) { rebuildFeed(-1); state.idx = -1; }
  state.playing = true; $("btnPlay").textContent = "⏸ Pause";
  const speed = 760 - parseInt($("speed").value);
  state.timer = setInterval(() => {
    if (state.idx >= state.timeline.length - 1) { pause(); return; }
    step(1);
  }, Math.max(50, speed));
}
function pause() {
  state.playing = false; $("btnPlay") && ($("btnPlay").textContent = "▶ Play");
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
}
function step(dir) {
  const ni = state.idx + dir;
  if (ni < 0 || ni >= state.timeline.length) return;
  if (dir === 1) { appendFeed(state.timeline[ni], ni); }
  else { removeLastFeed(); }
  state.idx = ni;
  renderAt(ni);
}
function skipInnings() {
  pause();
  const cur = state.idx < 0 ? 0 : state.timeline[state.idx].inningNo;
  // jump to last ball of current innings, or end of match if already in 2nd
  let target = state.timeline.length - 1;
  if (cur === 1) {
    for (let i = 0; i < state.timeline.length; i++) if (state.timeline[i].inningNo === 2) { target = i - 1; break; }
  }
  rebuildFeed(target);
  state.idx = target;
  renderAt(target);
}

// ---------- render current state ----------
function renderAt(idx) {
  const m = state.match, e = state.timeline[idx];
  const first = m.battingFirst, second = m.battingSecond;
  const inn1 = m.innings[0], inn2 = m.innings[1];

  // scoreboard slot A = battingFirst, B = battingSecond
  paintTeam("A", first);
  paintTeam("B", second);
  let aScore, aMeta, bScore, bMeta;
  if (e.inningNo === 1) {
    aScore = `${e.teamScore}/${e.wickets}`; aMeta = `${oversStr(idx, 1)} ov`;
    bScore = "—"; bMeta = "yet to bat";
    setActive("A");
  } else {
    aScore = `${inn1.total}/${inn1.wickets}`; aMeta = `${inn1.oversDecimal} ov`;
    bScore = `${e.teamScore}/${e.wickets}`; bMeta = `${oversStr(idx, 2)} ov`;
    setActive("B");
  }
  $("sbAScore").textContent = aScore; $("sbAMeta").textContent = aMeta;
  $("sbBScore").textContent = bScore; $("sbBMeta").textContent = bMeta;

  // status / chase
  if (e.inningNo === 1) {
    $("sbStatus").innerHTML = `<b>1st innings</b> · ${first} batting. Setting a total for ${second} to chase.`;
  } else {
    const need = m.target - e.teamScore;
    const ballsBowled = ballsInInnings(idx, 2);
    const ballsLeft = m.overs * 6 - ballsBowled;
    if (need > 0 && e.wickets < 10 && ballsLeft > 0) {
      $("sbStatus").innerHTML = `<b>${second}</b> need <b>${need}</b> off <span class="chase">${ballsLeft} balls</span> · Target ${m.target}`;
    } else {
      $("sbStatus").innerHTML = `<b>Chase:</b> target ${m.target}`;
    }
  }

  // crease
  const striker = e.striker, nonS = e.nonStriker;
  $("strikeName").innerHTML = `${escapeHtml(striker)} ${e.strikerIA ? '<span class="mini-ia">IA</span>' : ""}`;
  $("strikeRuns").textContent = e.strikerRuns;
  $("strikeDet").textContent = `${e.strikerBalls} balls · ${e.totalStrikes}/${e.threshold} strikes`;
  $("strikeMeter").style.width = pct(e.totalStrikes, e.threshold);
  if (nonS) {
    $("chipNon").style.opacity = 1;
    $("nonName").innerHTML = `${escapeHtml(nonS)} ${e.nonStrikerIA ? '<span class="mini-ia">IA</span>' : ""}`;
    $("nonRuns").textContent = e.nonStrikerRuns;
    $("nonDet").textContent = `${e.nonStrikerBalls} balls · ${e.nonStrikerStrikes}/${e.nonStrikerThreshold} strikes`;
    $("nonMeter").style.width = pct(e.nonStrikerStrikes, e.nonStrikerThreshold);
  } else {
    $("chipNon").style.opacity = .4;
    $("nonName").textContent = "—"; $("nonRuns").textContent = ""; $("nonDet").textContent = "last man";
    $("nonMeter").style.width = "0%";
  }

  const ptype = e.bowlerType === "spin" ? "🌀 spin" : "⚡ pace";
  const phaseChip = e.phase ? `<span class="phase-chip ${(e.phase || "").toLowerCase()}">${e.phase}</span>` : "";
  $("bowlerLine").innerHTML = `🎯 Bowling: <b>${escapeHtml(e.bowler)}</b> <span class="mini">${ptype} · rating ${e.bowlerRating}</span> ${phaseChip}`;

  // last ball
  if (e.pair) { $("die1").textContent = e.pair[0]; $("die2").textContent = e.pair[1]; }
  else { $("die1").textContent = "↻"; $("die2").textContent = "↻"; }
  $("lbBig").textContent = e.label;
  $("lbSub").textContent = e.commentary;
  $("lbPill").innerHTML = pillFor(e);

  // live scorecards + worm reflect only the balls played so far
  renderScorecardsAt(idx);
  renderWormAt(idx);

  // result banner at end
  if (idx === state.timeline.length - 1) showResult(); else $("resultBanner").classList.add("hidden");
}

function paintTeam(slot, name) {
  $("sb" + slot + "Name").innerHTML = `<span style="width:9px;height:9px;border-radius:3px;background:${teamColor(name)};display:inline-block;margin-right:6px"></span>${name}`;
}
function setActive(slot) {
  $("sbA").classList.toggle("active", slot === "A");
  $("sbB").classList.toggle("active", slot === "B");
}
function pct(a, b) { return Math.min(100, Math.round((a / Math.max(1, b)) * 100)) + "%"; }

function oversStr(idx, inn) {
  const b = ballsInInnings(idx, inn);
  return Math.floor(b / 6) + "." + (b % 6);
}
function ballsInInnings(idx, inn) {
  let c = 0;
  for (let i = 0; i <= idx; i++) if (state.timeline[i].inningNo === inn && state.timeline[i].pair) c++;
  return c;
}

function pillFor(e) {
  if (e.wicket) return `<span class="pill wk">WICKET</span>`;
  if (e.label.includes("SIX")) return `<span class="pill six">${e.runs}</span>`;
  if (e.label.includes("FOUR")) return `<span class="pill four">${e.runs}</span>`;
  if (e.strikes > 0) return `<span class="pill strike">${e.strikes} strike${e.strikes > 1 ? "s" : ""}</span>`;
  if (e.runs === 0) return `<span class="pill dot">•</span>`;
  return `<span class="pill dot">${e.runs}</span>`;
}

// ---------- feed ----------
function appendFeed(e, idx) {
  const feed = $("feed");
  if (idx === 0) feed.innerHTML = "";
  // innings separator
  if (idx > 0 && state.timeline[idx - 1].inningNo !== e.inningNo) {
    const sep = document.createElement("div");
    sep.className = "ballrow"; sep.style.background = "rgba(255,255,255,.03)";
    sep.innerHTML = `<div class="ov"></div><div class="cm" style="color:var(--accent-2);font-weight:700">— 2nd innings: ${state.match.battingSecond} chasing ${state.match.target} —</div>`;
    feed.prepend(sep);
  }
  const row = document.createElement("div");
  row.className = "ballrow" + (e.wicket ? " wk" : "");
  const badge = badgeFor(e);
  const ov = e.pair ? `${e.over - 1}.${e.ballInOver}` : `${e.over - 1}.–`;
  row.innerHTML = `<div class="ov">${ov}</div><div class="badge ${badge.cls}">${badge.txt}</div><div class="cm">${escapeHtml(e.commentary)}</div>`;
  feed.prepend(row);
  $("feedCount").textContent = `${idx + 1} balls`;
}
function badgeFor(e) {
  if (e.wicket) return { cls: "rw", txt: "W" };
  if (e.label.includes("SIX")) return { cls: "r6", txt: e.runs };
  if (e.label.includes("FOUR")) return { cls: "r4", txt: e.runs };
  if (e.strikes > 0) return { cls: "rs", txt: "S" };
  return { cls: "", txt: e.runs };
}
function removeLastFeed() {
  const feed = $("feed");
  if (feed.firstChild) feed.removeChild(feed.firstChild);
  // clean a leftover separator
  if (feed.firstChild && feed.firstChild.querySelector && feed.firstChild.querySelector(".cm") &&
      feed.firstChild.textContent.includes("innings:")) feed.removeChild(feed.firstChild);
}
function rebuildFeed(target) {
  $("feed").innerHTML = "";
  for (let i = 0; i <= target; i++) appendFeed(state.timeline[i], i);
}

// ---------- result ----------
function showResult() {
  const r = state.match.result;
  const b = $("resultBanner");
  b.classList.remove("hidden");
  if (r.type === "tie") { $("resultW").textContent = "🤝 Match Tied!"; $("resultM").textContent = `No super over — an honest tie. · Match #${state.match.seed}`; }
  else {
    $("resultW").innerHTML = `🏆 ${r.winner} win by ${r.margin}`;
    $("resultM").textContent = (r.type === "chase" ? "Chased it down." : "Defended the total.") + ` · Match #${state.match.seed}`;
  }
}

// ---------- scorecards (progressive: rebuilt from balls played so far) ----------
// Replay the first `entryCount` ball-log entries of an innings into a live snapshot.
function progressiveInnings(inn, entryCount) {
  const cards = inn.cards.map(c => ({
    ref: c.ref, name: c.name, ia: c.ia,
    runs: 0, balls: 0, fours: 0, sixes: 0, strikes: 0,
    out: false, outMethod: null, outBowler: null, duck: false, batted: false
  }));
  const byName = {}; cards.forEach(c => byName[c.name] = c);
  const bowl = {}; // insertion order = bowling order
  let total = 0, wickets = 0, balls = 0;
  const n = Math.min(entryCount, inn.ballLog.length);
  for (let i = 0; i < n; i++) {
    const e = inn.ballLog[i];
    const s = byName[e.striker];
    if (s) s.batted = true;
    if (e.nonStriker && byName[e.nonStriker]) {
      byName[e.nonStriker].batted = true;
      if (e.nonStrikerStrikes != null) byName[e.nonStriker].strikes = e.nonStrikerStrikes;
    }
    if (!bowl[e.bowler]) bowl[e.bowler] = { name: e.bowler, balls: 0, runs: 0, wickets: 0, dots: 0 };
    const b = bowl[e.bowler];
    if (e.pair) { // a real delivery
      s.runs += e.runs; s.balls++;
      if (e.label.includes("FOUR")) s.fours += e.label.includes("TWO") ? 2 : 1;
      if (e.label.includes("SIX")) s.sixes += e.label.includes("TWO") ? 2 : 1;
      s.strikes = e.totalStrikes;
      total += e.runs; balls++;
      b.balls++; b.runs += e.runs;
      if (e.runs === 0 && e.strikes === 0) b.dots++;
    }
    if (e.wicket) {
      s.out = true; s.outMethod = e.outMethod; s.outBowler = e.bowler; s.duck = s.runs === 0;
      wickets++; b.wickets++;
    }
  }
  const bowlerStats = Object.values(bowl).filter(b => b.balls > 0 || b.wickets > 0);
  return { cards, bowlerStats, total, wickets, balls };
}

function renderScorecardsAt(idx) {
  const m = state.match, inn1 = m.innings[0], inn2 = m.innings[1];
  const played = idx + 1;
  const c1 = Math.min(played, inn1.ballLog.length);
  const c2 = Math.max(0, played - inn1.ballLog.length);
  $("card1").innerHTML = scorecardHtml(inn1, inn2, progressiveInnings(inn1, c1));
  if (c2 > 0) $("card2").innerHTML = scorecardHtml(inn2, inn1, progressiveInnings(inn2, c2));
  else $("card2").innerHTML = `<div class="empty"><div class="big">⏳</div><p><b>${escapeHtml(m.battingSecond)}</b> yet to bat — chasing <b>${m.target}</b>.</p></div>`;
}

function scorecardHtml(inn, other, prog) {
  const bat = prog.cards.map(c => {
    if (!c.batted) return `<tr><td class="name" style="color:var(--ink-3)">${escapeHtml(c.name)}</td><td class="how" colspan="6" style="text-align:right">did not bat</td></tr>`;
    let how;
    if (c.out) how = c.outMethod === "cap" ? `out — ${c.strikes} total strikes (cap)` : `out — live avg vs ${escapeHtml(c.outBowler || "")}`;
    else how = `<span class="notout">not out</span>`;
    const duck = c.duck ? ` <span class="duck">🦆</span>` : "";
    return `<tr>
      <td><div class="name">${escapeHtml(c.name)}${c.ia ? ' <span class="mini-ia">IA</span>' : ""}${duck}</div><div class="how">${how}</div></td>
      <td>${c.runs}</td><td>${c.balls}</td><td>${c.strikes}</td><td>${c.fours}</td><td>${c.sixes}</td>
      <td>${c.balls ? ((c.runs / c.balls) * 100).toFixed(0) : "—"}</td></tr>`;
  }).join("");

  const bowl = prog.bowlerStats.map(b =>
    `<tr><td class="name">${escapeHtml(b.name)}</td><td>${Math.floor(b.balls / 6)}.${b.balls % 6}</td>
      <td>${b.runs}</td><td>${b.wickets}</td><td>${b.dots}</td>
      <td>${b.balls ? (b.runs / (b.balls / 6)).toFixed(1) : "—"}</td></tr>`
  ).join("") || `<tr><td colspan="6" class="mini">—</td></tr>`;

  const shown = inn.fow.slice(0, prog.wickets);
  const fow = shown.length ? shown.map(f => `${f.score}-${f.wicket} (${escapeHtml(f.batsman)}, ${f.over}.${f.ball})`).join(" · ") : "—";
  const overs = Math.floor(prog.balls / 6) + "." + (prog.balls % 6);
  const rr = prog.balls ? (prog.total / (prog.balls / 6)).toFixed(2) : "0.00";
  const notOut = prog.cards.filter(c => c.batted && !c.out).length;

  return `
    <div class="sc-title" style="color:${teamColor(inn.team)}">${inn.team} <span class="t">${prog.total}/${prog.wickets} (${overs} ov) · RR ${rr}</span></div>
    <table class="sc">
      <thead><tr><th>Batsman</th><th>R</th><th>B</th><th>Strk</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
      <tbody>${bat}</tbody>
    </table>
    <div class="sc-total"><span>Total <span class="tt">(${prog.wickets} wkt${prog.wickets === 1 ? "" : "s"}, ${overs} ov)</span></span>
      <b>${prog.total}/${prog.wickets}</b></div>
    <div class="mini" style="margin:10px 0 4px"><b>Fall of wickets:</b> ${fow}</div>
    <div class="sc-title" style="margin-top:16px">Bowling <span class="t">${other.team}</span></div>
    <table class="sc">
      <thead><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th><th>Dots</th><th>Econ</th></tr></thead>
      <tbody>${bowl}</tbody>
    </table>`;
}

// ---------- worm chart (progressive: only overs bowled so far) ----------
// Build worm points for an innings up to the played portion.
function wormPoints(inn, prog) {
  const pts = [{ o: 0, r: 0 }];
  const completed = Math.floor(prog.balls / 6);
  for (let i = 0; i < completed && i < inn.overSummaries.length; i++) pts.push({ o: inn.overSummaries[i].over, r: inn.overSummaries[i].total });
  const last = pts[pts.length - 1];
  const curOver = prog.balls / 6;
  if (curOver > last.o || prog.total !== last.r) pts.push({ o: curOver, r: prog.total });
  return pts;
}

function renderWormAt(idx) {
  const m = state.match, inn1 = m.innings[0], inn2 = m.innings[1];
  const played = idx + 1;
  const prog1 = progressiveInnings(inn1, Math.min(played, inn1.ballLog.length));
  const c2 = Math.max(0, played - inn1.ballLog.length);
  const prog2 = c2 > 0 ? progressiveInnings(inn2, c2) : null;
  const inn1Done = played >= inn1.ballLog.length;

  const W = 640, H = 300, PL = 44, PR = 20, PT = 16, PB = 30;
  const maxOver = m.overs;
  const maxRuns = Math.max(inn1.total, inn2.total, 20);
  const x = (o) => PL + (o / maxOver) * (W - PL - PR);
  const y = (r) => PT + (1 - r / maxRuns) * (H - PT - PB);

  const path = (pts) => pts.map((p, i) => `${i ? "L" : "M"} ${x(p.o)} ${y(p.r)}`).join(" ");
  const grids = [];
  for (let g = 0; g <= 4; g++) {
    const rv = Math.round((maxRuns / 4) * g);
    grids.push(`<line x1="${PL}" y1="${y(rv)}" x2="${W - PR}" y2="${y(rv)}"/><text class="ax" x="${PL - 8}" y="${y(rv) + 3}" text-anchor="end">${rv}</text>`);
  }
  const xt = [];
  for (let o = 0; o <= maxOver; o += Math.max(1, Math.round(maxOver / 5))) {
    xt.push(`<text class="ax" x="${x(o)}" y="${H - 10}" text-anchor="middle">${o}</text>`);
  }
  // target line — only appears once the 1st innings is complete
  const tgt = inn1Done
    ? `<line x1="${PL}" y1="${y(inn1.total)}" x2="${W - PR}" y2="${y(inn1.total)}" stroke="var(--ink-3)" stroke-dasharray="4 4" stroke-width="1"/>`
    : "";

  const col1 = teamColor(m.battingFirst), col2 = teamColor(m.battingSecond);
  // wicket dots — only wickets that have fallen so far
  const wdots = (inn, prog, col) => inn.fow.slice(0, prog.wickets).map(f => {
    const ov = f.over + (f.ball / 6);
    return `<circle cx="${x(ov)}" cy="${y(f.score)}" r="3.5" fill="var(--wicket)" stroke="${col}" stroke-width="1.5"/>`;
  }).join("");

  const path2 = prog2 ? `<path d="${path(wormPoints(inn2, prog2))}" fill="none" stroke="${col2}" stroke-width="2.5" stroke-linejoin="round"/>` : "";
  $("wormChart").innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:100%">
      <g class="grid">${grids.join("")}${xt.join("")}</g>
      ${tgt}
      <path d="${path(wormPoints(inn1, prog1))}" fill="none" stroke="${col1}" stroke-width="2.5" stroke-linejoin="round"/>
      ${path2}
      ${wdots(inn1, prog1, col1)}${prog2 ? wdots(inn2, prog2, col2) : ""}
    </svg>`;
  $("wormLegend").innerHTML = `
    <span><i style="background:${col1}"></i>${m.battingFirst} (1st) — ${prog1.total}/${prog1.wickets}</span>
    <span><i style="background:${col2}"></i>${m.battingSecond} (2nd) — ${prog2 ? prog2.total + "/" + prog2.wickets : "yet to bat"}</span>
    <span><i style="background:var(--wicket);width:8px;height:8px;border-radius:50%"></i>wicket</span>
    ${inn1Done ? `<span><i style="background:var(--ink-3)"></i>target ${m.target}</span>` : ""}`;
}

// ---------- tabs ----------
function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("show", p.dataset.panel === name));
}

// ---------- rules modal ----------
function showRules() {
  const m = $("rulesModal");
  m.classList.remove("hidden");
  m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);display:grid;place-items:center;z-index:50;padding:20px";
  m.innerHTML = `<div class="card" style="max-width:560px;max-height:80vh;overflow:auto" onclick="event.stopPropagation()">
    <div class="hd">How it works <span class="lineup-toggle" onclick="document.getElementById('rulesModal').classList.add('hidden')">✕ close</span></div>
    <div class="bd" style="font-size:13px;line-height:1.6;color:var(--ink-2)">
      <p><b style="color:var(--ink)">Every ball</b> two dice are rolled (unordered). The result is read off the Dice Table, branching on whether the striker's <b>batting rating is &gt; 5</b> and whether they're an <b style="color:var(--aus)">IA</b> (aggressive) batsman.</p>
      <p><b style="color:var(--ink)">Two currencies:</b> <b style="color:var(--four)">runs</b> (dot/1/2/4/6, and doubles stack to 8 or 12) go to the total; <b style="color:var(--strike)">strikes</b> are the dismissal currency and never reset.</p>
      <p><b style="color:var(--ink)">Getting out:</b> a batsman falls the instant strikes reach either threshold — the <b>rating cap</b> (= own batting rating) or the <b>live average</b> = floor((batting + current bowler's bowling)/2). A great bowler (low number) drags the average down, so the average usually bites — and a set batsman can even fall the moment a much better bowler comes on.</p>
      <p><b style="color:var(--ink)">Format:</b> T20, 20 overs, 10 wickets, max 4 overs/bowler. Odd runs rotate strike; ends change each over. Fully deterministic from the seed.</p>
      <div style="color:var(--ink);font-weight:700;margin:14px 0 6px">Dice Table</div>
      ${diceTableHtml()}
    </div></div>`;
  m.onclick = () => m.classList.add("hidden");
}

// Render the full 21-combination dice table straight from the engine so the
// modal can never drift from the actual rules being simulated.
function diceTableHtml() {
  const rolls = [];
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) rolls.push([a, b]);
  const cell = (pair, rating, ia) => {
    const o = resolveBall(pair, rating, ia);
    const bits = [];
    if (o.runs) bits.push(`<span style="color:var(--four)">${o.runs}r</span>`);
    if (o.strikes) bits.push(`<span style="color:var(--strike)">${o.strikes}s</span>`);
    return bits.length ? bits.join(" ") : `<span style="color:var(--ink-3)">dot</span>`;
  };
  const rows = rolls.map(p => {
    const ia = window.__diceIA;
    return `<tr><td style="font-family:var(--mono);color:var(--ink)">${p[0]},${p[1]}</td>
      <td>${cell(p, 8, ia)}</td><td>${cell(p, 3, ia)}</td></tr>`;
  }).join("");
  return `<div style="margin-bottom:6px;font-size:11px">
      <label style="color:var(--ink-2);cursor:pointer"><input type="checkbox" id="diceIAtoggle" ${window.__diceIA ? "checked" : ""} onchange="window.__diceIA=this.checked;showRules()"> show as IA batsman</label>
    </div>
    <table class="sc" style="font-size:12px"><thead><tr><th>Roll</th><th>Rating &gt;5</th><th>Rating ≤5</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="mini" style="margin-top:4px"><span style="color:var(--four)">r</span> = runs · <span style="color:var(--strike)">s</span> = strikes</div>`;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

init();
