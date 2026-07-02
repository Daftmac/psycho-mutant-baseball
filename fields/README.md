# Field JSON schema

Fields are pure data. The renderer (`src/render/main.js`) builds the diamond
(ground, infield, foul lines, bases, plate) on every field from the palette,
then spawns everything in `props`. Load a field with `?field=<filename>`.

Coordinate system: home plate at origin, pitcher's mound at `z = -60`
(`C.FIELD_SCALE`), outfield further into `-z`, camera behind the plate at `+z`.
Y is up. Keep it chunky: low segment counts, few big meshes, palette colors only.

## Top level

```jsonc
{
  "name": "The Boneyard",
  "tagline": "Home of the Gravemound Ghouls. Dig in.",
  "palette": {                 // named colors; REQUIRED keys: sky, fog, grass, dirt, chalk
    "sky": "#12091a", "fog": "#241230", "grass": "#26301d",
    "dirt": "#4a3826", "chalk": "#cfc9b8"
    // ...plus any custom keys your props reference
  },
  "fogDensity": 0.011,         // FogExp2 — heavier = spookier, 0.008–0.03 typical
  "lights": {                  // optional; defaults are the boneyard's moody purple/red
    "hemi": { "sky": "#8877aa", "ground": "#221122", "intensity": 0.7 },
    "dir":  { "color": "#ff5555", "intensity": 0.8, "pos": [-40, 60, -80] }
  },
  "props": [ /* PropSpec[] — drawn in order */ ]
}
```

## PropSpec

```jsonc
{
  "shape": "box",              // box | cylinder | cone | sphere | plane
  "size": [4, 7, 1.2],         // box:[w,h,d] cylinder:[rTop,rBot,h] cone:[r,h] sphere:[r] plane:[w,h]
  "segments": 6,               // radial segments — KEEP LOW (4–12), jank is charm
  "color": "stone",            // palette key or "#hex"
  "glow": true,                // unlit MeshBasicMaterial: moons, neon, screens, sludge
  "inside": true,              // render interior faces (tunnels, domes) — use with big cylinders/spheres
  "open": true,                // open-ended cylinder (pipes, tunnels)

  "place": "scatter",          // single (default) | ring | scatter
  // place: "single"
  "pos": [-70, 85, -260],
  // place: "ring" — count instances evenly on a circle of `radius` at height `y`
  "count": 12, "radius": 130, "y": 0, "arc": [0, 2], "zOff": 0, "lookCenter": true,
  // place: "scatter" — count instances randomly in an annulus fan
  "count": 44, "ring": [120, 210], "arc": [0.15, 0.85], "y": 2.5, "zOff": -10,

  // any placement
  "rot": [0, 0, 0],            // radians, applied before jitter
  "yawJitter": 0.3,            // ± random y-rotation
  "tiltJitter": 0.08,          // ± random z-rotation (sagging, leaning)
  "scaleJitter": 0.25,         // ± random uniform scale fraction

  "children": [                // parts attached to EVERY instance (composite props)
    { "shape": "cylinder", "size": [0.15, 0.4, 7], "color": "tree",
      "count": 3,              // copies per parent
      "pos": [0, 3, 0],        // local offset
      "stack": 1.5,            // extra y per copy index (ladders, branches)
      "posJitter": [0, 0, 0],  // ± per-axis local offset
      "rot": [0, 0, 0],
      "rotJitter": [0, 0, 1.1] }
  ]
}
```

**Angles**: `arc` values are in units of PI, mapped so the outfield fan is
`[0.15, 0.85]`-ish and a full surrounding circle is `[0, 2]`.

**Performance budget**: aim for < ~150 meshes per field. One prop entry shares
one geometry + one material across all its instances — prefer one entry with
`count: 40` over 40 entries.

**Vibe rules** (see CLAUDE.md): macabre but playful, small palettes, heavy fog,
no realism. Every field needs a personality and one signature landmark
(the Boneyard's blood moon, a sewer's glowing sludge main...).
