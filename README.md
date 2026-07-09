# 🏏 Cricket Notebook — Dice Cricket Dashboard

Two-player dice cricket in T20 and ODI formats. Every ball rolls two dice; the
outcome is looked up in a fixed **Dice Table**, branching on the striker's batting
rating (`> 5`) and their **IA** ("Intent is Aggression") trait. Outcomes pay
**runs** and/or **strikes**; a batsman is dismissed the instant strikes reach
either their **rating cap** (total strikes = own rating) or the **live average**
against the current bowler. Fully deterministic from a seed + lineups — but the
seed is always drawn at random; use **Replay** to re-run the exact same match.

## Run it

Just open `index.html` in a browser — no build, no dependencies.

```
open index.html
```

### Replay / testing deep links (hidden, not part of the UI)

```
index.html?seed=7&format=ODI&stadium=mumbai&auto=1&tab=worm
```

- `seed` – force a specific RNG seed (same seed + lineups → identical match)
- `format` – `T20` (20 overs) or `ODI` (50 overs)
- `stadium` – `delhi | mumbai | hyderabad | chennai | bengaluru | punjab`
- `auto=1` – simulate on load · `to=<n>` – jump to ball index n · `tab=feed|worm|card1|card2`

## Features
- **Two formats** — T20 (20 ov, mean ≈ 213) and ODI (50 ov, mean ≈ 302 with a
  ~3.5:1 four:six ratio). See [tactics.md](tactics.md).
- **Real bowling tactics** — pace in the powerplay, spin through the middle overs,
  best pace held back for the death, 4/10-over caps, no back-to-back overs. Every
  ball shows the bowler type and phase chip.
- **Powerplay & death run boost** — a U-shaped tempo curve (fast start, middle
  consolidation, death surge) in both formats.
- **Random seeds** — every Simulate is a fresh match (`Match #<id>` shown in the
  result); **Replay** re-runs the identical match.
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
