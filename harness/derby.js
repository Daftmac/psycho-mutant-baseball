// harness/derby.js
// Headless home run derby verification. Usage: node harness/derby.js [seed]
// Agents: run this (npm test does) after ANY change to src/core derby logic.

import { Game } from '../src/core/game.js';
import { C, ROSTERS } from '../src/core/constants.js';

const seed = Number(process.argv[2] ?? 42);
const derbyPlayer = seed % 6;
const game = new Game({ seed, mode: 'derby', derbyTeam: 'ghouls', derbyPlayer });
const rng = (() => { let a = seed ^ 0xD5B7; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();

// derby auto-slugger: swings hard at strikes, spits on junk
let plan = null;
function autoInput() {
  const s = game.state;
  if (s.phase !== 'pitch') { plan = null; return {}; }
  if (!plan) {
    const batter = game.currentBatter();
    if (!s.pitch.isStrike && rng() < 0.75) { plan = { take: true }; return {}; }
    const sloppy = 1.3 - batter.contact;
    const gauss = () => rng() + rng() - 1;
    plan = {
      swingT: C.CONTACT_POINT + gauss() * 0.13 * sloppy,
      aimX: s.pitch.target.x + gauss() * 0.7 * sloppy,
      aimY: s.pitch.target.y + gauss() * 0.7 * sloppy,
      swung: false,
    };
  }
  if (!plan.take && !plan.swung && s.pitch.t >= plan.swingT) {
    plan.swung = true;
    return { swing: true, aimX: plan.aimX, aimY: plan.aimY };
  }
  return {};
}

const MAX_TICKS = 60 * 60 * 15; // a derby must finish in 15 sim-minutes
let ticks = 0;
while (game.state.phase !== 'gameover' && ticks < MAX_TICKS) {
  game.update(autoInput());
  ticks++;
  if (game.state.errors.length) { console.error('SIM ERROR:', game.state.errors[0]); process.exit(1); }
}

const s = game.state;
const report = {
  seed,
  slugger: ROSTERS.ghouls.players[derbyPlayer].name,
  finished: s.phase === 'gameover',
  derbyMinutes: +(ticks / 3600).toFixed(1),
  homers: s.derby.homers,
  outs: s.derby.outs,
  longestGraves: s.derby.longest,
  totalGraves: s.derby.totalGraves,
  result: s.lastPlay?.text ?? '(none)',
};
console.log(JSON.stringify(report, null, 2));

const fail = (m) => { console.error('ASSERT FAILED:', m); process.exit(1); };
if (!report.finished) fail('derby did not finish inside tick cap');
if (report.outs !== C.DERBY.OUTS) fail(`derby ended with ${report.outs} outs, expected ${C.DERBY.OUTS}`);
if (report.homers > 40) fail(`absurd homer count (${report.homers})`);
if (report.homers > 0 && report.longestGraves < 45) fail(`homer distances implausibly short (${report.longestGraves} graves)`);
console.log('OK');
