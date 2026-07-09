// Player ratings and lineups. Batting: higher = better (1-10). Bowling: lower = better (1-10).
// ia = "Intent is Aggression" fixed trait. keeper/captain are cosmetic flavor.
const TEAMS = {
  India: {
    name: "India",
    short: "IND",
    lineup: [
      { name: "Sunil Gavaskar",      batting: 9,  bowling: 10, ia: false, type: "pace" },
      { name: "Vaibhav Suryavanshi", batting: 8,  bowling: 9,  ia: true,  type: "spin" },
      { name: "Sachin Tendulkar",    batting: 10, bowling: 7,  ia: false, type: "spin" },
      { name: "Virat Kohli",         batting: 10, bowling: 9,  ia: false, type: "pace" },
      { name: "Rahul Dravid",        batting: 9,  bowling: 10, ia: false, type: "pace" },
      { name: "MS Dhoni",            batting: 8,  bowling: 10, ia: false, type: "pace", keeper: true, captain: true },
      { name: "Kapil Dev",           batting: 7,  bowling: 3,  ia: true,  type: "pace" },
      { name: "Ravindra Jadeja",     batting: 6,  bowling: 3,  ia: true,  type: "spin" },
      { name: "Anil Kumble",         batting: 3,  bowling: 2,  ia: false, type: "spin" },
      { name: "Zaheer Khan",         batting: 3,  bowling: 3,  ia: false, type: "pace" },
      { name: "Jasprit Bumrah",      batting: 2,  bowling: 1,  ia: false, type: "pace" }
    ]
  },
  Australia: {
    name: "Australia",
    short: "AUS",
    lineup: [
      { name: "Matthew Hayden",  batting: 9,  bowling: 10, ia: false, type: "pace" },
      { name: "David Warner",    batting: 9,  bowling: 10, ia: true,  type: "spin" },
      { name: "Don Bradman",     batting: 10, bowling: 9,  ia: false, type: "spin" },
      { name: "Ricky Ponting",   batting: 10, bowling: 9,  ia: false, type: "pace", captain: true },
      { name: "Steve Smith",     batting: 10, bowling: 9,  ia: false, type: "spin" },
      { name: "Allan Border",    batting: 8,  bowling: 8,  ia: false, type: "spin" },
      { name: "Adam Gilchrist",  batting: 8,  bowling: 10, ia: true,  type: "pace", keeper: true },
      { name: "Shane Warne",     batting: 4,  bowling: 1,  ia: false, type: "spin" },
      { name: "Dennis Lillee",   batting: 3,  bowling: 2,  ia: false, type: "pace" },
      { name: "Glenn McGrath",   batting: 2,  bowling: 1,  ia: false, type: "pace" },
      { name: "Brett Lee",       batting: 3,  bowling: 2,  ia: false, type: "pace" }
    ]
  }
};

// Match formats. Phases drive bowler selection; deathReserve = overs each of the
// two frontline pace bowlers holds back for the death (see engine buildBowlingPlan).
const FORMATS = {
  T20: {
    key: "T20", label: "T20 — 20 overs", overs: 20, maxOvers: 4, deathReserve: 2,
    phases: [
      { name: "Powerplay", to: 6,  prefer: "pace" },
      { name: "Middle",    to: 15, prefer: "spin" },
      { name: "Death",     to: 20, prefer: "pace" }
    ]
  },
  ODI: {
    key: "ODI", label: "ODI — 50 overs", overs: 50, maxOvers: 10, deathReserve: 4,
    phases: [
      { name: "Powerplay", to: 10, prefer: "pace" },
      { name: "Middle",    to: 40, prefer: "spin" },
      { name: "Death",     to: 50, prefer: "pace" }
    ]
  }
};

const STADIUMS = [
  { id: "delhi",     name: "Arun Jaitley Stadium",     city: "Delhi" },
  { id: "mumbai",    name: "Wankhede Stadium",         city: "Mumbai" },
  { id: "hyderabad", name: "Rajiv Gandhi Stadium",     city: "Hyderabad" },
  { id: "chennai",   name: "MA Chidambaram (Chepauk)", city: "Chennai" },
  { id: "bengaluru", name: "M. Chinnaswamy Stadium",   city: "Bengaluru" },
  { id: "punjab",    name: "HPCA Stadium",             city: "Dharamshala" }
];

// Work in both the browser (globals for app.js) and Node (require for test.js).
if (typeof window !== "undefined") { window.TEAMS = TEAMS; window.STADIUMS = STADIUMS; window.FORMATS = FORMATS; }
if (typeof module !== "undefined") { module.exports = { TEAMS, STADIUMS, FORMATS, India: TEAMS.India, Australia: TEAMS.Australia }; }
