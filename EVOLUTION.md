# EVOLUTION.md — the road to the best arcade baseball game of the PS2 era

Worked through by `/evolve`, one increment at a time. Phases are roughly
ordered by value; items within a phase can be reordered when it makes sense.
When an increment ships, check it off with a one-line note. Add new ideas as
unchecked items — never build them mid-increment.

## Phase A — Front end & game modes (the game needs a face)
- [x] **A1. Title screen + main menu.** ✅ Shipped: wobble logo over a random-field
      beauty orbit, keyboard+mouse menu (Quick Match live; Derby/Options/Season
      locked with flavor lines), inline field cycler with loading cut,
      menu → playing → postgame → menu state machine in src/render/main.js +
      new src/render/menu.js. Post-game overlay replaces the old refresh flow.
- [x] **A2. Team & field select.** ✅ Shipped: roster cards with ▰▱ stat bars +
      gimmick taglines (new data in constants.js), floating spotlit podium with
      a stat-derived 3D mutant turntable, field cards with palette chips;
      choosing a team personalizes the postgame (VICTORY/DEFEAT headline).
      Fixed a same-keydown-tunneling bug across stacked screens (defaultPrevented
      guard). New src/render/select.js.
- [x] **A3. Home Run Derby.** ✅ Shipped: derby mode in core (10 outs, grooved
      pitches, derby-only HR threshold + power boost, distance in graves with
      NEW LONGEST callouts), team select reused as slugger select, derby HUD +
      tally screen, harness/derby.js wired into npm test (2 seeds). Auto-batter
      gets 0-3 HR; near-perfect play ~29 — big skill ceiling, arcade-correct.
- [x] **A4. Options screen.** ✅ Shipped: difficulty presets (PUSHOVER/MIDNIGHT
      LEAGUE/NIGHTMARE — flight + timing-window multipliers in core constants,
      picked at Game construction), picture sizes (480/640/320 internal res),
      HAUNTED TV CRT overlay (CSS scanlines + vignette), controls reference,
      localStorage persistence. New src/render/options.js.
- [x] **A5. Post-game ceremony.** ✅ Shipped: line score + per-player stats
      tracked in core (with new harness invariants: line score sums to final,
      ABs credited), box-score table by inning with R/H, MVP mutant chosen by
      hitScore aggregate and rotated on the spotlit podium, REMATCH / LOBBY
      buttons plus R/Enter keys. Derby jump from postgame deferred (menu has it).

## Phase B — Presentation & cameras (The Show's broadcast grammar)
- [x] **B1. Camera suite.** ✅ Shipped: named cameras with hard cuts in
      updateCamera() — DUEL (CF broadcast shot during the windup, cuts back to
      BATTING just before release), BALL-CHASE (swoops after hits/outs),
      HOMER-CAM (low angle tracking the blast), BEAUTY (slow pan on side
      retired). All five verified via forced-state camera-mode probes.
- [x] **B2. Instant replay.** ✅ Shipped: preallocated Float32Array ring buffer
      (240 ticks of ball+bat transforms, zero per-tick allocation), replays
      homers and side-retiring plays once from a low cinematic cam while the
      sim pauses; blinking ◉ REPLAY tag + forced scanline shimmer, CRT state
      restored per options after. Also added synchronous debug stepping
      (__advance/__swing) that makes headless browser verification reliable.
- [x] **B3. Announcer ticker.** ✅ Shipped: ☠ PMB SPORTS bottom strip, booth
      lines per play kind (homer/hit/walk/out/strike/ball/foul/sideout/final),
      field-flavored homer calls + ambient color commentary from a new
      "announcer" block in each field JSON (the Undergut announcer is indeed
      holding his nose). New src/render/announcer.js.
- [ ] **B4. Batter walk-ups.** Name card slides in with stat bars and gimmick
      line; batter does a 1s idle flourish (extra arms crack knuckles in
      sequence). The Show ritual, mutant flavor.
- [ ] **B5. Crowd.** Billboard-sprite mutant crowd rows where the field wants
      them (drive-in car roofs, web cocoons that sway). Two states: murmur
      sway, roar bounce on hits/homers. Budget: one instanced mesh per field.
