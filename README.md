# PSYCHO MUTANT BASEBALL

Lofi PS2-era 3D arcade baseball. Wicked mutants. Bizarre, macabre ballparks.

**The playable slice:** you bat for both teams at The Boneyard — a graveyard ballpark
under a blood moon. The pitcher (a bulbous purple thing) throws fastballs, curves, and
wobbling ectoballs. Time your swing (SPACEBAR or tap) as the ball crosses the plate.
Full 3-inning games with real baseball state: counts, outs, baserunners, walks, chaos.

Two rosters of six mutants each, every one with power/contact/chaos stats — chaos is a
per-swing chance to warp reality in the batter's favor.

## Getting started

```bash
git init && git add . && git commit -m "Initial scaffold"
npm install
npm run dev      # play it
npm test         # run three full headless games — this is what agents use to verify work
```

## Working with agents

Run `claude` in this folder (Claude Code) or open it in Cursor. Six agents are pre-built
in `.claude/agents/`:

| Agent | Owns |
|---|---|
| gameplay-engineer | mechanics in src/core |
| test-harness | headless verification scripts |
| balance-analyst | tuning numbers in constants.js only |
| art-director | the PS2-lofi look in src/render |
| field-designer | the macabre ballparks in fields/ |
| performance-auditor | read-only perf review |

Good first tasks (each exercises the full agent loop):
1. "Balance-analyst: seed 1234 produced a 27-run blowout — investigate across 10 seeds and tighten variance without killing the arcade feel."
2. "Gameplay-engineer: fly balls should sometimes be caught — add a catch chance scaled by hitScore, verified in the harness."
3. "Field-designer: build Isotope Alley — toxic green palette, glowing cooling towers, ectoplasm fog."
4. "Art-director: give each batter their signature silhouette from the roster (Six-Arm Sally needs six arms, Bessie needs two heads)."
5. "Gameplay-engineer: walks never happen (see CLAUDE.md known gap) — make taking pitches a real strategy."
6. "Test-harness: write an at-bat drill script that isolates one batter vs one pitch type over 200 swings and reports outcome distribution."

## Structure

```
src/core/        pure baseball sim (runs headless in Node)
src/render/      Three.js PS2-lofi renderer + HUD
fields/          ballpark definitions (JSON) — field-designer's domain
harness/         headless verification (node harness/simulate.js <seed>)
.claude/agents/  the six-agent team
CLAUDE.md        source of truth — creative direction, architecture, balance targets
```

## Deploy

Push to GitHub, connect in Netlify — `netlify.toml` is configured (build `npm run build`, publish `dist`).
