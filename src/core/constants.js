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
  RESOLVE_TICKS_HIT: 125,     // contact — long enough to watch a towering fly come down

  // Pitch flight: slower and floatier than real baseball, on purpose.
  // flightTicks = mound->plate time. breakAmt drives the lateral banana curve.
  // wobble = ectoplasmic sine drift. gravMult scales gravity (ectoplasm floats).
  PITCH_TYPES: {
    fastball:  { flightTicks: 96,  breakAmt: 0.10, wobble: 0,   gravMult: 0.42, strikeProb: 0.62 },
    curve:     { flightTicks: 120, breakAmt: 0.75, wobble: 0,   gravMult: 0.85, strikeProb: 0.55 },
    ectoball:  { flightTicks: 142, breakAmt: 0.45, wobble: 1.0, gravMult: 0.28, strikeProb: 0.48 }, // wobbling ectoplasm
  },

  // pitch flight physics (world units, seconds via TICKS_PER_SEC)
  PITCH: {
    RELEASE_X: 0.8,           // pitcher releases slightly off centerline
    RELEASE_Y: 4.6,           // release height
    GRAVITY: 9,               // units/s^2 — mutant gravity is lazy; the ball floats
    BREAK_SCALE: 3.4,         // world units of lateral drift per unit breakAmt
    WOBBLE_AMP: 0.9,          // ectoball wobble amplitude
    WOBBLE_FREQ: 2.5,         // wobble cycles over the flight
    DRIFT_EASE: 0.38,         // z eases: leaves the hand hot, floats in (drag illusion)
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
    TAKE_BALL_PROB: 0.72,     // lays off balls this often
    TAKE_3BALL_PROB: 0.88,    // at three balls, make the pitcher earn it
    TAKE_2STRIKE_PROB: 0.28,  // protecting the plate, chases more
    SWING_ANY_PROB: 0.08,     // sometimes chases junk
    TIMING_ERR: 0.155,        // gaussian timing error scale (x sloppiness)
    AIM_ERR: 0.98,            // gaussian aim error scale (x sloppiness)
  },

  // pitcher fatigue + count strategy (CPU pitching, match mode)
  PITCHING: {
    STAMINA_DECAY: 0.013,     // per pitch thrown; floor at 0.3
    STAMINA_FLOOR: 0.5,       // strikeProb multiplier when completely gassed
    AHEAD_CHASE: 0.78,        // ahead in the count: bury one off the plate
    FULL_GROOVE: 1.45,        // three balls: aim for the zone (capped 0.92)
  },
  BATTER_EYE: 0.8,            // x contact = chance the zone telegraphs a ball (renderer)

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
  // cpuErrMult scales the CPU batter's error: pushover CPUs are sloppier
  DIFFICULTY: {
    pushover:  { flightMult: 1.18, windowMult: 1.30, cpuErrMult: 1.35 },
    midnight:  { flightMult: 1.00, windowMult: 1.00, cpuErrMult: 1.00 },
    nightmare: { flightMult: 0.86, windowMult: 0.78, cpuErrMult: 0.78 },
  },

  // arcade rubber band: the player's mutants find their chaos when trailing
  RUBBER_BAND: {
    DEFICIT: 3,               // trailing by this many in the final inning...
    CHAOS_MULT: 1.6,          // ...multiplies chaos proc chance
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
  FIELD_SCALE: 100,           // distance mound -> plate (cavernous mutant ballparks)
  FIELD_BASE_SCALE: 60,       // what the field JSONs were authored against —
                              // the renderer scales prop distances by SCALE/BASE
};

