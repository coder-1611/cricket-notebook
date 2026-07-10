// ============================================================================
// Cricket Notebook — UI controller for the editorial design
// (design source: claude.ai/design project f28e38c9-5ee1-4c9d-9d39-5751cc5f4bca)
// ============================================================================
const $ = (id) => document.getElementById(id);
const T = window.TEAMS;

const state = { match: null, timeline: [], idx: -1, playing: false, timer: null };

// team visual identities (from the design: India blue, Australia gold)
const TEAM_STYLE = {
  India:     { sq: "#1849C6", bar: "var(--blue-bright)", label: "var(--blue-pale)", line: "#3D6BE8", total: "blue" },
  Australia: { sq: "#D99000", bar: "var(--gold)",        label: "var(--gold)",     line: "#D99000", total: "ink" }
};
const ts = (name) => TEAM_STYLE[name] || TEAM_STYLE.India;

function fmtAvg(team) {
  const b = team.lineup.reduce((s, p) => s + p.batting, 0) / team.lineup.length;
  const o = team.lineup.reduce((s, p) => s + p.bowling, 0) / team.lineup.length;
  return `BAT ${b.toFixed(1)} · BOWL ${o.toFixed(1)}`;
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
function init() {
  const stadSel = $("stadium-select");
  window.STADIUMS.forEach(s => {
    const o = document.createElement("option");
    o.value = s.id; o.textContent = `${s.name} — ${s.city}`;
    stadSel.appendChild(o);
  });
  stadSel.value = "mumbai";

  const fmtSel = $("format-select");
  Object.values(window.FORMATS).forEach(f => {
    const o = document.createElement("option");
    o.value = f.key; o.textContent = f.label.replace(" — ", " — ");
    fmtSel.appendChild(o);
  });
  fmtSel.value = "T20";
  updateChip();

  $("ind-avg").textContent = fmtAvg(T.India);
  $("aus-avg").textContent = fmtAvg(T.Australia);
  renderLineups();

  $("simulate-btn").onclick = () => runMatch();
  $("replay-btn").onclick = () => { if (state.match) runMatch(state.match.seed); };
  $("seed-dice").onclick = () => { $("seed-input").value = randomSeed(); };
  $("rules-btn").onclick = openRules;
  $("rules-close-btn").onclick = closeRules;
  $("rules-modal").onclick = (e) => { if (e.target === $("rules-modal")) closeRules(); };
  stadSel.onchange = updateChip;
  fmtSel.onchange = updateChip;
  $("lineups-toggle").onclick = () => {
    const hidden = $("lineups-box").classList.toggle("hidden");
    $("lineups-chev").innerHTML = hidden ? "&#9662; SHOW" : "&#9652; HIDE";
  };

  $("play-btn").onclick = togglePlay;
  $("step-fwd-btn").onclick = () => { pause(); step(1); };
  $("step-back-btn").onclick = () => { pause(); step(-1); };
  $("skip-innings-btn").onclick = skipInnings;
  $("speed-slider").oninput = () => { if (state.playing) { pause(); play(); } };

  document.querySelectorAll(".cn-tab").forEach(t => t.onclick = () => switchTab(t.dataset.tab));

  renderRulesBody();

  // hidden replay/testing deep-link: ?seed=7&format=ODI&stadium=mumbai&auto=1&to=60&tab=worm
  const q = new URLSearchParams(location.search);
  const linkSeed = q.get("seed") ? (parseInt(q.get("seed")) >>> 0) : null;
  if (q.get("format") && window.FORMATS[q.get("format")]) { fmtSel.value = q.get("format"); updateChip(); }
  if (q.get("stadium") && window.STADIUMS.some(s => s.id === q.get("stadium"))) { stadSel.value = q.get("stadium"); updateChip(); }
  if (linkSeed != null) $("seed-input").value = linkSeed;
  if (q.get("auto")) {
    runMatch(linkSeed);
    if (q.get("to")) { const n = parseInt(q.get("to")); while (state.idx < Math.min(n, state.timeline.length - 1)) step(1); }
    if (q.get("tab")) switchTab(q.get("tab"));
  }
  if (q.get("rules")) openRules();
}

function updateChip() {
  const s = window.STADIUMS.find(x => x.id === $("stadium-select").value);
  const f = window.FORMATS[$("format-select").value] || window.FORMATS.T20;
  $("chip-stadium").textContent = `${s.name}, ${s.city}`;
  $("chip-format").textContent = `${f.key} · ${f.overs} overs`;
}

function renderLineups() {
  const box = $("lineups-box");
  box.innerHTML = ["India", "Australia"].map(tn => {
    const t = T[tn];
    const capColor = tn === "India" ? "var(--blue)" : "var(--gold-deep)";
    const rows = t.lineup.map(p => `
      <div class="lp-row">
        <span class="nm">${escapeHtml(p.name)}${p.captain ? " (c)" : ""}${p.keeper ? " †" : ""}${p.ia ? ' <span class="ia-badge">IA</span>' : ""}</span>
        <span class="rt">bat ${p.batting} · bwl ${p.bowling}</span>
      </div>`).join("");
    return `<div>
      <div class="lineup-team-cap" style="color:${capColor}"><span class="dot7" style="background:${ts(tn).sq}"></span>${tn}</div>
      <div style="display:flex;flex-direction:column">${rows}</div>
    </div>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// run / seed
// ---------------------------------------------------------------------------
function randomSeed() {
  if (window.crypto && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  return Math.floor(Math.random() * 0xFFFFFFFF) || 1;
}

function runMatch(seedOverride) {
  pause();
  const format = window.FORMATS[$("format-select").value] || window.FORMATS.T20;
  // Seed priority: explicit override (Replay / deep-link) > typed seed > random.
  let seed, source;
  if (seedOverride != null) { seed = seedOverride >>> 0; source = "chosen"; }
  else {
    const raw = $("seed-input").value.trim();
    if (raw !== "" && Number.isFinite(+raw)) { seed = (+raw) >>> 0; source = "chosen"; }
    else { seed = randomSeed(); source = "random"; }
  }
  const stadium = window.STADIUMS.find(x => x.id === $("stadium-select").value);
  const m = simulateMatch(T.India, T.Australia, { format, seed, stadium: stadium.name });
  state.match = m;
  // Only surface the seed when it was deliberately chosen; keep random matches a mystery.
  $("seed-current").innerHTML = source === "chosen" ? `now playing <b>#${seed}</b>` : "";
  state.timeline = [...m.innings[0].ballLog, ...m.innings[1].ballLog];
  state.idx = -1;
  $("live-area").classList.remove("hidden");
  $("result-banner").classList.add("hidden");
  $("feed").innerHTML = "";
  step(1);
  switchTab("commentary");
}

// ---------------------------------------------------------------------------
// playback
// ---------------------------------------------------------------------------
function togglePlay() { state.playing ? pause() : play(); }
function play() {
  if (!state.match) return;
  if (state.idx >= state.timeline.length - 1) { $("feed").innerHTML = ""; state.idx = -1; }
  state.playing = true; $("play-btn").innerHTML = "&#9208;&#65038; Pause";
  const v = parseInt($("speed-slider").value);           // 1 (slow) .. 10 (fast)
  const interval = Math.max(50, 850 - v * 80);
  state.timer = setInterval(() => {
    if (state.idx >= state.timeline.length - 1) { pause(); return; }
    step(1);
  }, interval);
}
function pause() {
  state.playing = false;
  if ($("play-btn")) $("play-btn").innerHTML = "&#9654;&#65038; Play";
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
}
function step(dir) {
  const ni = state.idx + dir;
  if (ni < 0 || ni >= state.timeline.length) return;
  if (dir === 1) appendFeed(state.timeline[ni], ni);
  else removeLastFeed();
  state.idx = ni;
  renderAt(ni);
}
function skipInnings() {
  pause();
  if (!state.match) return;
  const cur = state.idx < 0 ? 1 : state.timeline[state.idx].inningNo;
  let target = state.timeline.length - 1;
  if (cur === 1) {
    for (let i = 0; i < state.timeline.length; i++) if (state.timeline[i].inningNo === 2) { target = i - 1; break; }
  }
  $("feed").innerHTML = "";
  for (let i = 0; i <= target; i++) appendFeed(state.timeline[i], i);
  state.idx = target;
  renderAt(target);
}

// ---------------------------------------------------------------------------
// per-ball render
// ---------------------------------------------------------------------------
function renderAt(idx) {
  const m = state.match, e = state.timeline[idx];
  const first = m.battingFirst, second = m.battingSecond;
  const inn1 = m.innings[0];

  // scoreboard slabs: A = batting first, B = batting second
  paintSlab("a", first, e.inningNo === 1 ? e : null, inn1, 1, idx);
  paintSlab("b", second, e.inningNo === 2 ? e : null, inn1, 2, idx);

  // chase strip
  const done = idx === state.timeline.length - 1;
  if (done) {
    const r = m.result;
    $("chase-cap").textContent = "RESULT";
    if (r.type === "tie") $("chase-text").innerHTML = `Scores level on <b>${inn1.total}</b> — an honest tie. No super over.`;
    else if (r.type === "chase") {
      const ballsLeft = m.overs * 6 - ballsInInnings(idx, 2);
      $("chase-text").innerHTML = `Target <b>${m.target}</b> · ${second} got there with <b>${ballsLeft} ball${ballsLeft === 1 ? "" : "s"}</b> to spare · won by <b>${r.margin}</b>`;
    } else {
      $("chase-text").innerHTML = `Target <b>${m.target}</b> · ${second} fell <b>${r.margin}</b> short`;
    }
  } else if (e.inningNo === 1) {
    $("chase-cap").textContent = "1ST INNINGS";
    $("chase-text").innerHTML = `${first} batting · setting a total for ${second} to chase`;
  } else {
    const need = m.target - e.teamScore;
    const ballsLeft = m.overs * 6 - ballsInInnings(idx, 2);
    $("chase-cap").textContent = "CHASE";
    $("chase-text").innerHTML = `Target <b>${m.target}</b> · ${second} need <b>${Math.max(0, need)}</b> off <b>${ballsLeft} balls</b>`;
  }

  // crease
  $("striker-name").innerHTML = `${escapeHtml(e.striker)}${e.strikerIA ? ' <span class="ia-badge">IA</span>' : ""}`;
  $("striker-runs").textContent = e.strikerRuns;
  $("striker-balls").textContent = `${e.strikerBalls} ball${e.strikerBalls === 1 ? "" : "s"}`;
  // total-strike cap is the main meter; show the current bowler's own live-average
  // duel alongside it (the per-bowler bar that can also end the innings).
  $("striker-pressure").textContent = (e.bowlerStrikes != null && e.avgThreshold != null)
    ? `strikes ${e.totalStrikes}/${e.threshold} · vs bowler ${e.bowlerStrikes}/${e.avgThreshold}`
    : `strikes ${e.totalStrikes}/${e.threshold}`;
  $("striker-meter").style.width = pct(e.totalStrikes, e.threshold);
  if (e.nonStriker) {
    $("card-partner").style.opacity = 1;
    $("partner-name").innerHTML = escapeHtml(e.nonStriker);
    $("partner-tag").innerHTML = e.nonStrikerIA ? '<span class="ia-badge">IA</span>' : "";
    $("partner-runs").textContent = e.nonStrikerRuns;
    $("partner-balls").textContent = `${e.nonStrikerBalls} ball${e.nonStrikerBalls === 1 ? "" : "s"}`;
    $("partner-pressure").textContent = `strikes ${e.nonStrikerStrikes}/${e.nonStrikerThreshold}`;
    $("partner-meter").style.width = pct(e.nonStrikerStrikes, e.nonStrikerThreshold);
  } else {
    $("card-partner").style.opacity = .45;
    $("partner-name").textContent = "—"; $("partner-tag").innerHTML = "";
    $("partner-runs").textContent = ""; $("partner-balls").textContent = "last man";
    $("partner-pressure").textContent = ""; $("partner-meter").style.width = "0%";
  }

  // bowler line + phase chip
  $("bowler-name").textContent = e.bowler;
  const typeIcon = e.bowlerType === "spin"
    ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="flex:none"><path d="M12 3a9 9 0 1 0 9 9" stroke="#1849C6" stroke-width="3" stroke-linecap="round"/></svg>'
    : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="flex:none"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="#C43D0C"/></svg>';
  $("bowler-type").innerHTML = `${typeIcon} ${e.bowlerType || "pace"} &middot; rating ${e.bowlerRating}`;
  $("chip-pp").classList.toggle("show", e.phase === "Powerplay");
  $("chip-mid").classList.toggle("show", e.phase === "Middle");
  $("chip-death").classList.toggle("show", e.phase === "Death");

  // last ball
  if (e.pair) {
    diePips($("die-1"), e.pair[0]);
    diePips($("die-2"), e.pair[1]);
    $("lb-pair").textContent = `[${e.pair[0]}–${e.pair[1]}]`;
  } else {
    diePips($("die-1"), 0); diePips($("die-2"), 0);
    $("lb-pair").textContent = "";
  }
  $("lb-label").textContent = e.label;
  $("lb-comm").textContent = e.commentary;
  paintResultPill(e);

  // progressive scorecards + worm
  renderScorecardsAt(idx);
  renderWormAt(idx);

  // result banner
  if (done) showResult(); else $("result-banner").classList.add("hidden");
}

function paintSlab(slot, teamName, liveEntry, inn1, innNo, idx) {
  const st = ts(teamName);
  $(`slab-${slot}-bar`).style.background = st.bar;
  const m = state.match;
  const e = state.timeline[idx];
  const isLive = liveEntry != null;
  const label = `${teamName.toUpperCase()} <span class="inntag">${innNo === 1 ? "1ST INN" : "2ND INN"}</span>` +
    (isLive && idx < state.timeline.length - 1 ? ' <span class="bat-pill"><span class="dotp"></span>BATTING</span>' : "");
  $(`slab-${slot}-label`).innerHTML = label;
  $(`slab-${slot}-label`).style.color = st.label;
  $(`slab-${slot}`).classList.toggle("lit", isLive);

  if (innNo === 1) {
    const score = e.inningNo === 1 ? `${e.teamScore}<span class="sl">/</span>${e.wickets}` : `${inn1.total}<span class="sl">/</span>${inn1.wickets}`;
    const balls = e.inningNo === 1 ? ballsInInnings(idx, 1) : inn1.balls;
    const rr = balls ? ((e.inningNo === 1 ? e.teamScore : inn1.total) / (balls / 6)).toFixed(2) : "0.00";
    $(`slab-${slot}-score`).innerHTML = score;
    $(`slab-${slot}-meta`).textContent = `${oversStr(balls)} overs · RR ${rr}`;
  } else {
    if (e.inningNo === 2) {
      const balls = ballsInInnings(idx, 2);
      const rr = balls ? (e.teamScore / (balls / 6)).toFixed(2) : "0.00";
      $(`slab-${slot}-score`).innerHTML = `${e.teamScore}<span class="sl">/</span>${e.wickets}`;
      $(`slab-${slot}-meta`).textContent = `${oversStr(balls)} overs · RR ${rr}`;
    } else {
      $(`slab-${slot}-score`).innerHTML = "&mdash;";
      $(`slab-${slot}-meta`).textContent = "yet to bat";
    }
  }
}

function pct(a, b) { return Math.min(100, Math.round((a / Math.max(1, b)) * 100)) + "%"; }
function oversStr(balls) { return Math.floor(balls / 6) + "." + (balls % 6); }
function ballsInInnings(idx, inn) {
  let c = 0;
  for (let i = 0; i <= idx; i++) if (state.timeline[i].inningNo === inn && state.timeline[i].pair) c++;
  return c;
}

// dice pips: positions on a 3x3 grid (percentages of die size)
const PIPS = {
  0: [], 1: [[50, 50]], 2: [[27, 27], [73, 73]], 3: [[27, 27], [50, 50], [73, 73]],
  4: [[27, 27], [73, 27], [27, 73], [73, 73]], 5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
  6: [[27, 27], [73, 27], [27, 50], [73, 50], [27, 73], [73, 73]]
};
function diePips(el, n) {
  el.innerHTML = (PIPS[n] || []).map(([x, y]) => `<span class="pip" style="left:${x}%;top:${y}%"></span>`).join("");
}

function ballKind(e) {
  if (e.wicket) return "wicket";
  if (e.label.includes("SIX")) return "six";
  if (e.label.includes("FOUR")) return "four";
  if (e.strikes > 0) return "strike";
  if (e.runs > 0) return "run";
  return "dot";
}
function paintResultPill(e) {
  const kind = ballKind(e);
  const pill = $("result-pill");
  pill.className = "";
  if (kind === "wicket") { pill.classList.add("wicket"); pill.textContent = "WICKET"; }
  else if (kind === "six") { pill.classList.add("six"); pill.textContent = e.runs; }
  else if (kind === "four") { pill.classList.add("four"); pill.textContent = e.runs; }
  else if (kind === "strike") { pill.classList.add("strike"); pill.textContent = e.strikes > 1 ? `${e.strikes}×S` : "S"; }
  else pill.textContent = kind === "dot" ? "•" : e.runs;
  pill.id = "result-pill";
}

// ---------------------------------------------------------------------------
// feed
// ---------------------------------------------------------------------------
function badgeFor(e) {
  const kind = ballKind(e);
  const txt = kind === "wicket" ? "W" : kind === "strike" ? "S" : kind === "dot" ? "•" : e.runs;
  return { kind, txt };
}
function appendFeed(e, idx) {
  const feed = $("feed");
  if (idx === 0) feed.innerHTML = "";
  if (idx > 0 && state.timeline[idx - 1].inningNo !== e.inningNo) {
    const sep = document.createElement("div");
    sep.className = "feed-row sep";
    sep.innerHTML = `<span class="ov"></span><span class="cm">2ND INNINGS — ${escapeHtml(state.match.battingSecond).toUpperCase()} CHASING ${state.match.target}</span>`;
    feed.prepend(sep);
  }
  const { kind, txt } = badgeFor(e);
  const row = document.createElement("div");
  row.className = "feed-row" + (e.wicket ? " wk" : "");
  const ov = e.pair ? `${e.over - 1}.${e.ballInOver}` : `${e.over - 1}.–`;
  row.innerHTML = `<span class="ov">${ov}</span><span class="fbadge ${kind}">${txt}</span><span class="cm">${escapeHtml(e.commentary)}</span>`;
  feed.prepend(row);
  $("feed-count").textContent = `${idx + 1} balls`;
}
function removeLastFeed() {
  const feed = $("feed");
  if (feed.firstChild) feed.removeChild(feed.firstChild);
  if (feed.firstChild && feed.firstChild.classList.contains("sep")) feed.removeChild(feed.firstChild);
  $("feed-count").textContent = `${Math.max(0, state.idx)} balls`;
}

// ---------------------------------------------------------------------------
// result banner
// ---------------------------------------------------------------------------
function showResult() {
  const m = state.match, r = m.result;
  $("result-banner").classList.remove("hidden");
  $("result-kicker").textContent = `MATCH #${m.seed} · RESULT`;
  if (r.type === "tie") {
    $("result-wm").textContent = "TIE";
    $("result-title").textContent = "Match tied";
    $("result-sub").textContent = "Scores dead level — no super over, an honest tie.";
  } else {
    $("result-wm").textContent = "WIN";
    $("result-title").textContent = `${r.winner} win by ${r.margin}`;
    $("result-sub").textContent = r.type === "chase" ? "Chased it down." : "Defended the total.";
  }
}

// ---------------------------------------------------------------------------
// progressive scorecards
// ---------------------------------------------------------------------------
function progressiveInnings(inn, entryCount) {
  const cards = inn.cards.map(c => ({
    ref: c.ref, name: c.name, ia: c.ia,
    runs: 0, balls: 0, fours: 0, sixes: 0, strikes: 0,
    out: false, outMethod: null, outBowler: null, duck: false, batted: false
  }));
  const byName = {}; cards.forEach(c => byName[c.name] = c);
  const bowl = {};
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
    if (e.pair) {
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
  return { cards, bowlerStats: Object.values(bowl).filter(b => b.balls > 0 || b.wickets > 0), total, wickets, balls };
}

function renderScorecardsAt(idx) {
  const m = state.match, inn1 = m.innings[0], inn2 = m.innings[1];
  const played = idx + 1;
  const c1 = Math.min(played, inn1.ballLog.length);
  const c2 = Math.max(0, played - inn1.ballLog.length);
  $("panel-innings1").innerHTML = scorecardHtml(inn1, inn2, progressiveInnings(inn1, c1), false);
  if (c2 > 0) $("panel-innings2").innerHTML = scorecardHtml(inn2, inn1, progressiveInnings(inn2, c2), true);
  else $("panel-innings2").innerHTML = `<div class="empty-panel">${escapeHtml(m.battingSecond)} are yet to bat — chasing ${m.target}.</div>`;
}

function scorecardHtml(inn, other, prog, isChase) {
  const st = ts(inn.team);
  const overs = oversStr(prog.balls);
  const rr = prog.balls ? (prog.total / (prog.balls / 6)).toFixed(2) : "0.00";

  const batRows = prog.cards.map(c => {
    if (!c.batted) return `
      <div class="bat-grid tbl-row">
        <div><div class="pname" style="color:var(--faint)">${escapeHtml(c.name)}</div><div class="out-line dnb">did not bat</div></div>
        <span class="num">—</span><span class="num">—</span><span class="num">—</span><span class="num">—</span><span class="num">—</span><span class="num">—</span>
      </div>`;
    let outCls = "", outTxt;
    if (c.out) outTxt = c.outMethod === "cap" ? `out — ${c.strikes} total strikes` : `out — live avg vs ${escapeHtml(c.outBowler || "")}`;
    else { outCls = " notout"; outTxt = "not out"; }
    const sr = c.balls ? ((c.runs / c.balls) * 100).toFixed(0) : "—";
    return `
      <div class="bat-grid tbl-row">
        <div>
          <div class="pname">${escapeHtml(c.name)}${c.ia ? ' <span class="ia-badge">IA</span>' : ""}${c.duck ? ' <span style="font-size:13px">🦆</span>' : ""}</div>
          <div class="out-line${outCls}">${outTxt}</div>
        </div>
        <span class="num strong">${c.runs}</span>
        <span class="num">${c.balls}</span>
        <span class="num">${c.strikes}</span>
        <span class="num">${c.fours}</span>
        <span class="num">${c.sixes}</span>
        <span class="num plain">${sr}</span>
      </div>`;
  }).join("");

  const shown = inn.fow.slice(0, prog.wickets);
  const fow = shown.length
    ? shown.map(f => `${f.score}&ndash;${f.wicket} (${escapeHtml(f.batsman)}, ${f.over}.${f.ball})`).join(" · ")
    : "—";

  const bowlRows = prog.bowlerStats.map(b => `
    <div class="bowl-grid tbl-row">
      <span class="pname">${escapeHtml(b.name)}</span>
      <span class="num">${oversStr(b.balls)}</span>
      <span class="num">${b.runs}</span>
      <span class="num${b.wickets >= 2 ? " hot" : ""}">${b.wickets}</span>
      <span class="num">${b.dots}</span>
      <span class="num plain">${b.balls ? (b.runs / (b.balls / 6)).toFixed(1) : "—"}</span>
    </div>`).join("") || `<div class="tbl-row" style="font-family:var(--mono);font-size:12px;color:var(--faint)">—</div>`;

  return `
    <div class="card-head">
      <span class="tm"><span class="sq10" style="background:${st.sq}"></span>${inn.team}</span>
      <span class="sc">${prog.total}/${prog.wickets} (${overs} ov) · RR ${rr}${isChase ? ` · chasing ${state.match.target}` : ""}</span>
    </div>
    <div class="table-scroll">
      <div class="bat-grid tbl-cap">
        <span>BATSMAN</span><span>R</span><span>B</span><span>STRK</span><span>4s</span><span>6s</span><span>SR</span>
      </div>
      ${batRows}
    </div>
    <div class="total-bar ${st.total}">
      <span class="tk">TOTAL · ${prog.wickets} WKT${prog.wickets === 1 ? "" : "S"} · ${overs} OV · EXTRAS 0</span>
      <span class="tv">${prog.total}/${prog.wickets}</span>
    </div>
    <div class="fow-line"><b>FALL OF WICKETS&nbsp;&nbsp;</b>${fow}</div>
    <div class="card-hr"></div>
    <div class="sec-head"><span class="t">Bowling</span><span class="s">${escapeHtml(other.team)}</span></div>
    <div class="table-scroll">
      <div class="bowl-grid tbl-cap">
        <span>BOWLER</span><span>O</span><span>R</span><span>W</span><span>DOTS</span><span>ECON</span>
      </div>
      ${bowlRows}
    </div>`;
}

// ---------------------------------------------------------------------------
// run worm (design-style SVG, progressive)
// ---------------------------------------------------------------------------
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

  const maxOver = m.overs;
  const raw = Math.max(inn1.total, inn2.total, m.target || 0, 40);
  const stepR = Math.ceil(raw / 4 / 10) * 10;
  const maxRuns = stepR * 4;
  const X = (o) => 20 + (o / maxOver) * 1000;
  const Y = (r) => 380 - (r / maxRuns) * 342;

  const grid = [];
  for (let g = 0; g <= 4; g++) {
    const rv = stepR * g, y = Y(rv);
    grid.push(`<line x1="20" y1="${y}" x2="1020" y2="${y}" stroke="${g === 0 ? "#E4DBC6" : "#EDE5D2"}" stroke-width="1"/>`);
    grid.push(`<text x="8" y="${y + 4}" font-family="IBM Plex Mono" font-size="12" fill="#B4A88F" text-anchor="end">${rv}</text>`);
  }
  const xt = [];
  const tickStep = Math.max(1, Math.round(maxOver / 5));
  for (let o = 0; o <= maxOver; o += tickStep) {
    xt.push(`<text x="${X(o)}" y="402" font-family="IBM Plex Mono" font-size="12" fill="#B4A88F" text-anchor="${o === 0 ? "start" : "middle"}">${o}</text>`);
  }

  const tgt = inn1Done
    ? `<line x1="20" y1="${Y(m.target)}" x2="1020" y2="${Y(m.target)}" stroke="#7C7160" stroke-width="2" stroke-dasharray="7 6" opacity="0.7"/>
       <text x="1016" y="${Y(m.target) - 10}" font-family="IBM Plex Mono" font-size="11" fill="#7C7160" text-anchor="end">target ${m.target}</text>`
    : "";

  const poly = (pts, color) =>
    `<polyline points="${pts.map(p => `${X(p.o).toFixed(1)},${Y(p.r).toFixed(1)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  const wdots = (inn, prog, stroke) => inn.fow.slice(0, prog.wickets).map(f =>
    `<circle cx="${X(f.over + f.ball / 6).toFixed(1)}" cy="${Y(f.score).toFixed(1)}" r="5.5" fill="#C43D0C" stroke="${stroke}" stroke-width="2"/>`).join("");

  const c1s = ts(m.battingFirst).line, c2s = ts(m.battingSecond).line;
  $("worm-chart").innerHTML = `
    <svg viewBox="-45 0 1105 420" style="width:100%;height:auto;display:block">
      ${grid.join("")}${xt.join("")}
      ${tgt}
      ${poly(wormPoints(inn1, prog1), c1s)}
      ${prog2 ? poly(wormPoints(inn2, prog2), c2s) : ""}
      ${wdots(inn1, prog1, "#FFFDF6")}${prog2 ? wdots(inn2, prog2, "#211C13") : ""}
    </svg>`;

  $("worm-legend").innerHTML = `
    <span class="k" style="letter-spacing:2.5px">CUMULATIVE SCORE BY OVER</span>
    <span class="spacer"></span>
    <span class="lg"><span class="sw" style="background:${c1s}"></span>${m.battingFirst} (1st) &mdash; ${prog1.total}/${prog1.wickets}</span>
    <span class="lg"><span class="sw" style="background:${c2s}"></span>${m.battingSecond} (2nd) &mdash; ${prog2 ? `${prog2.total}/${prog2.wickets}` : "yet to bat"}</span>
    <span class="lg"><span class="swdot"></span>wicket</span>
    ${inn1Done ? `<span class="lg"><span class="swdash"></span>target ${m.target}</span>` : ""}`;
}

// ---------------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------------
function switchTab(name) {
  document.querySelectorAll(".cn-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("hidden", p.dataset.panel !== name));
}

// ---------------------------------------------------------------------------
// rules modal (accurate copy + compact dice table straight from the engine)
// ---------------------------------------------------------------------------
function openRules() { $("rules-modal").classList.remove("hidden"); }
function closeRules() { $("rules-modal").classList.add("hidden"); }

function renderRulesBody() {
  const cell = (pair, rating, ia) => {
    const o = resolveBall(pair, rating, ia);
    const bits = [];
    if (o.runs) bits.push(`<span class="rr">${o.runs}r</span>`);
    if (o.strikes) bits.push(`<span class="ss">${o.strikes}s</span>`);
    return bits.length ? bits.join(" + ") : `<span class="dd">dot</span>`;
  };
  const rows = [];
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) {
    const base = cell([a, b], 8, false), lo = cell([a, b], 3, false), iaHi = cell([a, b], 8, true);
    rows.push(`<tr><td>${a},${b}</td><td>${base}</td><td>${lo}</td><td>${iaHi !== base ? iaHi : '<span class="dd">—</span>'}</td></tr>`);
  }
  $("rules-body").innerHTML = `
    <p>Every ball is a roll of <b>two dice</b>. The unordered pair is looked up in the Dice Table, which branches on the striker&rsquo;s <b>batting rating</b> (&gt;5 or &le;5) and their <b>IA</b> (aggression) trait.</p>
    <p><b>Two currencies.</b> Runs go on the board; <b style="color:var(--orange)">strikes</b> stack on the batsman and never reset. Each strike counts twice over: once on his <b>running total</b>, and once on the <b>tally of the bowler who bowled it</b>.</p>
    <p><b>Two ways out.</b> <b>Total strikes</b> &mdash; every strike from every bowler adds to one total; reach your own batting rating and you&rsquo;re out (&ldquo;out &mdash; N total strikes&rdquo;), the universal ceiling. Or the <b>live average</b> &mdash; each bowler keeps a <i>separate</i> count of the strikes <i>they</i> landed on you; when one bowler&rsquo;s own count reaches &lfloor;(batting&nbsp;+&nbsp;that bowler&rsquo;s rating)&thinsp;/&thinsp;2&rfloor;, they get you. A strike from a different bowler adds to your total but not to <i>their</i> tally &mdash; and a wicket only falls on a ball actually bowled, never just because a new bowler comes on.</p>
    <p><b>Phases matter.</b> Pace attacks the powerplay, spin squeezes the middle overs, and scoring surges again at the death.</p>
    <p><b>Big hits come in twos.</b> A &ldquo;two sixes&rdquo; (or two fours) is played <b>across two deliveries</b> &mdash; one hit per ball. If the first lands on the last ball of the over, the ends change and the <b>other batsman</b> banks the second. And in a chase, the moment the target is passed the innings ends, so the second hit is never needed.</p>
    <p class="rules-note">Seeds are random &mdash; every simulation is a fresh match. Replay re-runs the last one identically.</p>
    <table class="dice-tbl">
      <thead><tr><th>ROLL</th><th>RATING &gt;5</th><th>RATING &le;5</th><th>IA (&gt;5)</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
    <p class="rules-note">r = runs &middot; s = strikes &middot; base table shown; T20/ODI balance profiles and the powerplay/death boost adjust some cells (see tactics.md).</p>`;
}

init();
