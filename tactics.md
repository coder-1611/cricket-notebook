# Cricket Notebook — Tactics & Match-Balance Design

This document explains the **real cricket tactics** modelled in the engine, how each
one is implemented, and the **run-economy balancing** that makes T20 and ODI scores
land in realistic ranges. Everything here is deterministic — the same seed + lineups
always reproduce the same match — so tactics are structural, not random.

The base dice table (in `resolveBall`) is left **exactly** as the rules spec. All
tactical and balance behaviour lives in clearly-separated layers on top of it:
bowler selection (`buildBowlingPlan`), a format survival knob (the `bonus` in
`dismissalInfo`), and a format scoring profile (`SCORING_PROFILES` + `applyProfile`).

---

## 1. Phase-based bowling (the core tactic)

Real limited-overs cricket splits an innings into three phases, each with a
different bowling plan. Captains do not just bowl their best bowler every over —
they **match bowler type to phase** and **husband their best bowlers' overs**.

| Phase | T20 overs | ODI overs | Preferred type | Why (real cricket) |
|-------|-----------|-----------|----------------|--------------------|
| **Powerplay** | 1–6 | 1–10 | **Pace** | Hard new ball swings and seams; fielding restrictions reward attacking pace up front. You open with your strike bowlers. |
| **Middle** | 7–15 | 11–40 | **Spin** | Once the ball softens and the field spreads, **spinners choke the run rate** and buy wickets through the air and off the pitch. This is the classic "spinners bowl the middle overs." |
| **Death** | 16–20 | 41–50 | **Pace** | Yorker-and-slower-ball specialists (your best quicks) return to defend at the end when batsmen swing hard. |

### Implementation — `buildBowlingPlan(fieldingLineup, format)`

Each over the engine scores every eligible bowler and picks the lowest score
(lower = more desirable):

```
score = bowling_rating * 2        // skill first — lower bowling rating is better
      + overs_already_bowled * 0.6 // spread the load, encourage rotation
      + (type !== phasePreferred ? 7 : 0)   // heavy nudge toward the phase's type
```

* **Keepers never bowl** (excluded from the pool) — as in real cricket.
* **No bowler bowls two overs in a row** (`idx !== prev`) — the laws forbid it.
* **Per-bowler over cap** is enforced from the format: **4 in T20, 10 in ODI**.
* The `type !== phasePreferred` penalty of `+7` is a *nudge, not a rule*: a rating‑2
  pace bowler (`2*2 = 4`) still beats a rating‑8 part-time spinner (`8*2 + 0 = 16`)
  in the middle overs. So when a side is **pace-heavy with only one frontline
  spinner** (e.g. Australia — only Warne), pace correctly keeps bowling the middle.
  When a side is **spin-rich** (India — Kumble, Jadeja + Tendulkar), the spinners
  dominate overs 7–15. The tactic emerges from the squad, exactly as in reality.

### Reserving overs for the death — quota management

A captain who bowls Bumrah out by over 12 has no strike bowler for the death. The
engine models this: the **two best pace bowlers are "death specialists"**, and
outside the death phase their effective cap is reduced by `deathReserve`
(**2 overs in T20, 4 in ODI**). So they can bowl up front, but the engine
guarantees they have overs banked for the end.

* T20: the top pacer bowls ~2 in the powerplay, returns for ~2 at the death — the
  real "2 up front, 2 at the death" split.
* ODI: the top pacer holds back 4 for overs 41–50.

If reservation + rotation + caps leave no legal bowler (rare, late in a spin-light
attack), a fallback picks the best available bowler under the hard cap.

### What you see in the UI

Every ball shows the bowler's **type (⚡ pace / 🌀 spin)** and a colour-coded
**phase chip** (Powerplay / Middle / Death), so the tactical shape of the innings
is visible ball by ball, and the scorecard's bowling figures reflect the plan.

---

## 2. Wicket tactics that already fall out of the rules

Two spec mechanics interact with bowling changes to reproduce real tactics:

