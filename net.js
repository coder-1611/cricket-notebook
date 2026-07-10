// ============================================================================
// Cricket Notebook — Firebase room sync for PLAY mode.
// Uses the flashcards Firebase RTDB over plain REST + SSE (no SDK, no keys),
// namespaced under /cricket-notebook so it never touches other apps' data.
//
// Room document:
//   /cricket-notebook/rooms/{CODE} = {
//     v: 1, created, seed, format: "T20"|"ODI",
//     players: { p1: {name, country}, p2: {name, country} },
//     xi:      { p1: [squadIdx x11 in batting order], p2: [...] },   // set once
//     actions: { <pushId>: {a,...} }   // push IDs sort chronologically
//   }
// Both clients replay (seed, xi) + ordered actions through the step engine,
// so no scores or outcomes ever travel over the wire.
// ============================================================================
(function (root) {
  const DB = "https://flashcards-3d896-default-rtdb.firebaseio.com/cricket-notebook";

  async function req(method, path, body) {
    const r = await fetch(`${DB}${path}.json`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`firebase ${method} ${path}: ${r.status}`);
    return r.json();
  }

  const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  function makeCode() {
    let c = "";
    for (let i = 0; i < 5; i++) c += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    return c;
  }

  async function createRoom({ name, country, format }) {
    const code = makeCode();
    const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    const doc = {
      v: 1, created: Date.now(), seed, format,
      players: { p1: { name, country } }
    };
    await req("PUT", `/rooms/${code}`, doc);
    return { code, role: "p1", doc };
  }

  async function joinRoom(code, { name }) {
    code = code.toUpperCase().trim();
    const doc = await req("GET", `/rooms/${code}`);
    if (!doc || !doc.players || !doc.players.p1) throw new Error("Room not found");
    if (doc.players.p2) throw new Error("Room is full");
    const country = doc.players.p1.country === "India" ? "Australia" : "India";
    await req("PUT", `/rooms/${code}/players/p2`, { name, country });
    doc.players.p2 = { name, country };
    return { code, role: "p2", doc };
  }

  function setXI(code, role, orderIdx) { return req("PUT", `/rooms/${code}/xi/${role}`, orderIdx); }
  function pushAction(code, action) { return req("POST", `/rooms/${code}/actions`, action); }

  // Rematch: clone players + XIs into a fresh room (new seed, no actions), then
  // point the old room at it — both clients see the pointer and migrate.
  async function rematchRoom(oldCode, oldDoc) {
    const code = makeCode();
    await req("PUT", `/rooms/${code}`, {
      v: 1, created: Date.now(), seed: (Math.random() * 0xFFFFFFFF) >>> 0,
      format: oldDoc.format, players: oldDoc.players, xi: oldDoc.xi, rematchOf: oldCode
    });
    await req("PUT", `/rooms/${oldCode}/rematch`, code);
    return code;
  }

  function sortedActions(doc) {
    if (!doc || !doc.actions) return [];
    return Object.keys(doc.actions).sort().map(k => doc.actions[k]); // push IDs are chronological
  }

  // Live subscription via SSE (Firebase REST streaming). onDoc(fullDoc) fires
  // on connect and after every change; falls back to 2s polling if SSE dies.
  function watchRoom(code, onDoc) {
    let doc = null, es = null, pollTimer = null, stopped = false;

    function applyPatch(path, data) {
      if (path === "/") { doc = data; return; }
      const keys = path.replace(/^\//, "").split("/");
      doc = doc || {};
      let node = doc;
      for (let i = 0; i < keys.length - 1; i++) {
        if (typeof node[keys[i]] !== "object" || node[keys[i]] === null) node[keys[i]] = {};
        node = node[keys[i]];
      }
      const last = keys[keys.length - 1];
      if (data === null) delete node[last];
      else node[last] = data;
    }

    function startSSE() {
      es = new EventSource(`${DB}/rooms/${code}.json`);
      const handle = e => {
        let msg;
        try { msg = JSON.parse(e.data); } catch (err) { return; } // keep-alive frames
        if (!msg || typeof msg !== "object") return;
        applyPatch(msg.path, msg.data);
        onDoc(doc); // let app errors surface — never swallow them here
      };
      es.addEventListener("put", handle);
      es.addEventListener("patch", handle);
      es.onerror = () => {
        es.close();
        if (!stopped && !pollTimer) startPolling(); // degrade gracefully
      };
    }

    function startPolling() {
      pollTimer = setInterval(async () => {
        try { doc = await req("GET", `/rooms/${code}`); onDoc(doc); } catch (e) {}
      }, 2000);
    }

    startSSE();
    return { stop() { stopped = true; if (es) es.close(); if (pollTimer) clearInterval(pollTimer); } };
  }

  const api = { createRoom, joinRoom, setXI, pushAction, sortedActions, watchRoom, rematchRoom };
  if (typeof window !== "undefined") root.NET = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
