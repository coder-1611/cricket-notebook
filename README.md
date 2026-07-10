# 🏏 Cricket Notebook — Dice Cricket

Dice cricket in T20 and ODI formats, two ways:

- **`index.html`** — landing page: choose **Play** or **Simulate**.
- **`play.html`** — **PLAY mode**: two players on two devices, linked live through
  a Firebase room code. Each picks their XI from a 25-man squad (drawn from 50
  all-time greats per country in `squads.js`), sets a batting order, chooses the
  bowler every over, and the batter faces every ball with a charged click — with
  a full bowler-run-up delivery animation per ball. The whole screen is framed
  in gold (P1) or blue (P2) so it's always obvious whose turn it is.
- **`sim.html`** — **SIM mode**: the original auto-play dashboard (below).

## Sim mode

Two-player dice cricket in T20 and ODI formats. Every ball rolls two dice; the
outcome is looked up in a fixed **Dice Table**, branching on the striker's batting
rating (`> 5`) and their **IA** ("Intent is Aggression") trait. Outcomes pay
**runs** and/or **strikes**; every strike counts twice — on the batsman's
**running total** and on the **tally of the bowler who bowled it**. He's out when
the total reaches his **rating cap** (own rating — the universal ceiling) *or* when
any one bowler's own tally reaches the **live average** `⌊(batting + that bowler's
rating)/2⌋`. Fully deterministic from a seed + lineups — but the
seed is drawn at random by default — leave the **Seed** field blank — or type a seed (or hit 🎲) to pick/replay a specific match; **Replay** re-runs the last one.

## Run it

Just open `index.html` in a browser — no build, no dependencies. (PLAY mode
needs to be served over http(s) for the Firebase sync — any static host works.)

```
open index.html
```

## PLAY mode internals

- **Sync**: Firebase RTDB over plain REST + SSE (`net.js`), namespaced under
  `/cricket-notebook` on the shared flashcards database — no SDK, no keys.
- **Determinism**: the room doc holds `(seed, XIs, action log)`; both clients
  replay the actions through the step engine (`playengine.js`), so no scores
  ever travel over the wire and refresh/rejoin just replays.
- **Actions**: toss call → per-over bowler picks (fielding player) → one
  `{a:"ball"}` per delivery (batting player's charged click).

### Deep links (for replay / testing / sharing)

```
index.html?seed=7&format=ODI&stadium=mumbai&auto=1&tab=worm
```

- `seed` – force a specific RNG seed (same seed + lineups → identical match)
- `format` – `T20` (20 overs) or `ODI` (50 overs)
- `stadium` – `delhi | mumbai | hyderabad | chennai | bengaluru | punjab`
- `auto=1` – simulate on load · `to=<n>` – jump to ball index n · `tab=feed|worm|card1|card2`

## Features
- **Two formats** — T20 (20 ov, mean ≈ 196/5) and ODI (50 ov, mean ≈ 287/6 with a
  ~3.2:1 four:six ratio). See [tactics.md](tactics.md).
- **Real bowling tactics** — pace in the powerplay, spin through the middle overs,
  best pace held back for the death, 4/10-over caps, no back-to-back overs. Every
  ball shows the bowler type and phase chip.
- **Powerplay & death run boost** — a U-shaped tempo curve (fast start, middle
  consolidation, death surge) in both formats.
- **Two ways out** — the **total-strikes cap** = the batsman's exact rating (the
  universal ceiling and primary dismissal), plus the **per-bowler live average**
  (each bowler works a batsman over with their *own* strike tally; no walk-off).
- **Compound hits across two balls** — a "two sixes" / "two fours" plays out over
  two deliveries; on an over's last ball the second goes to the other batsman.
- **Seeds** — random by default (leave the **Seed** field blank; 🎲 rolls one),
  or type/​link a seed to pick or replay a specific match; **Replay** re-runs the
  last one.
- **Live playback** — play / pause / step ± / skip-innings, speed control.
- **Scoreboard** — striker & non-striker with dismissal-pressure strike meters, live chase math.
- **Ball-by-ball commentary** with dice, run/strike badges, and wicket calls —
  including "out by total strikes" (the rating-cap dismissal).
- **Full scorecards** — R/B/strikes/4s/6s/SR, running Total bar, bowling figures,
  fall of wickets, ducks 🦆 — all updating per delivery.
- **Run worm** — cumulative score per over, wicket markers, target line, drawn progressively.
- **In-app Dice Table & rules** reference (rendered straight from the engine).

## Test the engine

```
node test.js
```

Asserts the full 84-case dice table (21 rolls × rating branch × IA), the format
scoring profiles and powerplay/death boost layer, the dismissal worked examples
(including the total-strikes cap tie-break), and match integrity (≤10 wickets,
per-format over caps, chase logic) over 300 seeds across both formats.

## Files
| File | Purpose |
|------|---------|
| `engine.js` | Deterministic game engine (dice table, profiles, tactics, match sim) |
| `teams.js`  | Lineups, stadiums & formats (works in browser and Node) |
| `app.js`    | UI controller — playback, scorecards, worm chart |
| `index.html` / `styles.css` | Dashboard markup & theme |
| `tactics.md` | Tactics & match-balance design doc |
| `test.js`   | Engine self-test harness |
