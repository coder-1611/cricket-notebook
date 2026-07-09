# 🏏 Cricket Notebook — Dice Cricket Dashboard

Two-player dice cricket over a T20 format. Every ball rolls two dice; the outcome
is looked up in a fixed **Dice Table**, branching on the striker's batting rating
(`> 5`) and their **IA** ("Intent is Aggression") trait. Outcomes pay **runs** and/or
**strikes**; a batsman is dismissed the instant strikes reach either their **rating
cap** or the **live average** against the current bowler. Fully deterministic from a
seed + lineups.

## Run it

Just open `index.html` in a browser — no build, no dependencies.

```
open index.html
```

### Deep links
Replay any exact match with URL params:

```
index.html?seed=7&format=ODI&stadium=mumbai&auto=1&tab=worm
```

- `seed` – RNG seed (same seed + lineups → identical match)
- `format` – `T20` (20 overs) or `ODI` (50 overs)
- `stadium` – `delhi | mumbai | hyderabad | chennai | bengaluru | punjab`
- `auto=1` – simulate on load · `to=<n>` – jump to ball index n · `tab=feed|worm|card1|card2`

## Features
- **Two formats** — T20 (20 ov, mean ≈ 200) and ODI (50 ov, mean ≈ 300/6). See [tactics.md](tactics.md).
- **Real bowling tactics** — pace in the powerplay, spin through the middle overs, best pace held back for the death, 4/10-over caps, no back-to-back overs. Every ball shows the bowler type and phase.
- **Deterministic engine** — seeded dice, replayable matches, IA + rating branches.
- **Live playback** — play / pause / step ± / skip-innings, speed control.
- **Scoreboard** — striker & non-striker with dismissal-pressure strike meters, live chase math.
- **Ball-by-ball commentary** with dice, run/strike badges, and wicket calls.
- **Full scorecards** — R/B/strikes/4s/6s/SR, bowling figures, fall of wickets, ducks 🦆.
- **Run worm** — cumulative score per over, wicket markers, target line.
- **In-app Dice Table & rules** reference (rendered straight from the engine).

## Test the engine

```
node test.js
```

Asserts the full 84-case dice table (21 rolls × rating branch × IA), the dismissal
worked examples, and match integrity (≤10 wickets, ≤4 overs/bowler, chase logic) over
200 seeds.

## Files
| File | Purpose |
|------|---------|
| `engine.js` | Deterministic game engine (dice table, dismissal, match sim) |
| `teams.js`  | Lineups & stadiums (works in browser and Node) |
| `app.js`    | UI controller — playback, scorecards, worm chart |
| `index.html` / `styles.css` | Dashboard markup & broadcast-style theme |
| `test.js`   | Engine self-test harness |
