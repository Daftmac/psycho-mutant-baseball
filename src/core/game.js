// src/core/game.js
// PURE SIMULATION CORE — no rendering, no DOM, no dependencies.
// Runs identically in the browser and in Node (headless harness).
// All tuning numbers live in constants.js. All randomness through this.rng.
//
// The game is a tick-based pitch/swing loop:
//   windup -> pitch (ball in flight, swing window open) -> resolve -> windup ...
// The human (or auto-batter) bats; pitching and fielding are simulated.

import { C, ROSTERS } from './constants.js';

function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  // mode 'match' = full game; mode 'derby' = home run derby (one slugger,
  // grooved pitches, any swing that isn't a homer is an out)
  constructor({ seed = 1, mode = 'match', derbyTeam = 'home', derbyPlayer = 0, difficulty = 'midnight' } = {}) {
    this.rng = makeRng(seed);
    this.mode = mode;
    this.derbyTeam = derbyTeam;
    this.derbyPlayer = derbyPlayer;
    this.diff = C.DIFFICULTY[difficulty] ?? C.DIFFICULTY.midnight;
    this.tick = 0;
    this.state = {
      phase: 'windup',              // 'windup' | 'pitch' | 'resolve' | 'gameover'
      phaseTicks: C.WINDUP_TICKS,
      inning: 1,
      half: 'top',                  // 'top' = away bats, 'bottom' = home bats
      outs: 0,
      balls: 0,
      strikes: 0,
      bases: [false, false, false], // 1st, 2nd, 3rd
      score: { home: 0, away: 0 },
      batterIndex: { home: 0, away: 0 },
      pitch: null,                  // { type, t, flightTicks, target, pos, ... } — see _throwPitch
      swing: null,                  // { atT, aimX, aimY } — set on swing input
      lastPlay: null,               // { text, kind, hitScore } for HUD/renderer
      stats: { pitches: 0, swings: 0, hits: 0, homers: 0, strikeouts: 0, walks: 0, chaosProcs: 0 },
      lineScore: { away: [], home: [] },  // runs per inning (index = inning-1)
      playerStats: {},                    // name -> { ab, hits, homers, score } for the box score/MVP
      errors: [],
    };
    if (mode === 'derby') {
      this.state.derby = { homers: 0, outs: 0, longest: 0, totalGraves: 0 };
    }
  }

  battingTeam() { return this.state.half === 'top' ? 'away' : 'home'; }

  currentBatter() {
    if (this.mode === 'derby') {
      const roster = ROSTERS[this.derbyTeam].players;
      return roster[this.derbyPlayer % roster.length];
    }
    const team = this.battingTeam();
    const roster = ROSTERS[team].players;
    return roster[this.state.batterIndex[team] % roster.length];
  }

  // input: { swing, aimX, aimY, pitch } — swing is edge-triggered by caller;
  // aimX/aimY is where the batter is holding the bat in the hitting plane;
  // pitch = { type, tx, ty, power, accuracy } calls the next pitch (player
  // pitching) — consumed at the moment of release.
  update(input = {}) {
    const s = this.state;
    if (s.phase === 'gameover') return;
    this.tick++;

    if (s.phase === 'windup') {
      if (input.pitch) this._pitchPlan = input.pitch;
      if (--s.phaseTicks <= 0) this._throwPitch();
      return;
    }

    if (s.phase === 'pitch') {
      const p = s.pitch;
      p.t = Math.min(1, p.t + 1 / p.flightTicks);
      this._plotPitch();

      if (input.swing && !s.swing) {
        const zMid = (C.ZONE.BOT + C.ZONE.TOP) / 2;
        const type = C.SWING_TYPES[input.swingType] ? input.swingType : 'contact';
        s.swing = { atT: p.t, aimX: input.aimX ?? 0, aimY: input.aimY ?? zMid, type };
        s.stats.swings++;
        this._resolveSwing();
        return;
      }
      if (p.t >= 1) this._resolveTake();
      return;
    }

    if (s.phase === 'resolve') {
      if (--s.phaseTicks <= 0) {
        if (this._checkGameOver()) return;
        s.phase = 'windup';
        s.phaseTicks = C.WINDUP_TICKS;
        s.pitch = null;
        s.swing = null;
      }
    }
  }

  _inZone(x, y) {
    const Z = C.ZONE;
    return Math.abs(x) <= Z.HALF_W && y >= Z.BOT && y <= Z.TOP;
  }

  // CPU batter: plans a swing timing AND a bat aim per pitch with human-ish
  // error scaled by the batter's contact stat. Deterministic (this.rng), used
  // by the harness and by live games when the player is pitching.
  // Call once per tick; returns the input object for update().
  autoBatterInput() {
    const s = this.state;
    if (s.phase !== 'pitch') { this._cpuPlan = null; return {}; }
    if (!this._cpuPlan) {
      const batter = this.currentBatter();
      const cb = C.CPU_BATTER;
      const takes = (!s.pitch.isStrike && this.rng() < cb.TAKE_BALL_PROB) || this.rng() < cb.SWING_ANY_PROB;
      if (takes) { this._cpuPlan = { take: true }; return {}; }
      const sloppy = 1.3 - batter.contact;
      const gauss = () => this.rng() + this.rng() - 1;
      this._cpuPlan = {
        swingT: C.CONTACT_POINT + gauss() * cb.TIMING_ERR * sloppy,
        aimX: s.pitch.target.x + gauss() * cb.AIM_ERR * sloppy,
        aimY: s.pitch.target.y + gauss() * cb.AIM_ERR * sloppy,
        swung: false,
      };
    }
    const p = this._cpuPlan;
    if (!p.take && !p.swung && s.pitch.t >= p.swingT) {
      p.swung = true;
      return { swing: true, aimX: p.aimX, aimY: p.aimY };
    }
    return {};
  }

  _throwPitch() {
    const s = this.state;
    const Z = C.ZONE, P = C.PITCH;
    const plan = this._pitchPlan;
    this._pitchPlan = null;

    let type, def, tx, ty, flightTicks;
    if (plan && C.PITCH_TYPES[plan.type]) {
      // player-called pitch: aim + meter results, scattered by (1 - accuracy)
      type = plan.type;
      def = C.PITCH_TYPES[type];
      const PP = C.PLAYER_PITCH;
      const scatter = (1 - Math.max(0, Math.min(1, plan.accuracy))) * PP.ACCURACY_SCATTER;
      tx = plan.tx + (this.rng() * 2 - 1) * scatter;
      ty = Math.max(0.35, plan.ty + (this.rng() * 2 - 1) * scatter);
      const power = Math.max(0, Math.min(1, plan.power));
      flightTicks = Math.round(def.flightTicks * this.diff.flightMult *
        (PP.POWER_FLIGHT_MAX - power * (PP.POWER_FLIGHT_MAX - PP.POWER_FLIGHT_MIN)));
    } else {
      // CPU pitcher picks a real crossing point: in the zone, or just off an
      // edge (derby pitchers groove far more strikes)
      const names = Object.keys(C.PITCH_TYPES);
      type = names[Math.floor(this.rng() * names.length)];
      def = C.PITCH_TYPES[type];
      const strikeProb = this.mode === 'derby' ? Math.max(def.strikeProb, C.DERBY.STRIKE_PROB) : def.strikeProb;
      if (this.rng() < strikeProb) {
        tx = (this.rng() * 2 - 1) * (Z.HALF_W * 0.85);
        ty = Z.BOT + 0.15 + this.rng() * (Z.TOP - Z.BOT - 0.3);
      } else {
        const m = 0.15 + this.rng() * C.MISS_MARGIN;
        const edge = this.rng();
        if (edge < 0.4)      { tx = (this.rng() < 0.5 ? -1 : 1) * (Z.HALF_W + m); ty = Z.BOT + this.rng() * (Z.TOP - Z.BOT); }
        else if (edge < 0.7) { ty = Z.TOP + m; tx = (this.rng() * 2 - 1) * Z.HALF_W; }
        else                 { ty = Math.max(0.35, Z.BOT - m); tx = (this.rng() * 2 - 1) * Z.HALF_W; }
      }
      flightTicks = Math.round(def.flightTicks * this.diff.flightMult * (1 + (this.rng() * 2 - 1) * P.FLIGHT_JITTER));
    }

    s.pitch = {
      type,
      t: 0,
      flightTicks,
      breakAmt: def.breakAmt,
      breakDir: this.rng() < 0.5 ? -1 : 1,
      wobble: def.wobble,
      wobblePhase: this.rng() * Math.PI * 2,
      gravMult: def.gravMult,
      target: { x: tx, y: ty },
      isStrike: this._inZone(tx, ty),
      pos: { x: P.RELEASE_X, y: P.RELEASE_Y, z: -C.FIELD_SCALE },
    };
    this._plotPitch();
    s.phase = 'pitch';
    s.stats.pitches++;
  }

  // Analytic flight, evaluated per tick (deterministic, no per-tick rng):
  //  - y: true projectile arc under (mutant) gravity, solved to hit the target
  //  - x: lerp to target + late-developing break banana + ectoplasm wobble
  //  - z: eased — hot out of the hand, floats the last third (drag illusion)
  _plotPitch() {
    const p = this.state.pitch;
    const P = C.PITCH;
    const u = p.t;
    const T = p.flightTicks / C.TICKS_PER_SEC;
    const ts = u * T;

    const g = P.GRAVITY * p.gravMult;
    const vy0 = (p.target.y - P.RELEASE_Y + 0.5 * g * T * T) / T;
    p.pos.y = P.RELEASE_Y + vy0 * ts - 0.5 * g * ts * ts;

    const brk = p.breakDir * p.breakAmt * P.BREAK_SCALE;
    const wob = p.wobble * P.WOBBLE_AMP * Math.sin(p.wobblePhase + u * Math.PI * 2 * P.WOBBLE_FREQ) * Math.sin(u * Math.PI);
    p.pos.x = P.RELEASE_X + (p.target.x - P.RELEASE_X) * u + brk * (u * u - u) + wob;

    const zu = u + P.DRIFT_EASE * (u - u * u);
    p.pos.z = -C.FIELD_SCALE * (1 - zu);
  }

  _resolveSwing() {
    const s = this.state;
    const batter = this.currentBatter();

    // timing: how close to the ideal contact moment
    const st = C.SWING_TYPES[s.swing.type ?? 'contact'];
    const timingError = Math.abs(s.swing.atT - C.CONTACT_POINT);
    const window = C.TIMING_WINDOW * this.diff.windowMult * st.windowMult * (0.6 + batter.contact * 0.8);
    const difficulty = 1 + s.pitch.breakAmt * 0.25; // breaking stuff still bites a little
    const timingQ = Math.max(0, 1 - (timingError * difficulty) / window);

    // location: how close the bat is to the ball RIGHT NOW. Swinging early at a
    // curve means swinging at where it hasn't broken to yet — timing and
    // location punish each other naturally.
    const dx = s.swing.aimX - s.pitch.pos.x;
    const dy = s.swing.aimY - s.pitch.pos.y;
    const reach = C.BAT_REACH * (0.75 + batter.contact * 0.5);
    const spatialQ = Math.max(0, 1 - Math.hypot(dx, dy) / reach);

    let quality = timingQ * (C.SPATIAL_FLOOR + (1 - C.SPATIAL_FLOOR) * spatialQ);

    // contact geometry for the renderer: early = pulled, late = pushed;
    // getting under the ball lofts it, over it chops it down
    this._lastContact = {
      spray: Math.max(-1, Math.min(1, (C.CONTACT_POINT - s.swing.atT) / window)),
      loft: Math.max(-1, Math.min(1, -dy / reach)),
    };

    if (this.mode === 'derby') return this._resolveDerbySwing(quality, batter);
    if (s.swing.type === 'bunt') return this._resolveBunt(quality);

    if (quality < C.WHIFF_THRESHOLD) return this._strike('swinging strike');
    if (quality < C.FOUL_THRESHOLD) return this._foul();

    // contact! compute hit outcome
    let hitScore = quality * (0.5 + batter.power * 0.7) * (0.7 + this.rng() * 0.6) * st.hitMult;
    let chaos = false;
    if (this.rng() < C.CHAOS_PROC_CHANCE * (batter.chaos * 2)) {
      hitScore += C.CHAOS_BOOST;
      chaos = true;
      s.stats.chaosProcs++;
    }

    // fielding layer: mutant gloves giveth and taketh away
    const F = C.FIELDING;
    const loft = this._lastContact.loft;
    const outVerb = loft > 0.35 ? 'skies out' : loft < -0.1 ? 'grounds out' : 'lines out';
    if (hitScore < C.HIT_OUT) {
      const fieldingTeam = this.battingTeam() === 'away' ? 'home' : 'away';
      const chaosAvg = ROSTERS[fieldingTeam].players.reduce((a, p) => a + p.chaos, 0) / ROSTERS[fieldingTeam].players.length;
      if (this.rng() < F.ERROR_CHANCE * (0.6 + chaosAvg * 2)) {
        this._lastContact.fielded = 'error';
        s.stats.hits++; // scored a hit for flavor — the mutant leagues keep loose books
        return this._advance(1, `BOOTED! ${batter.name} reaches on the error`, hitScore);
      }
      return this._out(`${batter.name} ${outVerb}`, hitScore);
    }
    if (hitScore < C.HIT_OUT + F.ROB_WINDOW && this.rng() < F.ROB_CHANCE) {
      this._lastContact.fielded = 'robbed';
      return this._out(`${batter.name} is ROBBED at the gap`, hitScore);
    }
    s.stats.hits++;
    if (hitScore < C.HIT_SINGLE) return this._advance(1, `${batter.name} rips a single${chaos ? ' — CHAOS!' : ''}`, hitScore);
    if (hitScore < C.HIT_DOUBLE) return this._advance(2, `${batter.name} laces a double${chaos ? ' — CHAOS!' : ''}`, hitScore);
    if (hitScore < C.HIT_TRIPLE) return this._advance(3, `${batter.name} legs out a triple${chaos ? ' — CHAOS!' : ''}`, hitScore);
    s.stats.homers++;
    return this._advance(4, `${batter.name} CRUSHES A HOME RUN${chaos ? ' — CHAOS!' : ''}`, hitScore);
  }

  // Bunt: deaden it. With runners on and less than two outs it's a sacrifice;
  // otherwise it's a gift to the defense.
  _resolveBunt(quality) {
    const s = this.state;
    const batter = this.currentBatter();
    if (quality < C.WHIFF_THRESHOLD) return this._strike('whiffs the bunt');
    if (s.bases.some(Boolean) && s.outs < 2) {
      let runs = 0;
      for (let i = 2; i >= 0; i--) {
        if (!s.bases[i]) continue;
        s.bases[i] = false;
        if (i === 2) runs++;
        else s.bases[i + 1] = true;
      }
      if (runs) {
        const team = this.battingTeam();
        s.score[team] += runs;
        const ls = s.lineScore[team];
        ls[s.inning - 1] = (ls[s.inning - 1] ?? 0) + runs;
      }
      return this._out(`${batter.name} lays one down — sacrifice${runs ? ', a run crawls home!' : ''}`, 0.1);
    }
    return this._out(`${batter.name} bunts into an easy out`, 0.05);
  }

  // Derby: only swings count. Homer or out, nothing in between.
  _resolveDerbySwing(quality, batter) {
    const s = this.state;
    const d = s.derby;
    let hitScore = 0;
    if (quality >= C.FOUL_THRESHOLD) {
      hitScore = quality * (0.5 + batter.power * 0.7) * (0.7 + this.rng() * 0.6) + C.DERBY.POWER_BOOST;
      if (this.rng() < C.CHAOS_PROC_CHANCE * (batter.chaos * 2)) {
        hitScore += C.CHAOS_BOOST;
        s.stats.chaosProcs++;
      }
    }
    if (hitScore >= C.DERBY.HR_THRESHOLD) {
      const feet = C.DERBY.FEET_BASE + (hitScore - C.DERBY.HR_THRESHOLD) * C.DERBY.FEET_SPREAD;
      const graves = Math.round(feet / C.DERBY.GRAVE_FT);
      const newBest = graves > d.longest;
      d.homers++;
      d.totalGraves += graves;
      d.longest = Math.max(d.longest, graves);
      s.stats.homers++;
      s.stats.hits++;
      return this._endPitch(`${batter.name} LAUNCHES ONE ${graves} GRAVES DEEP${newBest ? ' — NEW LONGEST!' : '!'}`, 'homer', hitScore);
    }
    d.outs++;
    const text = quality < C.WHIFF_THRESHOLD ? 'swings at a ghost — OUT'
      : quality < C.FOUL_THRESHOLD ? 'hacks it foul — OUT'
      : 'not enough meat on it — OUT';
    return this._endPitch(`${text} (${d.outs}/${C.DERBY.OUTS})`, 'out', hitScore);
  }

  _resolveTake() {
    const s = this.state;
    if (this.mode === 'derby') return this._endPitch('takes it — the graveyard moans', 'take');
    if (s.pitch.isStrike) return this._strike('called strike');
    s.balls++;
    if (s.balls >= 4) {
      s.stats.walks++;
      return this._advance(1, `${this.currentBatter().name} walks`, 0, true);
    }
    this._endPitch(`ball ${s.balls}`, 'ball');
  }

  _strike(text) {
    const s = this.state;
    s.strikes++;
    if (s.strikes >= 3) {
      s.stats.strikeouts++;
      return this._out(`${this.currentBatter().name} strikes out`, 0);
    }
    this._endPitch(`${text} — strike ${s.strikes}`, 'strike');
  }

  _foul() {
    const s = this.state;
    if (s.strikes < 2) s.strikes++;
    this._endPitch('foul ball', 'foul');
  }

  _credit(name, { ab = 0, hit = 0, homer = 0, score = 0 }) {
    const st = this.state.playerStats[name] ?? (this.state.playerStats[name] = { ab: 0, hits: 0, homers: 0, score: 0 });
    st.ab += ab; st.hits += hit; st.homers += homer; st.score += score;
  }

  _out(text, hitScore) {
    const s = this.state;
    this._credit(this.currentBatter().name, { ab: 1, score: hitScore });
    s.outs++;
    this._nextBatter();
    if (s.outs >= 3) return this._endHalf(text);
    this._endPitch(`${text} — ${s.outs} out`, 'out', hitScore);
  }

  // advance runners by n bases (4 = HR). walk = force advance only.
  _advance(n, text, hitScore, walk = false) {
    const s = this.state;
    const team = this.battingTeam();
    if (!walk) this._credit(this.currentBatter().name, { ab: 1, hit: 1, homer: n >= 4 ? 1 : 0, score: hitScore });
    let runs = 0;
    if (walk) {
      // force logic: batter to 1st, runners advance only if forced
      if (s.bases[0] && s.bases[1] && s.bases[2]) runs++;
      else if (s.bases[0] && s.bases[1]) s.bases[2] = true;
      else if (s.bases[0]) s.bases[1] = true;
      s.bases[0] = true;
    } else {
      for (let i = 2; i >= 0; i--) {
        if (!s.bases[i]) continue;
        s.bases[i] = false;
        const dest = i + n;
        if (dest >= 3) runs++;
        else s.bases[dest] = true;
      }
      if (n >= 4) runs++;
      else s.bases[n - 1] = true;
    }
    s.score[team] += runs;
    if (runs) {
      const ls = s.lineScore[team];
      ls[s.inning - 1] = (ls[s.inning - 1] ?? 0) + runs;
    }
    this._nextBatter();
    this._endPitch(runs ? `${text} — ${runs} run${runs > 1 ? 's' : ''} score!` : text, n >= 4 ? 'homer' : 'hit', hitScore);
  }

  _nextBatter() {
    const s = this.state;
    const team = this.battingTeam();
    s.batterIndex[team]++;
    s.balls = 0;
    s.strikes = 0;
  }

  _endHalf(text) {
    const s = this.state;
    s.outs = 0;
    s.balls = 0;
    s.strikes = 0;
    s.bases = [false, false, false];
    if (s.half === 'top') s.half = 'bottom';
    else { s.half = 'top'; s.inning++; }
    this._endPitch(`${text} — side retired`, 'sideout');
  }

  _endPitch(text, kind, hitScore = 0) {
    const s = this.state;
    const contact = ['hit', 'homer', 'out'].includes(kind) ? this._lastContact : null;
    s.lastPlay = {
      text, kind, hitScore, tick: this.tick,
      spray: contact?.spray ?? 0, loft: contact?.loft ?? 0, fielded: contact?.fielded ?? null,
    };
    this._lastContact = null;
    s.phase = 'resolve';
    // contact plays get a longer resolve so the ball flight reads on screen
    s.phaseTicks = contact ? C.RESOLVE_TICKS_HIT : C.RESOLVE_TICKS;
  }

  _checkGameOver() {
    const s = this.state;
    if (this.mode === 'derby') {
      if (s.derby.outs >= C.DERBY.OUTS) {
        s.phase = 'gameover';
        s.lastPlay = {
          text: `DERBY OVER: ${s.derby.homers} HOMER${s.derby.homers === 1 ? '' : 'S'} — LONGEST ${s.derby.longest} GRAVES`,
          kind: 'final', hitScore: 0, spray: 0, loft: 0, tick: this.tick,
        };
        return true;
      }
      return false;
    }
    const over =
      (s.inning > C.INNINGS) ||
      (s.inning === C.INNINGS && s.half === 'bottom' && s.score.home > s.score.away && s.outs === 0 && s.balls === 0 && s.strikes === 0 && s.lastPlay?.kind === 'sideout');
    if (s.inning > C.INNINGS) {
      s.phase = 'gameover';
      const { home, away } = s.score;
      const winner = home > away ? ROSTERS.home.name : away > home ? ROSTERS.away.name : 'nobody — a tie in the mutant leagues stands';
      s.lastPlay = { text: `FINAL: ${away}–${home}. Winner: ${winner}`, kind: 'final', hitScore: 0, tick: this.tick };
      return true;
    }
    return false;
  }
}
