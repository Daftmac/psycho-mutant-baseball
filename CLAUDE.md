# CLAUDE.md — Psycho Mutant Baseball

Lofi PS2-era 3D arcade baseball. Wicked mutant players, bizarre macabre fields.
Timing-and-aim batting (mouse moves the bat in the hitting zone) vs a simulated
pitcher throwing physically simulated pitches; fielding is abstracted (for now).
Stack: vanilla JS + Three.js, built with Vite, deployed to Netlify.

## Creative direction (the vibe is the product)
- PS2-era lofi: low internal resolution (480x300) upscaled with `image-rendering: pixelated`,
  low-poly chunky geometry, flat shading, heavy fog, small palettes. NO modern PBR,
  NO high-res textures, NO smooth normals. Jank is charm; blur is not.
- Tone: macabre and bizarre but playful — creepy carnival, not gore. Blood moons yes,
  blood no. Think "Saturday-morning cartoon that airs at midnight."
- Every field has a personality (see /fields). Every mutant has a gimmick.

## Architecture (do not violate)
- `src/core/` — PURE simulation. No DOM, no Three.js, no imports outside core. Runs in Node.
- `src/render/` — Three.js scene + input + HUD. No game rules here.
- `src/core/constants.js` — ALL tuning numbers AND rosters. No magic numbers in logic.
- `fields/*.json` — field definitions (palette, props). The renderer reads these
  generically — schema documented in `fields/README.md`. Load with `?field=<name>`.
- `harness/` — headless verification run with plain Node.

## Commands
- Dev server: `npm run dev`
- Verify sim: `npm test` (full CPU-vs-CPU games on 3 seeds; each must print OK)
- Single game: `node harness/simulate.js <seed>`
- Build: `npm run build`

## Rules for agents
- After ANY change to `src/core/`, run `npm test` and include the JSON reports in your summary.
- The sim must stay deterministic: all randomness in core goes through `this.rng` (seeded).
  Never use `Math.random()` in core. (Renderer-only cosmetic randomness is allowed.)
- One mechanic per task; commit after each verified change.
- Rendering budget: this must run at 60fps on modest hardware. Prefer fewer, chunkier
  meshes. Reuse geometries/materials; never allocate meshes inside the render loop.

## Balance targets (for the balance-analyst)
- Auto-batter batting average: .250–.380 across seeds (arcade-hot, not absurd).
- Full 3-inning game: 3–20 total runs typical; flag any seed above 40 as a regression.
- Game length: 3–8 minutes of sim time.
- Known gap: walks almost never happen — pitch-taking and ball/strike tension need work.

## Quality evolution
The long-form quality backlog lives in `EVOLUTION.md`, worked one increment at
a time via the `/evolve` command (`.claude/commands/evolve.md`). Prefer it over
this roadmap for "what next" decisions — the roadmap below is the original
sketch and is being absorbed into EVOLUTION.md phases.

## Roadmap (in rough order)
1. Fielding as a real system (fly balls can be caught, grounders beaten out)
2. Player-controlled pitching (pick pitch type + location) with mutant pitch gimmicks
3. Per-mutant chaos abilities (Wormfather summons worms, Split Twins swing twice...)
4. More fields: Isotope Alley (toxic glow), The Abattoir Fairgrounds, The Flooded Chapel
5. Sound: lofi crowd moans, organ stings, bat crack (Tone.js)
6. Season mode with roster unlocks