- [ ] **B6. Broadcast wipes.** Inning-change cards ("TOP 3 — THE UNDERGUT")
      with a field-palette wipe transition. Score bug pulses on runs.

## Phase C — Mechanics depth (MVP 2005's hands)
- [ ] **C1. Player pitching.** Choose pitch type + aim in the zone, then an
      MVP-style two-click meter (power → accuracy) drawn as a twitching eyeball
      gauge. Miss the accuracy click and the pitch sails. CPU batter already
      exists (harness auto-batter moves into core as the AI).
- [ ] **C2. Fielding v1 (roadmap #1).** Fly balls catchable from hitScore +
      loft + spray; chunky fielder mutants converge with simple run cycles;
      catch probability + error chance (chaos stat) resolved in core, animated
      in render. Grounders can be beaten out by batter speed.
- [ ] **C3. Swing types.** Tap = contact swing, hold = power swing (bigger
      hitScore ceiling, tighter timing window), down+swing = bunt. Griffey
      simplicity, MVP depth.
- [ ] **C4. Baserunning.** Speed stat; force-advance logic upgraded to real
      runner decisions (auto with prompts on 50/50 balls: SEND / HOLD flash).
      Steals as a pre-pitch gamble.
- [ ] **C5. Mutant chaos abilities (roadmap #3).** One signature ability each,
      proc'd off the chaos stat: Wormfather summons a worm that trips fielders,
      Split Twins get two swing windows, Old Gasper's homers set the moon on
      fire (cosmetic). Core-resolved, constants-tuned, harness-verified.
- [ ] **C6. Count tension (known gap).** Pitcher stamina + strategic ball
      mixing so walks actually happen; batter's eye highlight flashes on
      probable balls at high contact stat. Target: 1–4 walks/game across seeds.
- [ ] **C7. Difficulty-aware CPU.** CPU batting/pitching skill scales with the
      Options difficulty; rubber-band lightly in arcade fashion (down 3 in the
      9th... I mean 3rd? chaos stat procs rise).

## Phase D — Feel, audio & juice (Griffey's soul)
- [ ] **D1. Audio pass 1 (roadmap #5, Tone.js).** Bat crack (pitched by
      hitScore), organ stings on strikeouts/homers, lofi crowd moan bed,
      UI blips. Per-field ambient loop (sewer drips, drive-in static, web wind).
- [ ] **D2. Contact juice.** 2-tick hitstop on contact, screen shake scaled by
      hitScore, chunky particle puffs (infield dirt, ecto-splat on ectoball
      fouls), ball trail streak on 90+ mph exit velocity equivalents.
- [ ] **D3. Animation upgrade.** Real windup (leg kick, arm whip), batter
      stride + follow-through, fielder run cycle — all chunky 4-6 keyframe
      poses, no smoothing that kills the lofi charm.
- [ ] **D4. HUD reskin.** Proper PS2 broadcast score bug (corner box: team
      abbreviations, score, inning arrow, count dots, base diamond), pitch-type
      flash ("ECTOBALL...") on release, "GRAVE DIGGER" style hit callouts.
- [ ] **D5. CRT option.** Scanlines + slight barrel distortion + phosphor
      bloom as a cheap post shader, off by default, sold as "HAUNTED TV MODE".

## Phase E — Longevity (All-Star Baseball's spine)
- [ ] **E1. Season mode lite (roadmap #6).** 6-game season, standings, stat
      leaders, field rotation; unlock the locked menu item.
- [ ] **E2. Unlockables.** Hidden mutants and fields earned by feats (win a
      derby in the Undergut without a single splash-zone foul...). Griffey-era
      cheat-code energy; store progress in localStorage.
- [ ] **E3. Stats & records.** Career homer distances, per-mutant batting
      averages, a RECORDS screen written like gravestone epitaphs.

## Parking lot (ideas noticed, not yet scheduled)
- In-game batter/pitcher models should use the select-screen appearance mapping
  (appearanceFor in main.js) so the mutant at the plate is the roster mutant
- A third team ("The Flooded Chapel Choir"?) now that team select exists
- Weather/time variants per field (blood-moon eclipse innings, sewer fog-outs)
- Rivalry intros: teams jaw at each other over home plate before game 1
- Photo mode with fixed lofi filters
- Two-player local (shared keyboard halves)
