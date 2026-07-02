// src/core/constants.js
// ALL tuning numbers live here. Agents: never hardcode magic numbers in logic
// files. The balance-analyst agent edits ONLY this file.

export const C = {
  // game structure
  INNINGS: 3,
  TICKS_PER_SEC: 60,

  // pitch cycle (ticks)
  WINDUP_TICKS: 60,
  RESOLVE_TICKS: 45,          // balls / strikes / fouls
  RESOLVE_TICKS_HIT: 85,      // contact — long enough to watch the ball fly

  // Pitch flight: slower and floatier than real baseball, on purpose.
  // flightTicks = mound->plate time. breakAmt drives the lateral banana curve.
  // wobble = ectoplasmic sine drift. gravMult scales gravity (ectoplasm floats).
  PITCH_TYPES: {
    fastball:  { flightTicks: 52, breakAmt: 0.10, wobble: 0,   gravMult: 0.6,  strikeProb: 0.62 },
    curve:     { flightTicks: 66, breakAmt: 0.75, wobble: 0,   gravMult: 1.25, strikeProb: 0.55 },
    ectoball:  { flightTicks: 82, breakAmt: 0.45, wobble: 1.0, gravMult: 0.5,  strikeProb: 0.48 }, // wobbling ectoplasm
  },

  // pitch flight physics (world units, seconds via TICKS_PER_SEC)
  PITCH: {
    RELEASE_X: 0.8,           // pitcher releases slightly off centerline
    RELEASE_Y: 4.6,           // release height
    GRAVITY: 13,              // units/s^2 — lofi gravity, scaled by gravMult
    BREAK_SCALE: 3.4,         // world units of lateral drift per unit breakAmt
    WOBBLE_AMP: 0.9,          // ectoball wobble amplitude
    WOBBLE_FREQ: 2.5,         // wobble cycles over the flight
    DRIFT_EASE: 0.30,         // z eases: leaves the hand hot, floats in (drag illusion)
    FLIGHT_JITTER: 0.12,      // +/- fraction of flightTicks variance per pitch
  },

  // player pitching (two-click meter feeds power + accuracy into the plan)
  PLAYER_PITCH: {
    POWER_FLIGHT_MIN: 0.90,   // full power: flightTicks scaled down to this
    POWER_FLIGHT_MAX: 1.16,   // no power: a slow lob
    ACCURACY_SCATTER: 2.6,    // world units of max target scatter at accuracy 0
    METER_TICKS: 55,          // needle sweep duration per pass (renderer uses this)
  },

  // core CPU batter (bats against the player's pitching; also drives the harness)
  CPU_BATTER: {
    TAKE_BALL_PROB: 0.5,      // lays off balls this often
    SWING_ANY_PROB: 0.08,     // sometimes chases junk
    TIMING_ERR: 0.155,        // gaussian timing error scale (x sloppiness)
    AIM_ERR: 0.98,            // gaussian aim error scale (x sloppiness)
  },

  // strike zone at the plate (world units, x centered on plate, y up)
  ZONE: { HALF_W: 1.7, BOT: 1.5, TOP: 4.3 },
  MISS_MARGIN: 1.2,           // balls target up to this far outside a zone edge

  // swing types: tap for contact, commit for power, deaden it for the bunt
  SWING_TYPES: {
    contact: { windowMult: 1.0,  hitMult: 1.0 },
    power:   { windowMult: 0.68, hitMult: 1.22 }, // big cut, needle timing
    bunt:    { windowMult: 1.8,  hitMult: 0 },    // resolves as a sacrifice play
  },

  // batting
  CONTACT_POINT: 0.88,        // ball flight t where perfect contact happens
  TIMING_WINDOW: 0.14,        // +/- t tolerance scaled by batter contact stat
  BAT_REACH: 2.1,             // sweet-spot radius around the aim point, scaled by contact
  SPATIAL_FLOOR: 0.40,        // aim quality blends up from this floor — timing stays king
  FOUL_THRESHOLD: 0.45,       // contact quality below this (but above whiff) = foul
  WHIFF_THRESHOLD: 0.25,      // contact quality below this = swinging strike

  // baserunning: fast mutants stretch for extra bases and steal
  RUN: {
    EXTRA_BASE_PROB: 0.55,    // x runner speed: chance to take the extra base on a hit
    STEAL_BASE: 0.18,         // steal success floor...
    STEAL_SPEED: 0.6,         // ...plus this x runner speed
  },

  // fielding layer (match mode): outs can be booted, gap hits can be robbed
  FIELDING: {
    ERROR_CHANCE: 0.055,      // clean out booted into a single (x fielding-team chaos)
    ROB_CHANCE: 0.25,         // near-threshold hit robbed back into an out
    ROB_WINDOW: 0.05,         // hitScore within this above HIT_OUT is robbable
  },

  // hit outcome thresholds on hitScore = quality * power * roll
  HIT_OUT: 0.61,              // below = fielded out
  HIT_SINGLE: 0.79,
  HIT_DOUBLE: 0.87,
  HIT_TRIPLE: 0.92,           // above = HOME RUN

  // mutant abilities
  CHAOS_PROC_CHANCE: 0.12,    // per swing: batter's chaos stat can warp the result
  CHAOS_BOOST: 0.18,          // hitScore bonus when chaos procs

  // difficulty presets (renderer options screen picks one; harness uses midnight)
  DIFFICULTY: {
    pushover:  { flightMult: 1.18, windowMult: 1.30 }, // slower pitches, fatter timing
    midnight:  { flightMult: 1.00, windowMult: 1.00 }, // the balanced default
    nightmare: { flightMult: 0.86, windowMult: 0.78 }, // heat and a needle-thin window
  },

  // home run derby (distance is measured in graves; a grave is six feet under)
  DERBY: {
    OUTS: 10,                 // any swing that isn't a homer is an out
    STRIKE_PROB: 0.85,        // derby pitchers groove it
    POWER_BOOST: 0.16,        // batting-practice adrenaline on the hitScore
    HR_THRESHOLD: 0.86,       // derby fences are friendlier than game HRs (0.92)
    FEET_BASE: 290,           // homer distance at the derby threshold
    FEET_SPREAD: 420,         // extra feet across the hitScore range above it
    GRAVE_FT: 6,
  },

  // per-mutant signature abilities. passive ones are always on; proc'd ones
  // fire at ABILITY_PROC_BASE + chaos * ABILITY_PROC_CHAOS per relevant event.
  ABILITY_PROC_BASE: 0.25,
  ABILITY_PROC_CHAOS: 0.6,
  ABILITIES: {
    'Sluggo the Exhumed': { key: 'graveweight',  label: 'GRAVE WEIGHT',   passive: false }, // hit roll floor raised
    'Marrow Mary':        { key: 'borrowedEyes', label: 'BORROWED EYES',  passive: true },  // timing window +15%
    'The Wormfather':     { key: 'wormfield',    label: 'WORMFIELD',      passive: true },  // errors x2, robs nullified on his ABs
    'Stitch-Lip Stan':    { key: 'silentAppeal', label: 'SILENT APPEAL',  passive: false }, // called strikes become balls
    'Six-Arm Sally':      { key: 'sixArms',      label: 'SIX ARMS',       passive: true },  // bat reach x1.35
    'Old Gasper':         { key: 'moonfire',     label: 'MOONFIRE',       passive: true },  // his homers ignite the moon
    'Rad-Rat Rickey':     { key: 'glowLegs',     label: 'GLOW LEGS',      passive: true },  // steal +0.18, stretch x1.4
    'Chernobyl Chuck':    { key: 'halfLives',    label: 'TWO HALF-LIVES', passive: true },  // chaos proc chance x2
    'The Split Twins':    { key: 'twoSwings',    label: 'TWO SWINGS',     passive: false }, // hit roll = best of two
    'Gilly the Gilled':   { key: 'wetRead',      label: 'WET READ',       passive: true },  // breaking balls don't bite him
    'Bessie Two-Heads':   { key: 'fourEyes',     label: 'FOUR EYES',      passive: true },  // foul threshold -0.06
    'Mothlight Moe':      { key: 'mothdance',    label: 'MOTH DANCE',     passive: true },  // steal +0.12, stretch x1.25
  },

  // field dimensions (logical units for both sim flavor and renderer)
  FIELD_SCALE: 60,            // distance mound -> plate
};

