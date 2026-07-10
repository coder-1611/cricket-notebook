// ============================================================================
// Cricket Notebook — PLAY mode squads.
// 50 best Indian + 50 best Australian players of all time, rated on the same
// scale as teams.js: batting 1-10 (higher = better), bowling 1-10 (LOWER =
// better), ia = "Intent is Aggression", type pace|spin, keeper flag.
// Each match draws a balanced 25-man squad from the 50 (seeded), and each
// player picks their XI from that squad.
// ============================================================================

const SQUADS = {
  India: [
    // --- top-order / middle-order batsmen ---
    { name: "Sachin Tendulkar",     batting: 10, bowling: 7,  ia: false, type: "spin" },
    { name: "Virat Kohli",          batting: 10, bowling: 9,  ia: false, type: "pace" },
    { name: "Sunil Gavaskar",       batting: 9,  bowling: 10, ia: false, type: "pace" },
    { name: "Rahul Dravid",         batting: 9,  bowling: 10, ia: false, type: "pace" },
    { name: "Rohit Sharma",         batting: 9,  bowling: 9,  ia: true,  type: "spin" },
    { name: "Virender Sehwag",      batting: 9,  bowling: 8,  ia: true,  type: "spin" },
    { name: "Sourav Ganguly",       batting: 8,  bowling: 8,  ia: false, type: "pace" },
    { name: "VVS Laxman",           batting: 8,  bowling: 10, ia: false, type: "spin" },
    { name: "Yuvraj Singh",         batting: 8,  bowling: 7,  ia: true,  type: "spin" },
    { name: "Shubman Gill",         batting: 8,  bowling: 10, ia: false, type: "pace" },
    { name: "Mohammad Azharuddin",  batting: 8,  bowling: 9,  ia: false, type: "spin" },
    { name: "Vaibhav Suryavanshi",  batting: 8,  bowling: 9,  ia: true,  type: "spin" },
    { name: "Gundappa Viswanath",   batting: 8,  bowling: 10, ia: false, type: "spin" },
    { name: "Yashasvi Jaiswal",     batting: 8,  bowling: 10, ia: true,  type: "spin" },
    { name: "Suryakumar Yadav",     batting: 8,  bowling: 10, ia: true,  type: "spin" },
    { name: "Cheteshwar Pujara",    batting: 7,  bowling: 10, ia: false, type: "spin" },
    { name: "Dilip Vengsarkar",     batting: 7,  bowling: 10, ia: false, type: "pace" },
    { name: "Navjot Singh Sidhu",   batting: 7,  bowling: 10, ia: true,  type: "spin" },
    { name: "Shikhar Dhawan",       batting: 7,  bowling: 10, ia: true,  type: "spin" },
    { name: "Ajinkya Rahane",       batting: 7,  bowling: 10, ia: false, type: "spin" },
    { name: "Suresh Raina",         batting: 7,  bowling: 8,  ia: true,  type: "spin" },
    // --- keepers ---
    { name: "MS Dhoni",             batting: 8,  bowling: 10, ia: false, type: "pace", keeper: true },
    { name: "Rishabh Pant",         batting: 8,  bowling: 10, ia: true,  type: "pace", keeper: true },
    { name: "KL Rahul",             batting: 8,  bowling: 10, ia: false, type: "pace", keeper: true },
    { name: "Syed Kirmani",         batting: 5,  bowling: 10, ia: false, type: "pace", keeper: true },
    // --- all-rounders ---
    { name: "Kapil Dev",            batting: 7,  bowling: 3,  ia: true,  type: "pace" },
    { name: "Ravindra Jadeja",      batting: 6,  bowling: 3,  ia: true,  type: "spin" },
    { name: "Vinoo Mankad",         batting: 6,  bowling: 4,  ia: false, type: "spin" },
    { name: "Salim Durani",         batting: 6,  bowling: 5,  ia: true,  type: "spin" },
    { name: "Hardik Pandya",        batting: 6,  bowling: 5,  ia: true,  type: "pace" },
    { name: "Mohinder Amarnath",    batting: 7,  bowling: 6,  ia: false, type: "pace" },
    { name: "Irfan Pathan",         batting: 5,  bowling: 4,  ia: false, type: "pace" },
    { name: "Ravichandran Ashwin",  batting: 5,  bowling: 2,  ia: false, type: "spin" },
    { name: "Manoj Prabhakar",      batting: 5,  bowling: 5,  ia: false, type: "pace" },
    { name: "Ajit Agarkar",         batting: 4,  bowling: 5,  ia: true,  type: "pace" },
    // --- bowlers ---
    { name: "Jasprit Bumrah",       batting: 2,  bowling: 1,  ia: false, type: "pace" },
    { name: "Anil Kumble",          batting: 3,  bowling: 2,  ia: false, type: "spin" },
    { name: "Bishan Singh Bedi",    batting: 2,  bowling: 2,  ia: false, type: "spin" },
    { name: "BS Chandrasekhar",     batting: 1,  bowling: 2,  ia: false, type: "spin" },
    { name: "Zaheer Khan",          batting: 3,  bowling: 3,  ia: false, type: "pace" },
    { name: "Erapalli Prasanna",    batting: 2,  bowling: 3,  ia: false, type: "spin" },
    { name: "Harbhajan Singh",      batting: 3,  bowling: 3,  ia: true,  type: "spin" },
    { name: "Mohammed Shami",       batting: 2,  bowling: 3,  ia: false, type: "pace" },
    { name: "Kuldeep Yadav",        batting: 2,  bowling: 3,  ia: false, type: "spin" },
    { name: "Javagal Srinath",      batting: 3,  bowling: 4,  ia: false, type: "pace" },
    { name: "Bhuvneshwar Kumar",    batting: 3,  bowling: 4,  ia: false, type: "pace" },
    { name: "Mohammed Siraj",       batting: 2,  bowling: 4,  ia: false, type: "pace" },
    { name: "Yuzvendra Chahal",     batting: 1,  bowling: 4,  ia: false, type: "spin" },
    { name: "Umesh Yadav",          batting: 2,  bowling: 5,  ia: false, type: "pace" },
    { name: "Ishant Sharma",        batting: 1,  bowling: 5,  ia: false, type: "pace" }
  ],

  Australia: [
    // --- top-order / middle-order batsmen ---
    { name: "Don Bradman",          batting: 10, bowling: 9,  ia: false, type: "spin" },
    { name: "Ricky Ponting",        batting: 10, bowling: 9,  ia: false, type: "pace" },
    { name: "Steve Smith",          batting: 10, bowling: 9,  ia: false, type: "spin" },
    { name: "Greg Chappell",        batting: 9,  bowling: 8,  ia: false, type: "pace" },
    { name: "Matthew Hayden",       batting: 9,  bowling: 10, ia: false, type: "pace" },
    { name: "David Warner",         batting: 9,  bowling: 10, ia: true,  type: "spin" },
    { name: "Allan Border",         batting: 8,  bowling: 8,  ia: false, type: "spin" },
    { name: "Steve Waugh",          batting: 8,  bowling: 7,  ia: false, type: "pace" },
    { name: "Mark Waugh",           batting: 8,  bowling: 8,  ia: false, type: "spin" },
    { name: "Michael Clarke",       batting: 8,  bowling: 7,  ia: false, type: "spin" },
    { name: "Justin Langer",        batting: 8,  bowling: 10, ia: false, type: "pace" },
    { name: "Ian Chappell",         batting: 8,  bowling: 9,  ia: false, type: "spin" },
    { name: "Michael Hussey",       batting: 8,  bowling: 10, ia: false, type: "pace" },
    { name: "David Boon",           batting: 8,  bowling: 10, ia: false, type: "pace" },
    { name: "Damien Martyn",        batting: 8,  bowling: 10, ia: false, type: "pace" },
    { name: "Marnus Labuschagne",   batting: 8,  bowling: 9,  ia: false, type: "spin" },
    { name: "Travis Head",          batting: 8,  bowling: 9,  ia: true,  type: "spin" },
    { name: "Mark Taylor",          batting: 7,  bowling: 10, ia: false, type: "pace" },
    { name: "Michael Slater",       batting: 7,  bowling: 10, ia: true,  type: "pace" },
    { name: "Michael Bevan",        batting: 7,  bowling: 8,  ia: false, type: "spin" },
    { name: "Usman Khawaja",        batting: 7,  bowling: 10, ia: false, type: "pace" },
    { name: "Aaron Finch",          batting: 7,  bowling: 10, ia: true,  type: "spin" },
    { name: "Simon Katich",         batting: 7,  bowling: 9,  ia: false, type: "spin" },
    // --- keepers ---
    { name: "Adam Gilchrist",       batting: 8,  bowling: 10, ia: true,  type: "pace", keeper: true },
    { name: "Ian Healy",            batting: 6,  bowling: 10, ia: false, type: "pace", keeper: true },
    { name: "Alex Carey",           batting: 6,  bowling: 10, ia: false, type: "pace", keeper: true },
    { name: "Tim Paine",            batting: 5,  bowling: 10, ia: false, type: "pace", keeper: true },
    // --- all-rounders ---
    { name: "Keith Miller",         batting: 8,  bowling: 3,  ia: true,  type: "pace" },
    { name: "Andrew Symonds",       batting: 7,  bowling: 6,  ia: true,  type: "spin" },
    { name: "Shane Watson",         batting: 7,  bowling: 5,  ia: true,  type: "pace" },
    { name: "Glenn Maxwell",        batting: 7,  bowling: 6,  ia: true,  type: "spin" },
    { name: "Mitchell Marsh",       batting: 7,  bowling: 5,  ia: true,  type: "pace" },
    { name: "Richie Benaud",        batting: 5,  bowling: 3,  ia: false, type: "spin" },
    { name: "Ray Lindwall",         batting: 5,  bowling: 3,  ia: false, type: "pace" },
    { name: "Alan Davidson",        batting: 5,  bowling: 3,  ia: false, type: "pace" },
    { name: "Mitchell Johnson",     batting: 4,  bowling: 2,  ia: true,  type: "pace" },
    // --- bowlers ---
    { name: "Shane Warne",          batting: 4,  bowling: 1,  ia: false, type: "spin" },
    { name: "Glenn McGrath",        batting: 2,  bowling: 1,  ia: false, type: "pace" },
    { name: "Dennis Lillee",        batting: 3,  bowling: 2,  ia: false, type: "pace" },
    { name: "Pat Cummins",          batting: 4,  bowling: 2,  ia: false, type: "pace" },
    { name: "Mitchell Starc",       batting: 3,  bowling: 2,  ia: false, type: "pace" },
    { name: "Brett Lee",            batting: 3,  bowling: 2,  ia: false, type: "pace" },
    { name: "Jeff Thomson",         batting: 2,  bowling: 2,  ia: false, type: "pace" },
    { name: "Josh Hazlewood",       batting: 1,  bowling: 2,  ia: false, type: "pace" },
    { name: "Nathan Lyon",          batting: 2,  bowling: 3,  ia: false, type: "spin" },
    { name: "Jason Gillespie",      batting: 2,  bowling: 3,  ia: false, type: "pace" },
    { name: "Craig McDermott",      batting: 2,  bowling: 3,  ia: false, type: "pace" },
    { name: "Stuart MacGill",       batting: 1,  bowling: 3,  ia: false, type: "spin" },
    { name: "Merv Hughes",          batting: 3,  bowling: 4,  ia: true,  type: "pace" },
    { name: "Shaun Tait",           batting: 1,  bowling: 3,  ia: false, type: "pace" }
  ]
};

