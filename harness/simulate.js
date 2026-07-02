// harness/simulate.js
// Headless verification. Plays a FULL game with an auto-batter — no browser.
// Usage: node harness/simulate.js [seed]
// Agents: run this after ANY change to src/core and report the JSON output.

import { Game } from '../src/core/game.js';
import { C } from '../src/core/constants.js';

const seed = Number(process.argv[2] ?? 42);
const game = new Game({ seed });

// The CPU batter lives in core (game.autoBatterInput) so the harness and
// live player-pitching games share one brain. Tuned via C.CPU_BATTER.
const autoInput = () => game.autoBatterInput();

const MAX_TICKS = 60 * 60 * 30; // 30 min cap — a game must finish well before this
const t0 = process.hrtime.bigint();
let ticks = 0;
while (game.state.phase !== 'gameover' && ticks < MAX_TICKS) {
  game.update(autoInput());
  ticks++;
  if (game.state.errors.length) { console.error('SIM ERROR:', game.state.errors[0]); process.exit(1); }
}
const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;

const s = game.state;
const report = {
  seed,
  finished: s.phase === 'gameover',
  gameMinutes: +(ticks / 3600).toFixed(1),
  finalScore: s.score,
  result: s.lastPlay?.text ?? '(none)',
  pitches: s.stats.pitches,
  swings: s.stats.swings,
  hits: s.stats.hits,
  homers: s.stats.homers,
  strikeouts: s.stats.strikeouts,
  walks: s.stats.walks,
  chaosProcs: s.stats.chaosProcs,
  battingAvg: +(s.stats.hits / Math.max(1, s.stats.swings)).toFixed(3),
  avgUpdateMs: +(elapsedMs / Math.max(ticks, 1)).toFixed(5),
};
console.log(JSON.stringify(report, null, 2));

const fail = (m) => { console.error('ASSERT FAILED:', m); process.exit(1); };
if (!report.finished) fail('game did not finish inside tick cap');
if (report.pitches < 20) fail('suspiciously few pitches — inning logic likely broken');
if (report.avgUpdateMs > 0.5) fail('update loop too slow headless (>0.5ms/tick)');
const totalRuns = s.score.home + s.score.away;
if (totalRuns > 60) fail(`absurd run total (${totalRuns}) — balance regression`);
const lsSum = (t) => s.lineScore[t].reduce((a, b) => a + (b || 0), 0);
if (lsSum('away') !== s.score.away || lsSum('home') !== s.score.home) {
  fail(`line score (${lsSum('away')}-${lsSum('home')}) does not sum to final (${s.score.away}-${s.score.home})`);
}
const abTotal = Object.values(s.playerStats).reduce((a, p) => a + p.ab, 0);
if (abTotal < 18) fail(`suspiciously few at-bats credited (${abTotal})`);
console.log('OK');