// The mutant rosters — twelve teams, keyed by slug. Stats 0..1: power,
// contact, chaos, speed. gimmick = flavor tagline. field = home ballpark.
// chaos = chance-based reality-warping (see CHAOS_PROC_CHANCE).
export const ROSTERS = {
  ghouls: {
    name: 'Gravemound Ghouls', field: 'boneyard',
    players: [
      { name: 'Sluggo the Exhumed',   power: 0.85, contact: 0.45, chaos: 0.30, speed: 0.30, gimmick: 'Swings like the grave is still on him' },
      { name: 'Marrow Mary',          power: 0.55, contact: 0.75, chaos: 0.20, speed: 0.60, gimmick: "Reads pitches with someone else's eyes" },
      { name: 'The Wormfather',       power: 0.60, contact: 0.60, chaos: 0.55, speed: 0.45, gimmick: 'The infield squirms at his command' },
      { name: 'Stitch-Lip Stan',      power: 0.70, contact: 0.55, chaos: 0.25, speed: 0.50, gimmick: "Never argues a call. Can't." },
      { name: 'Six-Arm Sally',        power: 0.50, contact: 0.85, chaos: 0.15, speed: 0.55, gimmick: 'Six arms, one strike zone, no mercy' },
      { name: 'Old Gasper',           power: 0.90, contact: 0.35, chaos: 0.40, speed: 0.15, gimmick: 'Every homer costs him a lung' },
    ],
  },
  aberrations: {
    name: 'Isotope Alley Aberrations', field: 'isotope',
    players: [
      { name: 'Rad-Rat Rickey',       power: 0.50, contact: 0.80, chaos: 0.25, speed: 0.95, gimmick: 'First to the base, glows in the dark' },
      { name: 'Chernobyl Chuck',      power: 0.88, contact: 0.40, chaos: 0.35, speed: 0.35, gimmick: 'Half-life? He has two full ones' },
      { name: 'The Split Twins',      power: 0.60, contact: 0.65, chaos: 0.60, speed: 0.65, gimmick: 'Argue over every swing — take both' },
      { name: 'Gilly the Gilled',     power: 0.55, contact: 0.70, chaos: 0.20, speed: 0.70, gimmick: 'Hits better when it rains. It always rains' },
      { name: 'Bessie Two-Heads',     power: 0.75, contact: 0.50, chaos: 0.30, speed: 0.40, gimmick: 'Four batting eyes are better than two' },
      { name: 'Mothlight Moe',        power: 0.45, contact: 0.75, chaos: 0.50, speed: 0.80, gimmick: 'Tragically distracted by stadium lights' },
    ],
  },
  idols: {
    name: 'Midnight Matinee Idols', field: 'drivein',
    players: [
      { name: 'Velvet Vlad',          power: 0.84, contact: 0.42, chaos: 0.35, speed: 0.40, gimmick: 'Bats only after sundown. It is always sundown' },
      { name: 'Norma Doom',           power: 0.50, contact: 0.85, chaos: 0.20, speed: 0.55, gimmick: 'Ready for her close-up. It never ends' },
      { name: 'Reel-to-Reel Rita',    power: 0.45, contact: 0.70, chaos: 0.25, speed: 0.92, gimmick: 'Runs at twenty-four frames a second, all fast' },
      { name: 'The Usher',            power: 0.58, contact: 0.60, chaos: 0.62, speed: 0.50, gimmick: 'Shows every pitch to its seat' },
      { name: 'Double-Feature Dan',   power: 0.68, contact: 0.62, chaos: 0.30, speed: 0.55, gimmick: 'Two shows nightly, no intermission' },
      { name: 'Popcorn Golem',        power: 0.88, contact: 0.34, chaos: 0.38, speed: 0.25, gimmick: 'Butter in the veins, salt in the soul' },
    ],
  },
  dwellers: {
    name: 'Undergut Dwellers', field: 'undergut',
    players: [
      { name: 'Grease-Trap Greg',     power: 0.86, contact: 0.40, chaos: 0.32, speed: 0.30, gimmick: 'What the city flushes, he returns with interest' },
      { name: 'Mama Mildew',          power: 0.52, contact: 0.83, chaos: 0.22, speed: 0.50, gimmick: 'She grows on you' },
      { name: 'Scutter',              power: 0.44, contact: 0.68, chaos: 0.28, speed: 0.95, gimmick: 'You heard him before you saw him' },
      { name: 'The Unflushable',      power: 0.60, contact: 0.58, chaos: 0.63, speed: 0.45, gimmick: 'He always comes back' },
      { name: 'Pipe-Dream Pete',      power: 0.66, contact: 0.64, chaos: 0.30, speed: 0.55, gimmick: 'Dreams in brown' },
      { name: 'Gator Gordo',          power: 0.80, contact: 0.48, chaos: 0.35, speed: 0.38, gimmick: 'The rumor was true, and it bats cleanup' },
    ],
  },
  broodmothers: {
    name: 'Silk Broodmothers', field: 'widowsweb',
    players: [
      { name: 'Madame Ocho',          power: 0.85, contact: 0.42, chaos: 0.33, speed: 0.35, gimmick: 'Eight arms, one swing, no survivors' },
      { name: 'Gossamer Gwen',        power: 0.48, contact: 0.86, chaos: 0.18, speed: 0.58, gimmick: 'Soft hands. So many soft hands' },
      { name: 'Skitters',             power: 0.42, contact: 0.66, chaos: 0.26, speed: 0.94, gimmick: 'First to first on six legs' },
      { name: 'The Clutch',           power: 0.58, contact: 0.60, chaos: 0.65, speed: 0.48, gimmick: 'Ten thousand children watch from the rafters' },
      { name: 'Webster',              power: 0.66, contact: 0.65, chaos: 0.28, speed: 0.52, gimmick: 'Well-read. Mostly flies' },
      { name: 'Cocoona',              power: 0.78, contact: 0.50, chaos: 0.36, speed: 0.30, gimmick: 'Mid-metamorphosis and still slugging' },
    ],
  },
  interns: {
    name: 'Front Office Interns', field: 'commissioner',
    players: [
      { name: 'The Stapler',          power: 0.87, contact: 0.38, chaos: 0.30, speed: 0.35, gimmick: 'Attached to nothing, fastened to glory' },
      { name: 'Clipboard Cassie',     power: 0.50, contact: 0.84, chaos: 0.18, speed: 0.55, gimmick: 'Tracks every pitch in triplicate' },
      { name: 'Unpaid Ian',           power: 0.44, contact: 0.66, chaos: 0.24, speed: 0.90, gimmick: 'Runs everywhere. Has to' },
      { name: 'Red-Tape Ray',         power: 0.58, contact: 0.58, chaos: 0.62, speed: 0.45, gimmick: 'Every rally dies in his committee' },
      { name: 'Coffee Wraith',        power: 0.62, contact: 0.62, chaos: 0.40, speed: 0.75, gimmick: 'Fourteen cups deep and vibrating' },
      { name: 'Middle-Manager Mel',   power: 0.74, contact: 0.52, chaos: 0.30, speed: 0.40, gimmick: 'Delegates the small stuff, crushes the big stuff' },
    ],
  },
  choir: {
    name: 'Flooded Chapel Choir', field: 'chapel',
    players: [
      { name: 'Baritone Bones',       power: 0.86, contact: 0.40, chaos: 0.32, speed: 0.30, gimmick: 'The low note loosens fillings' },
      { name: 'Sister Cellophane',    power: 0.48, contact: 0.84, chaos: 0.20, speed: 0.55, gimmick: 'See-through, and sees through you' },
      { name: 'Drowned Deacon Dee',   power: 0.46, contact: 0.66, chaos: 0.26, speed: 0.88, gimmick: 'Baptized at a dead sprint' },
      { name: 'Wet Psalm Sam',        power: 0.58, contact: 0.60, chaos: 0.60, speed: 0.48, gimmick: 'Every hymn a rain delay' },
      { name: 'The Organist',         power: 0.66, contact: 0.66, chaos: 0.28, speed: 0.50, gimmick: 'Has never missed a cue or a curveball' },
      { name: 'Gargoyle Gus',         power: 0.80, contact: 0.42, chaos: 0.34, speed: 0.28, gimmick: 'Came down off the roof for this' },
    ],
  },
  butchers: {
    name: 'Fairground Butchers', field: 'abattoir',
    players: [
      { name: 'Cleaver Colette',      power: 0.90, contact: 0.34, chaos: 0.32, speed: 0.32, gimmick: 'Every cut is prime' },
      { name: 'Tenderloin Tim',       power: 0.52, contact: 0.82, chaos: 0.20, speed: 0.52, gimmick: 'Knows exactly where the meat of the pitch is' },
      { name: 'Links',                power: 0.44, contact: 0.64, chaos: 0.26, speed: 0.91, gimmick: 'One sausage. Technically several' },
      { name: 'The Offal Oracle',     power: 0.58, contact: 0.58, chaos: 0.66, speed: 0.45, gimmick: 'Reads the future in the fifth inning' },
      { name: 'Brisket Bruce',        power: 0.68, contact: 0.62, chaos: 0.28, speed: 0.42, gimmick: 'Low and slow' },
      { name: 'Hambone Hank',         power: 0.78, contact: 0.48, chaos: 0.34, speed: 0.38, gimmick: 'Swings the family recipe' },
    ],
  },
  antennas: {
    name: 'Static Hill Antennas', field: 'statichill',
    players: [
      { name: 'UHF Ulysses',          power: 0.86, contact: 0.38, chaos: 0.34, speed: 0.34, gimmick: 'Broadcasts on all channels at once' },
      { name: 'Test-Pattern Tess',    power: 0.50, contact: 0.85, chaos: 0.16, speed: 0.55, gimmick: 'Perfectly calibrated' },
      { name: 'Rabbit-Ears Rae',      power: 0.44, contact: 0.66, chaos: 0.24, speed: 0.92, gimmick: 'Better reception on the run' },
      { name: 'Dead-Channel Chad',    power: 0.58, contact: 0.58, chaos: 0.61, speed: 0.48, gimmick: 'Nothing on. Nothing ever on' },
      { name: 'The Weatherman',       power: 0.66, contact: 0.64, chaos: 0.30, speed: 0.50, gimmick: 'One hundred percent chance of pain' },
      { name: 'Vertical-Hold Vern',   power: 0.76, contact: 0.50, chaos: 0.32, speed: 0.40, gimmick: 'Keeps rolling. Cannot be stopped' },
    ],
  },
  stitches: {
    name: 'Sawdust Stitches', field: 'taxidermy',
    players: [
      { name: 'Mounted Mo',           power: 0.88, contact: 0.32, chaos: 0.34, speed: 0.30, gimmick: 'Came off the wall angry' },
      { name: 'Glass-Eye Gladys',     power: 0.50, contact: 0.85, chaos: 0.18, speed: 0.52, gimmick: 'Sees everything. Blinks never' },
      { name: 'Pose-able Paul',       power: 0.46, contact: 0.64, chaos: 0.26, speed: 0.89, gimmick: 'Every joint articulated for speed' },
      { name: 'Loose-Thread Lou',     power: 0.58, contact: 0.58, chaos: 0.64, speed: 0.46, gimmick: 'Pull him and the whole team unravels' },
      { name: 'Shellac Shelly',       power: 0.66, contact: 0.64, chaos: 0.28, speed: 0.50, gimmick: 'Preserved at her peak' },
      { name: 'The Diorama',          power: 0.76, contact: 0.50, chaos: 0.36, speed: 0.42, gimmick: 'Three squirrels in a trench coat. At least' },
    ],
  },
  frostbites: {
    name: 'Icebox Frostbites', field: 'icebox',
    players: [
      { name: 'Hock',                 power: 0.89, contact: 0.33, chaos: 0.30, speed: 0.28, gimmick: 'Hangs heavy, swings heavier' },
      { name: 'Freezer-Burn Fern',    power: 0.50, contact: 0.82, chaos: 0.20, speed: 0.54, gimmick: 'A little frost never hurt the average' },
      { name: 'Slick',                power: 0.44, contact: 0.65, chaos: 0.24, speed: 0.94, gimmick: 'The basepaths are always iced' },
      { name: 'Chilly Concepcion',    power: 0.58, contact: 0.60, chaos: 0.57, speed: 0.48, gimmick: 'Cold hands, colder blood' },
      { name: 'The Leftover',         power: 0.66, contact: 0.63, chaos: 0.30, speed: 0.50, gimmick: "In the back since '09. Still good" },
      { name: 'Icicle Ike',           power: 0.77, contact: 0.48, chaos: 0.34, speed: 0.40, gimmick: 'Drops in sharp from above' },
    ],
  },
  darlings: {
    name: 'Compost Heap Darlings', field: 'compost',
    players: [
      { name: 'Rotgut Rudy',          power: 0.87, contact: 0.36, chaos: 0.34, speed: 0.32, gimmick: 'Ferments on contact' },
      { name: 'Banana Brown',         power: 0.50, contact: 0.81, chaos: 0.20, speed: 0.56, gimmick: 'Perfectly overripe' },
      { name: 'Peelings Pearl',       power: 0.44, contact: 0.64, chaos: 0.26, speed: 0.90, gimmick: 'Slips herself into second' },
      { name: 'The Mulch King',       power: 0.58, contact: 0.58, chaos: 0.64, speed: 0.44, gimmick: 'Everything returns to him eventually' },
      { name: 'Eggshell Ed',          power: 0.64, contact: 0.66, chaos: 0.30, speed: 0.52, gimmick: 'Handle with care, pitch with fear' },
      { name: 'Grub Mother',          power: 0.74, contact: 0.52, chaos: 0.38, speed: 0.36, gimmick: 'Her children aerate the infield' },
    ],
  },
};