// Role tag for the selection UI (derived, not stored).
function roleOf(p) {
  if (p.keeper) return "WK";
  if (p.bowling <= 5 && p.batting >= 5) return "AR";           // all-rounder
  if (p.bowling <= 5) return p.type === "spin" ? "SPIN" : "PACE";
  return "BAT";
}

// Draw a balanced 25-man squad from a country's 50 using a seeded RNG stream.
// Guarantees: >=2 keepers, >=3 spin + >=4 pace frontline bowlers (bowling<=4),
// >=10 batsmen rated >=7 — so any drawn squad can field a proper XI.
function drawSquad(countryPool, rngFn, size) {
  size = size || 25;
  const idx = countryPool.map((_, i) => i);
  // seeded shuffle
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rngFn() * (i + 1));
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }
  const isK = i => !!countryPool[i].keeper;
  const isSpin = i => countryPool[i].bowling <= 4 && countryPool[i].type === "spin";
  const isPace = i => countryPool[i].bowling <= 4 && countryPool[i].type === "pace";
  const isBat = i => countryPool[i].batting >= 7;

  const picked = [];
  const need = [[isK, 2], [isSpin, 3], [isPace, 4], [isBat, 10]];
  for (const [test, n] of need) {
    for (const i of idx) {
      if (picked.length && picked.includes(i)) continue;
      if (picked.filter(test).length >= n) break;
      if (test(i) && !picked.includes(i)) picked.push(i);
    }
  }
  for (const i of idx) { // fill the rest in shuffle order
    if (picked.length >= size) break;
    if (!picked.includes(i)) picked.push(i);
  }
  return picked.slice(0, size).sort((a, b) => a - b);
}

if (typeof window !== "undefined") { window.SQUADS = SQUADS; window.drawSquad = drawSquad; window.roleOf = roleOf; }
if (typeof module !== "undefined") { module.exports = { SQUADS, drawSquad, roleOf }; }
