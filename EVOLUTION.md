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
- [x] **B4. Batter walk-ups.** ✅ Shipped: gold-edged name card slides in on
      every new batter (team, name, gimmick, stat bars — statBlocks shared
      from select.js), auto-hides after ~2.5s; batter does a knuckle-crack
      shimmy during the windup. Works in derby too (one card for the slugger).
- [x] **B5. Crowd.** ✅ Shipped: one InstancedMesh of chunky mutant silhouettes
      per field, placed by a new "crowd" block in each field JSON (car roofs at
      the drive-in, cultist rows in the boneyard, pipe-dwellers in the sewer,
      cocoon fans in the web). Murmur sway idle, roar bounce for ~2s on hits
      and homers; animates in the lobby too. Phase B complete.
- [x] **B6. Broadcast wipes.** ✅ Shipped: skewed field-palette band sweeps the
      screen on every half-inning change with a "BOTTOM 1 — THE UNDERGUT" card
      riding it; the HUD score line pulses when runs score. (Taken before B5 —
      smaller, and it completes the between-innings loop with B1's beauty cam.)

## Phase C — Mechanics depth (MVP 2005's hands)
- [x] **C1. Player pitching.** ✅ Shipped: when your team fields, the sim holds
      while you call the pitch — aim with the mouse, 1/2/3 picks the pitch,
      then a two-click eyeball meter (power sweep, then land on the pupil for
      accuracy; misses scatter the target via core rng). Core accepts a
      pitch plan input; the CPU batter moved INTO core (game.autoBatterInput,
      tuned via C.CPU_BATTER) and now drives both the harness and live
      opponents. Balance recentered (~.33 mean BA across 7 seeds).
- [x] **C2. Fielding v1 (roadmap #1).** ✅ Shipped: core fielding layer — clean
      outs can be BOOTED into error singles (scaled by fielding team's chaos),
      near-threshold hits get ROBBED at the gap (C.FIELDING), out verbs vary by
      trajectory (skies/lines/grounds out), lastPlay.fielded feeds the booth.
      Four gray fielder mutants hold posts and the two nearest converge on
      struck balls with a chunky run bob. Side effect: all 5 check seeds now
      inside the .279–.365 BA band. Beat-out-by-speed deferred to C4 (speed stat).
- [x] **C3. Swing types.** ✅ Shipped: SPACE/click = contact, X/right-click =
      power cut (hitScore x1.22, timing window x0.68), B = bunt (huge window,
      resolves as a sacrifice with runners on and <2 outs — runners advance,
      third scores — else an easy out). C.SWING_TYPES tunable.
- [x] **C4. Baserunning.** ✅ Shipped: speed stat on all 12 mutants (Rad-Rat
      Rickey .95, Old Gasper .15), bases hold real runner refs, fast runners
      stretch third into home on hits (C.RUN), and S during the windup sends
      the lead runner — swipe a bag, steal home, or get gunned down (booth
      lines included). SEND/HOLD prompts deferred; auto-decisions by speed.
- [x] **C5. Mutant chaos abilities (roadmap #3).** ✅ Shipped: all 12 mutants
      have signature abilities (C.ABILITIES) — passives (Six Arms reach,
      Wet Read, Four Eyes, Borrowed Eyes, Glow Legs/Moth Dance on the bases,
      Two Half-Lives) and chaos-gated procs (TWO SWINGS best-of-two roll,
      GRAVE WEIGHT roll floor, SILENT APPEAL turns called strikes into balls).
      WORMFIELD doubles errors/kills robs on Wormfather ABs. Old Gasper's
      MOONFIRE homers set the whole sky burning (fog/background lerp).
      Verified: all proc types fire across 30 sim games.
- [x] **C6. Count tension (known gap).** ✅ Shipped: pitcher stamina decays per
      pitch (tired arms miss the zone), count-aware pitching (chase pitches
      when ahead, forced grooves at 3 balls), count-aware CPU takes (protects
      at 2 strikes, spits at 3 balls), and a batter's-eye telegraph — the zone
      flashes green mid-flight on probable balls, scaled by contact stat.
      Walks went from ~0 to ~2.3/game mean across 7 seeds (0–7 range).
- [x] **C7. Difficulty-aware CPU.** ✅ Shipped: CPU batter error scales with
      difficulty (cpuErrMult — verified ranking: pushover 12.8 CPU hits/game,
      nightmare 18.8), and the arcade rubber band raises the player team's
      chaos procs when trailing by 3+ in the final inning (C.RUBBER_BAND).
      Phase C complete — the game now has hands.

## Phase D — Feel, audio & juice (Griffey's soul)
- [x] **D1. Audio pass 1 (roadmap #5, Tone.js).** ✅ Shipped: all-synthesized
      lofi kit in src/render/audio.js — bat crack pitched by hitScore
      (MembraneSynth), haunted organ stings (homer fanfare, diminished
      strikeout dread, walk-up hits), brown-noise crowd bed that swells on the
      roar, per-field ambient beds (sewer drip loop, drive-in static, web
      wind), SOUND on/off in options. Unlocks on first user gesture per
      browser policy. NOTE: synthesized sound needs human ears — headless
      verification covered wiring + no-exceptions only.
- [x] **D2. Contact juice.** ✅ Shipped: hitstop scaled by hitScore (2–6 ticks,
      verified frozen-then-resumed), screen shake decaying over 18 frames on
      top of any live camera, preallocated 36-point dirt burst at contact
      (ecto-green splat on ectoball fouls), 7-ghost afterimage trail on
      hitScore > .85 screamers.
- [x] **D3. Animation upgrade.** ✅ Shipped: makeMutant exposes body/head/legs/
      arms parts; pitcher windup in seven quantized snaps (rock → gather with
      leg kick + glove up → whip), batter coil-and-stride into a hip-fired
      follow-through, fielder arm pump on the run. All poses snapped to chunky
      keyframes via a quantizer — no smooth tweens. Phase D complete.
- [x] **D4. HUD reskin.** ✅ Shipped: corner broadcast score bug (abbrs, scores,
      inning arrow, mini base diamond, count + out dots, derby variant), slim
      center HUD, pitch-type flash on release ("ECTOBALL..."), and stamp
      callouts: GRAVE DIGGER! / MOONFIRE! / BONE RATTLER! / DAYLIGHT ROBBERY! /
      BUTCHERED! / HOME INVASION!
- [x] **D5. CRT option.** ✅ Satisfied by A4's HAUNTED TV MODE (CSS scanlines +
      vignette, off by default, forced on during replays). A true post shader
      with barrel distortion remains an optional upgrade if the art-director
      ever wants it — parked.

## Phase E — Longevity (All-Star Baseball's spine)
- [x] **E1. Season mode lite (roadmap #6).** ✅ Shipped: 6-game campaign
      (src/render/season.js, localStorage) — pick your team, shuffled field
      rotation, W-L record, league leaders aggregated across games, campaign
      verdict (CHAMPIONS / RESPECTABLE HAUNTING / THE WORMS WON), CONTINUE
      SEASON from the postgame. The Commissioner no longer forbids it.
- [x] **E2. Unlockables.** ✅ Shipped: THE COMMISSIONER'S OFFICE — a hidden
      fifth ballpark (giant desk, towering filing cabinets, fluorescent panel
      moon, the red phone) earned by hitting 5+ homers in one derby, or by
      typing WORMS on the title screen (the old ways still work). Hidden
      fields self-gate via "hidden": true + src/render/unlocks.js.
      ALL PHASES COMPLETE — the original backlog is finished.
- [x] **E3. Stats & records.** ✅ Shipped: the groundskeeper's book
      (src/render/records.js, localStorage) — longest derby ball in graves,
      most homers in one game, career grave digger, games witnessed — shown as
      tombstone epitaph cards from a new RECORDS menu item; auto-noted from
      every match and derby postgame.

## Phase F — live feel iterations (user-directed, 2026-07-02)
- [x] **F1. Floaty ball + cavernous parks.** ✅ FIELD_SCALE 60→100 with renderer
      PROP_SCALE stretching authored fields; flightTicks up ~80% (fastball
      1.6s, ecto 2.4s), gravity softened (9 u/s², gentler gravMults), more
      drift ease. Games now 4.5–6.4 min. Balance bands re-verified.
- [x] **F2. Real batting stance + low camera.** ✅ Bat cocked over the back
      shoulder with an idle waggle; batting cam dropped from y7.5 to
      catcher's-eye 4.7.
- [x] **F3. Broadcast QoL batch.** ✅ Outfielders lope (20 u/s), full-body swing
      uncoil (hips, legs, counter-rotating head), hits cut to a tabletop
      ISOMETRIC cam framing the runner's line, the batter drops the bat and
      runs to first, and first/third base coaches windmill in their boxes.

- [x] **F4. Twelve teams, twelve parks.** ✅ Core takes any two roster slugs
      (homeKey/awayKey; playerSide drives the rubber band). ROSTERS expanded to
      12 themed teams x 6 mutants, each with a home park (quick match defaults
      to yours; a random rival visits). Seven new stadiums shipped: Isotope
      Alley, Flooded Chapel, Abattoir Fairgrounds, Static Hill, Taxidermy
      Hall, Icebox, Compost Colosseum — plus the original four and the hidden
      Commissioner's Office = 12. New mutants have no signature abilities yet
      (parked below).

- [x] **F5. Deep detail pass, all twelve parks.** ✅ Child-less prop entries now
      render as InstancedMesh (one draw call at any count — budget rewritten in
      fields/README.md), then three parallel field-designer crews tripled every
      park's dressing (league total 75 → 219 prop entries): crypts, crow-fences
      and grave candles; collapsed second screens and glowing popcorn; the Rat
      King's throne and rising bile bubbles; dew-lit webs and wrapped bundles;
      stuck clocks and PRODUCE banners; geiger towers and venting chimneys;
      sunken domes and floating candles; a pig carousel and funhouse grin
      (abattoir lighting brightened); static campfires and a broadcast van;
      a rearing bear under chandeliers; hook rows and the EXIT door to
      nowhere; wheelbarrow graveyards and rejected carrots. +2 themed
      announcer lines per park. All 12 verified live: 33–135 draw calls.

- [x] **F6. Pause menu.** ✅ Escape during play freezes the sim dead (input
      gated, world holds still) and opens PAUSED: Resume / Options / Quit to
      the Lobby. Options returns to the pause overlay, not the lobby; Escape
      backs all the way out. Verified with 8 live assertions.

- [x] **F7. Controller support.** ✅ Gamepad API, standard mapping: left stick
      is an absolute bat/aim cursor (menus navigate on stick edges + d-pad),
      A swing/confirm, X power cut (R = rematch on tallies), B bunt/back,
      Y steal, Start pause, LB/RB cycle pitch types during the call. Buttons
      synthesize the keyboard's own events so every screen works identically.
      Caveat: browsers don't count pad input as a user gesture — one real
      click/keypress is still needed to unlock audio.

- [x] **F8. Launch angles, clear air, the diamond.** ✅ Hit flight rebuilt on a
      launch-angle model (-8° choppers to ~72° towers; loft response sharpened
      in core so undercuts genuinely pop it up — verified apexes: chop 3,
      level 33–64, undercut 72–106). Fog density now compensates for park
      scale plus a clarity trim (~half the old murk). Every infield gets a
      bright contrasting clay diamond with an inner grass cutout.

- [x] **F9. The race to first + a real diamond.** ✅ Contact plays now unfold:
      the ball flies, the nearest fielder gathers it (fly balls settle into
      the glove), and on ground outs he FIRES to first — verified the throw
      beats the runner by ~20 ticks on outs while singles never draw a throw.
      Infield rebuilt to real geometry: bases form a true 45° square with
      second beyond the mound, clay skin arc, manicured grass interior, dirt
      basepaths and base cutouts, raised mound (pitcher stands on it), home
      circle. Runner speed and hit-resolve retimed for the race.

- [x] **F10. Bright on-brand grass + real aerodynamics.** ✅ All twelve parks
      got hand-picked vivid grass (radioactive lawn, frosted mint, drowned
      seaweed, regulation office carpet...). Batted balls now fly with air
      drag (verified 60→48 u/s decay mid-flight) and hops that bleed pace;
      throws are true solved projectiles — hot release, gravity arc,
      decelerating into the glove. Race-to-first timing re-verified.

- [x] **F11. Diamond corrections + the full nine.** ✅ Skin arc rebounded so it
      sweeps first-around-second-to-third and stops short of home; explicit
      dirt basepath strips on all four sides. Defense fields a proper unit:
      1B/2B/SS/3B at real positions, LF/CF/RF deep, a crouched catcher and a
      hunched umpire behind the plate — offset so the batting camera looks
      over them broadcast-style without ever blocking the zone.

- [x] **F12. Field-select grid + closer mound.** ✅ Stadium select rebuilt as a
      4-column card grid (palette strips, gold-framed selection, 2D arrow nav)
      with a featured caption: name, tagline, HOME OF THE <team>. The mound
      moved visually to 62% of plate->second (real proportions) with the
      pitch's rendered flight z-compressed to match — sim untouched, ball
      reads closer and calmer.

- [x] **F13. Presentation megabatch.** ✅ Fielders and catcher wear mitts; a
      full four-umpire crew (home + 1B/2B/3B); tiered grandstands down both
      foul lines with the crowd seated on the steps facing the game; eerie
      per-park cloud layers drifting over the eight outdoor stadiums (toxic
      billows at Isotope Alley, indoor parks flagged and skipped); breathing
      moonlight + humming park lamps (dynamic light pulses); the ball is a
      pixel-stitched Lambert baseball that spins in flight (the ectoball
      barely spins — that's the horror); and a 34-panel outfield wall ringed
      with glowing ads: GRAVE DANGER INSURANCE, ISOTOPE COLA, WORM & SONS...

- [x] **F14. Baseball logic + spectacle.** ✅ Smaller ball (0.32). Double-deck
      grandstands with a facade, fans waving pennant flags and hoisting
      hand-painted signs (BOO! / DIG! / ☠ 4EVER). Derby strips to batter and
      pitcher only. Homer cam chases the ball over the wall and shows the
      landing (homers carry harder + fly on compressed movie-time so they land
      inside the resolve — verified 427-unit blast, wall at 236, lands tick
      225). New effects: fireworks volleys over the wall on homers, lamp
      surges, a light dip when someone strikes out, glove-pop dust on gathers,
      dirt spray on slides. REAL fielding logic researched and implemented:
      one chaser picked per play (no mind-changing), 1B takes the bag for the
      throw, free middle infielder covers second, 3B holds his corner, SS
      lines up the cutoff, outfielders back up the play from depth.

## Parking lot (ideas noticed, not yet scheduled)
- Signature abilities for the 60 new mutants (C.ABILITIES only covers the
  original twelve)
- Deeper rules sim in core: double plays, tag-ups on flies, force-out chains
  (the positioning layer is ready for it)
- balance-analyst: the .250–.380 BA band is tighter than seed variance allows
  (~40 swings/game → ±.07 std). Build a multi-seed averaging harness mode and
  re-express the target as a mean across ≥10 seeds.
- In-game batter/pitcher models should use the select-screen appearance mapping
  (appearanceFor in main.js) so the mutant at the plate is the roster mutant
- A third team ("The Flooded Chapel Choir"?) now that team select exists
- Weather/time variants per field (blood-moon eclipse innings, sewer fog-outs)
- Rivalry intros: teams jaw at each other over home plate before game 1
- Photo mode with fixed lofi filters
- Two-player local (shared keyboard halves)