// The mutant rosters. Stats 0..1: power, contact, chaos.
// chaos = chance-based reality-warping (see CHAOS_PROC_CHANCE).
// gimmick = flavor tagline (select screens, future walk-ups). Data only.
export const ROSTERS = {
  home: {
    name: 'Gravemound Ghouls',
    players: [
      { name: 'Sluggo the Exhumed',   power: 0.85, contact: 0.45, chaos: 0.30, speed: 0.30, gimmick: 'Swings like the grave is still on him' },
      { name: 'Marrow Mary',          power: 0.55, contact: 0.75, chaos: 0.20, speed: 0.60, gimmick: "Reads pitches with someone else's eyes" },
      { name: 'The Wormfather',       power: 0.60, contact: 0.60, chaos: 0.55, speed: 0.45, gimmick: 'The infield squirms at his command' },
      { name: 'Stitch-Lip Stan',      power: 0.70, contact: 0.55, chaos: 0.25, speed: 0.50, gimmick: "Never argues a call. Can't." },
      { name: 'Six-Arm Sally',        power: 0.50, contact: 0.85, chaos: 0.15, speed: 0.55, gimmick: 'Six arms, one strike zone, no mercy' },
      { name: 'Old Gasper',           power: 0.90, contact: 0.35, chaos: 0.40, speed: 0.15, gimmick: 'Every homer costs him a lung' },
    ],
  },
  away: {
    name: 'Isotope Alley Aberrations',
    players: [
      { name: 'Rad-Rat Rickey',       power: 0.50, contact: 0.80, chaos: 0.25, speed: 0.95, gimmick: 'First to the base, glows in the dark' },
      { name: 'Chernobyl Chuck',      power: 0.88, contact: 0.40, chaos: 0.35, speed: 0.35, gimmick: 'Half-life? He has two full ones' },
      { name: 'The Split Twins',      power: 0.60, contact: 0.65, chaos: 0.60, speed: 0.65, gimmick: 'Argue over every swing — take both' },
      { name: 'Gilly the Gilled',     power: 0.55, contact: 0.70, chaos: 0.20, speed: 0.70, gimmick: 'Hits better when it rains. It always rains' },
      { name: 'Bessie Two-Heads',     power: 0.75, contact: 0.50, chaos: 0.30, speed: 0.40, gimmick: 'Four batting eyes are better than two' },
      { name: 'Mothlight Moe',        power: 0.45, contact: 0.75, chaos: 0.50, speed: 0.80, gimmick: 'Tragically distracted by stadium lights' },
    ],
  },
};
