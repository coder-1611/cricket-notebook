// ============================================================================
// Cricket Notebook — PLAY mode controller.
// Room lifecycle (create/join/rejoin) → squad pick → batting order → toss →
// ball-by-ball play with a charged FACE BALL button and a delivery animation.
// All game state is deterministic replay of the Firebase action log (see
// playengine.js); this file is pure presentation + input.
// ============================================================================
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const CHARGE_MS = 1500;

  // ---------- local session ----------
  let my = null;            // { code, role, name }
  let doc = null;           // latest room doc
  let match = null;         // playengine instance
  let applied = 0;          // actions applied into `match`
  let watcher = null;
  let animChain = Promise.resolve();
  let chargeTimer = null, chargedAt = 0;
  let mySquad = [], picks = [], order = [];
  let xiSubmitted = false, tossShown = false;

  const save = () => sessionStorage.setItem("cn_play", JSON.stringify(my));
  const load = () => { try { return JSON.parse(sessionStorage.getItem("cn_play")); } catch (e) { return null; } };

  // ---------- tiny UI helpers ----------
  const screens = ["s-entry", "s-lobby", "s-squad", "s-order", "s-waitxi", "s-toss", "s-play", "s-break", "s-result"];
  function show(id) { screens.forEach(s => $(s).classList.toggle("on", s === id)); }
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("on");
    setTimeout(() => t.classList.remove("on"), 2200);
  }
  function loader(on, line) {
    $("net-loader").classList.toggle("on", !!on);
    if (line) $("net-line").textContent = line;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const oppRole = r => r === "p1" ? "p2" : "p1";
  function pname(role) { return doc && doc.players && doc.players[role] ? doc.players[role].name : "—"; }
  function pcountry(role) { return doc && doc.players && doc.players[role] ? doc.players[role].country : "—"; }
  function flag(c) { return c === "India" ? "🇮🇳" : "🇦🇺"; }

  function setTurnColor(role) { // frame + banner color for whoever must act
    if (role) document.body.dataset.turncolor = role;
    else delete document.body.dataset.turncolor;
    document.documentElement.style.setProperty("--me", role === "p2" ? "var(--p2)" : "var(--p1)");
  }

  // ---------- squads ----------
  function squadIdxFor(role) {
    const country = pcountry(role);
    const rng = mulberry32(((doc.seed >>> 0) ^ (role === "p1" ? 0x9E3779B9 : 0x85EBCA6B)) >>> 0);
    return drawSquad(SQUADS[country], rng, 25);
  }
  function playerOf(role, idx) { return SQUADS[pcountry(role)][idx]; }

  // ---------- entry ----------
  function segVal(id) { return $(id).querySelector(".sel").dataset.v; }
  ["seg-country", "seg-format"].forEach(id => {
    $(id).addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      $(id).querySelectorAll("button").forEach(x => x.classList.toggle("sel", x === b));
    });
  });

  $("create-btn").onclick = async () => {
    const name = $("name-input").value.trim();
    if (!name) return toast("Enter your name first");
    loader(true, "CREATING YOUR ROOM…");
    try {
      const r = await NET.createRoom({ name, country: segVal("seg-country"), format: segVal("seg-format") });
      my = { code: r.code, role: "p1", name }; save();
      startWatching();
    } catch (e) { toast("Couldn't create room — check your connection"); }
    loader(false);
  };
  $("join-btn").onclick = async () => {
    const name = $("name-input").value.trim();
    const code = $("join-code").value.trim().toUpperCase();
    if (!name) return toast("Enter your name first");
    if (code.length !== 5) return toast("Room codes are 5 letters");
    loader(true, "JOINING THE MATCH…");
    try {
      const r = await NET.joinRoom(code, { name });
      my = { code, role: "p2", name }; save();
      startWatching();
    } catch (e) { toast(e.message || "Couldn't join that room"); }
    loader(false);
  };

  function inviteURL() {
    return location.origin + location.pathname + "?room=" + my.code;
  }
  function copyInvite() {
    navigator.clipboard.writeText(inviteURL()).then(() => toast("Invite link copied!"));
  }
  $("copy-link-btn").onclick = copyInvite;
  $("copy-room").onclick = copyInvite;

  // ---------- watching / routing ----------
  function startWatching() {
    $("room-chip").style.display = "flex";
    $("room-code-chip").textContent = my.code;
    if (watcher) watcher.stop();
    watcher = NET.watchRoom(my.code, d => { doc = d; route(); });
  }

  function ensureMatch() {
    if (match || !doc || !doc.xi || !doc.xi.p1 || !doc.xi.p2) return;
    const mk = role => ({
      name: pname(role), country: pcountry(role),
      xi: doc.xi[role].map(i => playerOf(role, i))
    });
    match = createPlayMatch({ seed: doc.seed, format: FORMATS_PLAY[doc.format], p1: mk("p1"), p2: mk("p2") });
    applied = 0;
  }

  function route() {
    if (!doc) return;
    // a rematch room was created from this one — both players migrate
    if (doc.rematch && match && match.stage === "done") {
      my = { code: doc.rematch, role: my.role, name: my.name }; save();
      match = null; applied = 0; tossShown = false; xiSubmitted = true; chargedAt = 0;
      animChain = Promise.resolve();
      $("rematch-btn").disabled = false;
      $("rematch-wait").style.display = "none";
      toast("Rematch on — new toss!");
      startWatching();
      return;
    }
    if (!doc.players || !doc.players.p2) { renderLobby(); show("s-lobby"); setTurnColor(null); return; }
    if (!doc.xi || !doc.xi[my.role]) {
      // xiSubmitted but not yet echoed back: hold on the waiting screen
      if (!xiSubmitted) enterSquadPick();
      else { $("waitxi-line").textContent = "locking in your XI…"; show("s-waitxi"); }
      return;
    }
    if (!doc.xi[oppRole(my.role)]) {
      $("waitxi-line").textContent = `waiting for ${pname(oppRole(my.role))} to pick their XI…`;
      show("s-waitxi"); setTurnColor(oppRole(my.role));
      return;
    }
    ensureMatch();
    syncActions();
  }

  // apply any new actions; ball actions animate one at a time
  function syncActions() {
    const acts = NET.sortedActions(doc);
    const fresh = acts.slice(applied);
    if (!fresh.length) { refreshStage(); return; }
    const catchUp = applied === 0 && fresh.length > 3; // rejoining mid-match: no animations
    for (const act of fresh) {
      applied++;
      if (catchUp) { match.apply(act); continue; }
      const a = act;
      animChain = animChain.then(async () => {
        const isBall = a.a === "ball" && (match.stage === "ball");
        const ok = match.apply(a);
        if (ok && isBall && match.lastEvent) await animateDelivery(match.lastEvent);
        refreshStage();
      });
    }
    if (catchUp) refreshStage();
  }

  // ---------- lobby ----------
  function renderLobby() {
    const fmt = FORMATS_PLAY[doc.format] || FORMATS_PLAY.T20;
    $("lobby-format").textContent = `${fmt.key} · ${fmt.overs} OVERS`;
    $("share-code").textContent = my.code;
    const set = (el, role) => {
      const p = doc.players[role];
      el.classList.toggle("empty", !p);
      el.querySelector(".nm").textContent = p ? p.name : "waiting…";
      el.querySelector(".ct").textContent = p ? `${flag(p.country)} ${p.country}` : "share the code ↓";
    };
    set($("lp1"), "p1"); set($("lp2"), "p2");
  }

  // ---------- squad pick ----------
  function enterSquadPick() {
    if ($("s-squad").classList.contains("on") || $("s-order").classList.contains("on")) return;
    mySquad = squadIdxFor(my.role);
    picks = [];
    renderSquad();
    show("s-squad"); setTurnColor(my.role);
  }
  function renderSquad() {
    const country = pcountry(my.role);
    $("squad-cap").textContent = `PICK YOUR XI — ${country.toUpperCase()} (${pname(my.role).toUpperCase()})`;
    $("squad-title").textContent = `${flag(country)} Your 25-man ${country} squad`;
    const g = $("squad-grid"); g.innerHTML = "";
    mySquad.forEach(idx => {
      const p = SQUADS[country][idx];
      const d = document.createElement("div");
      d.className = "pcard" + (picks.includes(idx) ? " sel" : "");
      const n = picks.indexOf(idx);
      d.innerHTML = `
        <span class="tag">${roleOf(p)}</span>
        <div class="nm">${esc(p.name)}${p.ia ? " ⚡" : ""}</div>
        <div class="pr"><span>BAT ${p.batting}</span><span>BOWL ${p.bowling}</span></div>
        ${n >= 0 ? `<span class="num">#${n + 1}</span>` : ""}`;
      d.onclick = () => {
        const i = picks.indexOf(idx);
        if (i >= 0) picks.splice(i, 1);
        else if (picks.length < 11) picks.push(idx);
        else return toast("That's 11 — deselect someone first");
        renderSquad();
      };
      g.appendChild(d);
    });
    $("pick-n").textContent = picks.length;
    const team = picks.map(i => SQUADS[country][i]);
    const keeps = team.filter(p => p.keeper).length;
    const bowl = team.filter(p => p.bowling <= 5).length;
    let warn = "";
    if (picks.length === 11 && !keeps) warn = "You need a wicketkeeper (WK).";
    else if (picks.length === 11 && bowl < 5) warn = `Only ${bowl} real bowling options — a full innings needs 5.`;
    $("squad-warn").textContent = warn;
    $("squad-next").disabled = !(picks.length === 11 && keeps >= 1);
  }
  $("squad-next").onclick = () => {
    // sensible starting order: best batsmen at the top (player can still rearrange)
    const country = pcountry(my.role);
    order = picks.slice().sort((a, b) => SQUADS[country][b].batting - SQUADS[country][a].batting);
    renderOrder(); show("s-order");
  };
  $("order-back").onclick = () => { renderSquad(); show("s-squad"); };

  function renderOrder() {
    const country = pcountry(my.role);
    const l = $("order-list"); l.innerHTML = "";
    order.forEach((idx, pos) => {
      const p = SQUADS[country][idx];
      const row = document.createElement("div");
      row.className = "orow";
      row.innerHTML = `
        <span class="pos">${pos + 1}</span>
        <span class="nm">${esc(p.name)}${p.keeper ? " 🧤" : ""}${p.ia ? " ⚡" : ""}</span>
        <span class="pr">BAT ${p.batting} · BOWL ${p.bowling}</span>
        <span class="mv">
          <button ${pos === 0 ? "disabled" : ""} data-d="-1">▲</button>
          <button ${pos === order.length - 1 ? "disabled" : ""} data-d="1">▼</button>
        </span>`;
      row.querySelectorAll("button").forEach(b => b.onclick = () => {
        const d = +b.dataset.d, t = order[pos];
        order[pos] = order[pos + d]; order[pos + d] = t;
        renderOrder();
      });
      l.appendChild(row);
    });
  }
  $("order-confirm").onclick = async () => {
    loader(true, "LOCKING IN YOUR XI…");
    xiSubmitted = true; // set BEFORE the write: the SSE echo can beat the fetch
    try {
      await NET.setXI(my.code, my.role, order);
      setTurnColor(oppRole(my.role));
      route(); // never show() directly — the SSE echo may already have advanced us
    } catch (e) {
      xiSubmitted = false;
      toast("Couldn't save your XI — try again");
    }
    loader(false);
  };

  // ---------- stage refresh (post-match-build) ----------
  function refreshStage() {
    if (!match) return;
    if (match.stage === "toss") return renderToss();
    if (match.stage === "innings-break") return renderBreak();
    if (match.stage === "done") return renderResult();
    renderPlay(); // bowler | ball
  }

  // ---------- toss ----------
  function renderToss() {
    show("s-toss");
    const winner = match.tossWinner;
    setTurnColor(winner);
    if (!tossShown) {
      tossShown = true;
      $("toss-res").textContent = "…";
      $("toss-btns").style.display = "none"; $("toss-wait").style.display = "none";
      const coin = $("coin"); coin.style.animation = "none"; void coin.offsetWidth; coin.style.animation = "";
      setTimeout(() => {
        $("toss-res").textContent = `${pname(winner)} wins the toss!`;
        if (winner === my.role) $("toss-btns").style.display = "flex";
        else { $("toss-wait").style.display = "flex"; $("toss-wait").lastChild.textContent = ` waiting for ${pname(winner)}'s call…`; }
      }, 2300);
    } else {
      $("toss-res").textContent = `${pname(winner)} wins the toss!`;
      if (winner === my.role) $("toss-btns").style.display = "flex";
      else $("toss-wait").style.display = "flex";
    }
  }
  $("choose-bat").onclick = () => sendAction({ a: "choice", v: "bat" });
  $("choose-bowl").onclick = () => sendAction({ a: "choice", v: "bowl" });

  async function sendAction(act) {
    try { await NET.pushAction(my.code, act); }
    catch (e) { toast("Connection hiccup — try again"); }
  }

  // ---------- play screen ----------
  function fmtOvers(balls) { return Math.floor(balls / 6) + "." + (balls % 6); }

  function renderPlay() {
    show("s-play");
    const inn = match.cur, fmt = match.cfg.format;
    const batter = match.battingRole, fielder = match.fieldingRole;
    const iBat = batter === my.role;
    const turn = match.turn();
    setTurnColor(turn);

    // banner
    const tb = $("turn-banner");
    tb.style.background = turn === "p1" ? "var(--p1)" : "var(--p2)";
    if (match.stage === "ball") {
      $("turn-main").textContent = iBat ? "YOUR TURN — FACE THE BALL" : `${pname(batter).toUpperCase()} IS BATTING`;
      $("turn-sub").textContent = iBat ? "click when the button is charged" : "they click, you watch — pick your moment at the next over";
    } else { // bowler
      $("turn-main").textContent = fielder === my.role ? "YOUR CALL — PICK A BOWLER" : `${pname(fielder).toUpperCase()} IS SETTING THE FIELD`;
      $("turn-sub").textContent = fielder === my.role ? "who takes this over?" : "waiting for their bowling change…";
    }

    // score strip
    $("sc-team").textContent = `${flag(inn.team)} ${inn.team.toUpperCase()} — ${pname(batter).toUpperCase()}`;
    $("sc-score").textContent = `${inn.total}/${inn.wickets}`;
    $("sc-overs").innerHTML = `${fmtOvers(inn.ballsBowled)} <small>/ ${fmt.overs}</small>`;
    $("sc-rr").textContent = inn.ballsBowled ? (inn.total / (inn.ballsBowled / 6)).toFixed(2) : "—";
    const phase = phaseFor(inn.over + 1, fmt);
    $("sc-phase").textContent = phase.name.toUpperCase();
    const pp = $("phase-pill");
    pp.textContent = phase.name.toUpperCase();
    pp.className = "phase-pill" + (phase.name === "Powerplay" ? " pp" : phase.name === "Death" ? " death" : "");
    if (inn.target != null) {
      $("sc-target-cell").style.display = "flex";
      const need = inn.target - inn.total, ballsLeft = fmt.overs * 6 - inn.ballsBowled;
      $("sc-need").textContent = `${Math.max(0, need)} off ${ballsLeft}`;
    } else $("sc-target-cell").style.display = "none";

    // crease
    const st = inn.cards[inn.strikerIdx], pt = inn.nonStrikerIdx != null ? inn.cards[inn.nonStrikerIdx] : null;
    const bw = inn.bowlerSlot != null ? inn.bowlers[inn.bowlerSlot] : null;
    $("bs-name").textContent = st ? st.name : "—";
    $("bs-runs").textContent = st ? st.runs : 0; $("bs-balls").textContent = st ? st.balls : 0;
    if (st) {
      $("bs-cap").textContent = `${st.strikes}/${st.battingRating}`;
      $("bs-capbar").style.width = Math.min(100, st.strikes / st.battingRating * 100) + "%";
      if (bw) {
        const vs = st.byBowler[inn.bowlerSlot] || 0;
        const bar = Math.floor((st.battingRating + bw.bowling) / 2) + match.bonus;
        $("bs-vs").textContent = `${vs}/${bar}`;
        $("bs-vsbar").style.width = Math.min(100, vs / bar * 100) + "%";
      } else { $("bs-vs").textContent = "—"; $("bs-vsbar").style.width = "0%"; }
    }
    $("bp-name").textContent = pt ? pt.name : "—";
    $("bp-runs").textContent = pt ? pt.runs : "";
    $("bp-balls").textContent = pt ? pt.balls : "";
    if (pt) {
      $("bp-cap").textContent = `${pt.strikes}/${pt.battingRating}`;
      $("bp-capbar").style.width = Math.min(100, pt.strikes / pt.battingRating * 100) + "%";
    }
    $("bl-name").textContent = bw ? bw.name : "—";
    $("bl-fig").textContent = bw ? `${bw.type.toUpperCase()} · ${fmtOvers(bw.balls)} ov · ${bw.runs} r · ${bw.wickets} w` : "";

    renderFeed(inn);
    renderSituation(inn, fmt);
    renderFaceButton(iBat);
    renderBowlModal();
  }

  function renderFeed(inn) {
    const f = $("feed"); f.innerHTML = "";
    const evs = inn.events.slice(-40).reverse();
    for (const e of evs) {
      const d = document.createElement("div");
      d.className = "fitem" + (e.wicket ? " wicket" : "");
      let badge, btxt;
      if (e.wicket) { badge = "wkt"; btxt = "OUT"; }
      else if (e.runs >= 6) { badge = "runs6"; btxt = e.runs; }
      else if (e.runs >= 4) { badge = "runs4"; btxt = e.runs; }
      else if (e.strikes) { badge = "strike"; btxt = e.strikes + "×S"; }
      else if (e.runs) { badge = "dot"; btxt = e.runs; }
      else { badge = "dot"; btxt = "·"; }
      d.innerHTML = `
        <span class="ov">${e.over - 1}.${e.ballInOver}</span>
        <span class="tx">${esc(commentaryFor(e))}</span>
        <span class="badge ${badge}">${btxt}</span>`;
      f.appendChild(d);
    }
  }

  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  function commentaryFor(e) {
    const iv = e.intent === "att" ? "Going hard — " : e.intent === "def" ? "Playing it safe — " : "";
    if (e.wicket) {
      return e.outMethod === "cap"
        ? `OUT! ${e.striker} runs out of road — ${plural(e.totalStrikes, "total strike")}. ${e.strikerRuns === 0 ? "A duck!" : `Gone for ${e.strikerRuns}.`}`
        : `OUT! ${e.bowler} has worked ${e.striker} over — ${plural(e.bowlerStrikes, "strike")} of his own. WICKET!`;
    }
    if (e.compound === "first") return `${e.label}! First blow of a double — one more coming…`;
    if (e.compound === "second") return e.compoundToOther
      ? `${e.label} again! New over, new end — ${e.striker} banks the second one.`
      : `${e.label} again! ${e.striker} doubles up.`;
    if (e.runs >= 6) {
      const sixes = [`SIX! ${e.striker} goes all the way.`, `SIX! Clean off the middle from ${e.striker}.`, `SIX! ${e.striker} deposits it into the crowd.`, `SIX! No stopping that — huge from ${e.striker}.`];
      return iv + sixes[(e.over * 5 + e.ballInOver) % sixes.length];
    }
    if (e.runs >= 4) {
      const fours = [`FOUR! Crunched by ${e.striker}.`, `FOUR! ${e.striker} threads the gap.`, `FOUR! Nothing wrong with that from ${e.striker}.`, `FOUR! ${e.striker} finds the fence again.`];
      return iv + fours[(e.over * 3 + e.ballInOver) % fours.length] + (e.strikes ? " But a strike too…" : "");
    }
    if (e.strikes >= 2) return `${iv}big pressure — ${plural(e.strikes, "strike")} on ${e.striker} (${e.totalStrikes}/${e.capThreshold}).`;
    if (e.strikes === 1) return `${iv}beaten! A strike on ${e.striker} (${e.totalStrikes}/${e.capThreshold} total, ${e.bowlerStrikes} to ${e.bowler}).`;
    if (e.runs === 0) return `${iv}dot ball — good tight line.`;
    return `${iv}${e.runs === 1 ? "quick single" : e.runs + " runs"} for ${e.striker}.`;
  }

  function renderSituation(inn, fmt) {
    let txt;
    if (inn.target != null) {
      const need = inn.target - inn.total, balls = fmt.overs * 6 - inn.ballsBowled;
      const rrr = balls > 0 ? (need / (balls / 6)).toFixed(2) : "—";
      txt = need <= 0 ? "Scores level — the chase is done!" :
        `<b>${pname(inn.battingRole)}</b> need <b>${need}</b> from <b>${balls}</b> balls (req. rate ${rrr}). ` +
        (need < 12 ? "This is a sprint finish." : balls < 24 ? "Death overs — every ball a decision." : "Build the chase in pieces.");
    } else {
      txt = `<b>${pname(inn.battingRole)}</b> batting first — set a total worth defending. ` +
        (phaseFor(inn.over + 1, fmt).name === "Powerplay" ? "Powerplay: boundaries come cheaper." :
         phaseFor(inn.over + 1, fmt).name === "Death" ? "Death overs: swing hard." : "Middle overs: rotate and keep wickets.");
    }
    $("situation").innerHTML = txt;
  }

  // ---------- ATTACK / DEFEND buttons (shared charge) ----------
  function renderFaceButton(iBat) {
    const btn = $("face-btn"), db = $("def-btn");
    const myBall = match.stage === "ball" && iBat;
    if (!myBall) {
      stopCharge();
      btn.disabled = true; db.disabled = true; btn.classList.remove("ready");
      btn.style.setProperty("--chg", 0);
      $("face-label").textContent = match.stage === "ball" ? "WATCHING" : "OVER BREAK";
      $("face-sub").textContent = match.stage === "ball" ? `${pname(match.battingRole)} on strike` : "bowler being picked";
      $("await-line").textContent = "";
      $("action-cap").textContent = "NEXT BALL";
      return;
    }
    $("action-cap").textContent = "YOU'RE ON STRIKE — YOUR CALL";
    if (!chargeTimer && Date.now() >= chargedAt) armCharged();
    else if (!chargeTimer) startCharge();
  }
  function startCharge() {
    const btn = $("face-btn");
    btn.disabled = true; $("def-btn").disabled = true; btn.classList.remove("ready");
    $("face-label").textContent = "ATTACK";
    const t0 = Date.now();
    chargedAt = t0 + CHARGE_MS;
    (function tick() {
      const p = Math.min(1, (Date.now() - t0) / CHARGE_MS);
      btn.style.setProperty("--chg", p);
      $("face-sub").textContent = p < 1 ? "the bowler walks back…" : "";
      if (p < 1) chargeTimer = requestAnimationFrame(tick);
      else { chargeTimer = null; armCharged(); }
    })();
  }
  function armCharged() {
    const btn = $("face-btn");
    if (!(match && match.stage === "ball" && match.battingRole === my.role)) return;
    btn.style.setProperty("--chg", 1);
    btn.disabled = false; $("def-btn").disabled = false; btn.classList.add("ready");
    $("face-label").textContent = "ATTACK";
    $("face-sub").textContent = "…or defend it out";
  }
  function stopCharge() { if (chargeTimer) { cancelAnimationFrame(chargeTimer); chargeTimer = null; } }

  function faceBall(intent) {
    const btn = $("face-btn");
    btn.disabled = true; $("def-btn").disabled = true; btn.classList.remove("ready");
    $("face-label").textContent = "BOWLING…"; $("face-sub").textContent = "";
    chargedAt = Date.now() + 1e9; // re-armed after the delivery lands
    sendAction({ a: "ball", i: intent });
  }
  $("face-btn").onclick = () => faceBall("att");
  $("def-btn").onclick = () => faceBall("def");

  // ---------- bowler modal ----------
  function renderBowlModal() {
    const modal = $("bowl-modal");
    const mine = match.stage === "bowler" && match.fieldingRole === my.role;
    modal.classList.toggle("on", mine);
    if (!mine) return;
    const inn = match.cur;
    $("bowl-over").textContent = inn.over + 1;
    const list = $("bowl-list"); list.innerHTML = "";
    const legal = match.legalBowlers();
    // show legal bowlers, best (lowest rating) first
    legal.map(s => inn.bowlers[s]).sort((a, b) => a.bowling - b.bowling).forEach(b => {
      const d = document.createElement("button");
      d.className = "bowl-opt";
      d.innerHTML = `
        <span class="ty">${b.type.toUpperCase()}</span>
        <span class="nm">${esc(b.name)}</span>
        <span class="fig">RATING ${b.bowling} · ${b.overs}/${match.cfg.format.maxOvers} ov · ${b.runs} r · ${b.wickets} w</span>`;
      d.onclick = () => { modal.classList.remove("on"); sendAction({ a: "bowler", x: b.slot }); };
      list.appendChild(d);
    });
  }

  // ---------- delivery animation ----------
  const RUNUP_LINES = [
    "THE BOWLER TURNS AT THE TOP OF HIS MARK…",
    "FIELD SET. HERE HE COMES…",
    "IN HE RUNS, CROWD RISING…",
    "STEAMING IN FROM THE PAVILION END…"
  ];
  function animateDelivery(ev) {
    return new Promise(res => {
      const D = $("delivery");
      D.className = ""; // reset
      const line = ev.intent === "att" ? "THE BATTER WANTS BLOOD — HERE HE COMES…"
        : ev.intent === "def" ? "BAT STRAIGHT, SOFT HANDS — HERE HE COMES…"
        : RUNUP_LINES[(ev.over * 7 + ev.ballInOver) % RUNUP_LINES.length];
      $("dl-line").textContent = line;
      $("dl-d1").textContent = ev.pair[0]; $("dl-d2").textContent = ev.pair[1];
      const r = $("dl-result"), sub = $("dl-sub");
      let cls = "", txt, subtxt, shake = false, long = false;
      if (ev.wicket) {
        cls = "wkt"; txt = "OUT!"; shake = true; long = true;
        subtxt = ev.outMethod === "cap"
          ? `${ev.striker} — out by total strikes (${ev.totalStrikes}/${ev.capThreshold})`
          : `${ev.bowler} finally gets ${ev.striker} — ${plural(ev.bowlerStrikes, "strike")} of his own`;
      } else if (ev.runs >= 6) { cls = "six"; txt = ev.runs > 6 ? ev.runs + " RUNS!" : "SIX!"; subtxt = pick6(ev); shake = true; long = true; }
      else if (ev.runs >= 4) { cls = "four"; txt = ev.runs > 5 ? ev.runs + " RUNS!" : "FOUR!"; subtxt = `${ev.striker} finds the rope`; }
      else if (ev.strikes >= 2) { txt = ev.strikes + " STRIKES!"; subtxt = `${ev.striker} in real trouble now`; }
      else if (ev.strikes === 1) { txt = "STRIKE!"; subtxt = `beaten — ${ev.bowler} is building something here`; }
      else if (ev.runs > 0) { txt = ev.runs === 1 ? "1 RUN" : ev.runs + " RUNS"; subtxt = ev.intent === "def" ? "blocked out, safe" : ev.runs === 1 ? "pushed into the gap" : "placed and run hard"; }
      else { txt = "DOT BALL"; subtxt = ev.intent === "def" ? "dead-batted — pressure soaked" : "watchful — no run"; }
      if (ev.compound === "first") subtxt += " … and there's ANOTHER coming!";
      r.textContent = txt; r.className = "dl-result " + cls;
      sub.textContent = subtxt;

      D.classList.add("on", "running", "flying");
      if (ev.runs >= 6 && !ev.wicket) D.classList.add("hit-six");
      if (ev.runs >= 4 && ev.runs < 6 && !ev.wicket) D.classList.add("hit-four");
      let closed = false, revealed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        D.className = "";
        D.onclick = null;
        chargedAt = 0; // batter can start charging the next ball
        res();
      };
      setTimeout(() => {
        revealed = true;
        D.classList.add("reveal");
        if (ev.wicket) D.classList.add("smash");
        if (shake) D.classList.add("shake");
      }, 1650);
      // click-to-skip once the result is up — big moments linger, dots don't
      D.onclick = () => { if (revealed) close(); };
      setTimeout(close, long ? 3300 : 2350);
    });
  }
  function pick6(ev) {
    const lines = [`${ev.striker} launches it into the stands!`, `huge from ${ev.striker} — that's gone!`, `${ev.striker} pulls it for six!`];
    return lines[(ev.over + ev.ballInOver) % lines.length];
  }

  // ---------- innings break ----------
  function renderBreak() {
    show("s-break");
    const inn1 = match.innings[0];
    const chaser = match.battingRole; // pre-swapped at the break
    setTurnColor(chaser);
    $("break-score").textContent = `${inn1.total}/${inn1.wickets}`;
    $("break-kick").textContent = `${flag(inn1.team)} ${inn1.team} — first innings closed`;
    $("break-line").textContent = `${pname(chaser)} (${pcountry(chaser)}) need ${inn1.total + 1} to win.`;
    const mine = chaser === my.role;
    $("break-continue").style.display = mine ? "" : "none";
    $("break-wait").style.display = mine ? "none" : "flex";
    $("break-card").innerHTML = cardTable(inn1);
  }
  $("break-continue").onclick = () => sendAction({ a: "continue" });

  // ---------- result ----------
  function renderResult() {
    show("s-result"); setTurnColor(null);
    const r = match.result;
    $("res-title").textContent = r.winnerRole ? `${pname(r.winnerRole)} wins!` : "A TIE!";
    $("res-sub").textContent = r.winnerRole
      ? `${flag(pcountry(r.winnerRole))} ${pcountry(r.winnerRole)} take it by ${r.margin}${r.type === "chase" ? " with the chase" : ""}.`
      : "Scores dead level — you could not script it.";
    $("res-cards").innerHTML = match.innings.map(cardTable).join("<div style='height:18px'></div>");
    // keep watching: a rematch pointer may arrive from either player
  }
  $("rematch-btn").onclick = async () => {
    $("rematch-btn").disabled = true;
    $("rematch-wait").style.display = "flex";
    try { await NET.rematchRoom(my.code, doc); } // route() migrates both players
    catch (e) { toast("Couldn't set up the rematch"); $("rematch-btn").disabled = false; $("rematch-wait").style.display = "none"; }
  };

  function cardTable(inn) {
    const rows = inn.cards.map(c => {
      if (!c.balls && !c.out) return `<tr class="yet"><td>${esc(c.name)}</td><td colspan="4">did not bat</td><td class="num">—</td></tr>`;
      const how = c.out ? (c.outMethod === "cap" ? `out — ${c.strikes} total strikes` : `out — worked over by ${esc(c.outBowler)}`) : "not out";
      return `<tr${c.out ? ' class="outrow"' : ""}>
        <td><b>${esc(c.name)}</b>${c.duck ? " 🦆" : ""}</td><td>${how}</td>
        <td class="num">${c.runs}</td><td class="num">${c.balls}</td>
        <td class="num">${c.fours}/${c.sixes}</td>
        <td class="num">${c.balls ? Math.round(c.runs / c.balls * 100) : "—"}</td></tr>`;
    }).join("");
    const brows = inn.bowlers.filter(b => b.balls).map(b =>
      `<tr><td><b>${esc(b.name)}</b></td><td class="num">${fmtOvers(b.balls)}</td><td class="num">${b.maidens}</td>
       <td class="num">${b.runs}</td><td class="num">${b.wickets}</td></tr>`).join("");
    return `
      <div class="klabel" style="margin-bottom:8px">${flag(inn.team)} ${esc(inn.team)} — ${inn.total}/${inn.wickets} (${fmtOvers(inn.ballsBowled)} ov)</div>
      <div style="overflow-x:auto"><table class="ctable">
        <thead><tr><th>BATSMAN</th><th>HOW OUT</th><th class="num">R</th><th class="num">B</th><th class="num">4s/6s</th><th class="num">SR</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div style="height:12px"></div>
      <div style="overflow-x:auto"><table class="ctable">
        <thead><tr><th>BOWLER</th><th class="num">O</th><th class="num">M</th><th class="num">R</th><th class="num">W</th></tr></thead>
        <tbody>${brows}</tbody></table></div>`;
  }

  // ---------- boot: rejoin or prefill from URL ----------
  (function boot() {
    const params = new URLSearchParams(location.search);
    const saved = load();
    if (saved && saved.code) { my = saved; startWatching(); return; }
    if (params.get("room")) $("join-code").value = params.get("room").toUpperCase();
  })();
})();
