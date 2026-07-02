---
description: Run ONE quality-evolution increment, stealing from the best 3D-era baseball games (MVP 2005, MLB The Show, Griffey, All-Star Baseball) and rendering it in our lofi macabre style
---

# /evolve — one increment toward the best arcade baseball game of the PS2 era

You are evolving **Psycho Mutant Baseball** toward the quality bar of the great
3D-era baseball games. Steal their *design language* — mechanics, camera
grammar, menu flow, game feel — and render every borrowed idea in this game's
PS2-lofi macabre style (CLAUDE.md is law: chunky low-poly, heavy fog, creepy
carnival not gore, 60fps on modest hardware).

## North stars (what "good" means, per system)
- **MVP Baseball 2005**: the gold standard feel — two-stage pitching meter,
  hitter's-eye batting cursor, weighty contact, snappy fielding camera cuts.
- **MLB The Show (PS2 era)**: presentation grammar — broadcast camera suite,
  batter walk-ups, replays, box scores, announcer cadence.
- **Ken Griffey Jr. / Mario Superstars**: arcade soul — instant fun, big
  readable ball physics, exaggerated player personality, unlockables.
- **All-Star Baseball / Triple Play**: mode variety — derby, season, stadium
  personality as a feature.

## The one-increment loop (do exactly this)
1. Read `EVOLUTION.md` (repo root). Pick the **single highest-value unchecked
   item** — respect phase order unless something is blocking or the user named
   a target in the command arguments: $ARGUMENTS
2. Plan it briefly, then implement using the project agents where they fit
   (gameplay-engineer for src/core, art-director for src/render, field-designer
   for fields, test-harness for verification, balance-analyst for tuning).
3. **One mechanic per increment.** Resist scope creep; note discovered ideas as
   new unchecked items in `EVOLUTION.md` instead of building them now.
4. Verify: `npm test` after ANY core change (include the JSON reports in your
   summary); screenshot the dev server for ANY visual change and look at it
   with a critical art-director eye before calling it done.
5. Check the item off in `EVOLUTION.md` with a one-line note of what shipped.
6. Commit with a descriptive message and push.

## Non-negotiables (from CLAUDE.md, restated because they get violated)
- `src/core` stays pure and deterministic (all randomness via `this.rng`;
  `Math.random()` is renderer-only). The sim must keep passing on all 3 seeds
  with batting avg .250–.380, 3–20 runs, 3–8 minute games.
- No meshes allocated in the render loop; reuse geometries/materials; prefer
  fewer, chunkier meshes. NO modern PBR, no smooth normals, no high-res assets.
- Menus, HUD, cameras live in `src/render` (or a new `src/render/ui/`), never
  in core. Game modes (derby rules etc.) are core logic, tuned via constants.
- Every new screen/mode must work at 480x300 internal resolution and look
  *intentional* pixelated, not accidental.

## Style notes for borrowed ideas
When you copy a mechanic or camera, translate it: MVP's pitching meter becomes
a twitching eyeball gauge; The Show's fireworks become shrieking bats leaving
the belfry; the derby's distance tracker measures in "graves". If a borrowed
feature can't take the macabre-playful skin, it isn't ready to ship.