* **Bring on a better bowler to break a partnership.** Because the dismissal
  threshold is the *live average* `floor((batting + current bowler) / 2)`, a set
  batsman sitting on safe strikes can fall the **instant a much better bowler comes
  on** — no new strike needed. This is the engine's version of a captain throwing
  the ball to his ace to remove a dangerous, set batsman.
* **Match-ups / protecting a total.** A lower-rated (better) bowler pulls every
  batsman's average down, so concentrating your best bowling into the phases that
  matter (powerplay wickets, death squeeze) directly buys more dismissals.

These are not extra code — they are consequences of the spec, surfaced by the
phase plan putting the right bowlers on at the right time.

---

## 3. Run economy — format scoring profiles

**Problem.** With the raw dice table, elite line-ups score ~245 in a T20 (≈12 runs
per over) — every set batsman flays boundaries. And because the per-ball mechanics
are identical in any format, a 50-over game is simply bowled out early (~290 all
out at over 37) rather than reaching a realistic 300/6.

**Real cricket resolves this by tempo:** T20 batsmen attack almost every ball; ODI
batsmen *build* — rotate strike, take fewer risks, and bat the full distance. We
model that with a **per-format scoring profile** applied *after* the pure dice
lookup (`applyProfile`), plus a **survival bonus** on the dismissal threshold.

### T20 profile — a light bowler-friendly trim

The two biggest boundary cells come down a notch; the showpiece hits stay.

| Roll (>5 bat) | Base | T20 | Note |
|---------------|------|-----|------|
| 4,6 | Two 4s (8) | **Four (4)** | biggest single-cell nerf |
| 2,6 | Double (2) | **Single (1)** | fewer easy twos |
| 1,6 (non-IA) | Four (4) | **Double (2)** | IA "two sixes" reward preserved |

Everything else — including 6,6 = two sixes (12) and 4,4 = two 4s (8) — is
untouched, so big overs still happen, just less relentlessly.

**Result:** T20 first innings **mean ≈ 204, ~6 wickets**, ~200 balls of range
150–250 — squarely in the requested **180–220** band.

### ODI profile — build an innings

Heavier boundary damping (target run rate ≈ 6/over) **plus** a survival bonus so a
side bats deep instead of being bowled out:

* **Boundary damping:** 4,6 → 2, 4,4 → 2, 6,6 → 6 (one six), 4,5 → 2, and several
  Doubles (2,6 / 2,4 / 2,2 / 1,2) → Singles. Big hits become rotation.
* **Survival bonus `+6`:** added to *both* dismissal thresholds
  (`cap = batting + 6`, `avg = floor((bat+bowl)/2) + 6`). ODI batsmen "set" and
  survive far longer, so innings last the full 50 overs.

**Result:** ODI first innings **mean ≈ 309, ~7 wickets, ~50 overs** at RR ≈ 6.2 —
the requested **"300/6 ish."**

### Why this is a clean design

* The **rules spec is never edited** — `resolveBall` still passes the full 84-case
  table test. Profiles are a labelled balance layer, easy to read and re-tune.
* **Determinism is preserved** — profiles are pure functions of the dice pair and
  the batsman's branch/IA, so replays from a seed are identical.
* **The IA identity survives** — `skipIA` guards protect the aggressive-batsman
  rewards (e.g. 1,6 two sixes) from being dampened away.

---

## 4. Verification

All of the above is covered by `node test.js`:

* the 84-case base dice table (profiles off) still matches the spec exactly;
* `applyProfile(null)` is the identity (spec purity);
* each profile overrides the intended cells (T20 4,6→4 with IA reward preserved;
  ODI 6,6→6, 2,2→1, 4,4→2; survival bonus raises the threshold);
* 300 seeds across **both formats**: never >10 wickets, never over the per-format
  over cap (4 / 10), chase results classified correctly.

Score distributions were tuned empirically over 400–500-seed sweeps (documented
means above), not eyeballed from a single match.
