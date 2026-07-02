// src/render/main.js
// RENDERING SHELL — Three.js, PS2-lofi style. No game rules here.
// The PS2 look: render at low internal resolution, upscale with pixelation,
// flat/vertex-ish lighting, heavy fog, chunky low-poly geometry.

import * as THREE from 'three';
import { Game } from '../core/game.js';
import { C, ROSTERS } from '../core/constants.js';
import { createMenu } from './menu.js';
import { createTeamSelect, createFieldSelect, statBlocks } from './select.js';
import { createOptions } from './options.js';
import { createAnnouncer } from './announcer.js';
import { audio } from './audio.js';
import { loadSeason, saveSeason, newSeason, recordGame, createSeasonScreen, SEASON_GAMES } from './season.js';
import { loadRecords, noteMatch, noteDerby, createRecordsScreen } from './records.js';
import { UNLOCKS, unlock, visibleFields } from './unlocks.js';

// ---------- field loading ----------
// Fields are pure data (fields/*.json — schema in fields/README.md).
// Pick one with ?field=<name>; with no param the menu boots on a random field.
const FIELDS = import.meta.glob('../../fields/*.json', { eager: true });
const FIELD_NAMES = Object.keys(FIELDS).map((k) => k.match(/([^/]+)\.json$/)[1]).sort();
// hidden fields gate themselves behind unlocks (fields/*.json "hidden": true)
const HIDDEN_BY_FIELD = {};
for (const key of FIELD_NAMES) {
  if (FIELDS[`../../fields/${key}.json`].default.hidden) HIDDEN_BY_FIELD[key] = key;
}
const unlockedFieldNames = () => visibleFields(FIELD_NAMES, HIDDEN_BY_FIELD);
const urlField = new URLSearchParams(location.search).get('field');
const bootPool = unlockedFieldNames();
const fieldName = urlField && FIELDS[`../../fields/${urlField}.json`]
  ? urlField
  : bootPool[Math.floor(Math.random() * bootPool.length)];
const field = FIELDS[`../../fields/${fieldName}.json`].default;

// ---------- setup ----------
const LOW_W = 480, LOW_H = 300; // internal PS2-ish resolution
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(LOW_W, LOW_H, false); // CSS upscales; image-rendering: pixelated

const scene = new THREE.Scene();
scene.background = new THREE.Color(field.palette.sky);
// fog density is authored against the 60-unit diamond; exponential fog gets
// murkier as parks grow, so compensate by the scale (plus a clarity trim)
const FOG_CLARITY = (C.FIELD_BASE_SCALE / C.FIELD_SCALE) * 0.85;
scene.fog = new THREE.FogExp2(field.palette.fog, field.fogDensity * FOG_CLARITY);

const camera = new THREE.PerspectiveCamera(55, LOW_W / LOW_H, 0.1, 600);
camera.position.set(0, 7.5, 14);
camera.lookAt(0, 2.5, -40);

const pal = (c) => field.palette[c] ?? c;

const hemi = field.lights?.hemi ?? { sky: 0x8877aa, ground: 0x221122, intensity: 0.7 };
scene.add(new THREE.HemisphereLight(new THREE.Color(pal(hemi.sky)), new THREE.Color(pal(hemi.ground)), hemi.intensity));
const dir = field.lights?.dir ?? { color: 0xff5555, intensity: 0.8, pos: [-40, 60, -80] };
const keyLight = new THREE.DirectionalLight(new THREE.Color(pal(dir.color)), dir.intensity);
keyLight.position.set(dir.pos[0], dir.pos[1], dir.pos[2]);
scene.add(keyLight);

// materials/geometries are cached & shared — never allocate in the render loop
const matCache = new Map();
function cachedMat(color, glow, side) {
  const key = `${color}|${glow}|${side}`;
  if (!matCache.has(key)) {
    matCache.set(key, glow
      // glow punches through the fog — PS2 neon-through-the-murk trick
      ? new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side, fog: false })
      : new THREE.MeshLambertMaterial({ color: new THREE.Color(color), flatShading: true, side }));
  }
  return matCache.get(key);
}
const mat = (color) => cachedMat(color, false, THREE.FrontSide);

// ---------- generic field-prop system (schema: fields/README.md) ----------
const rng = () => Math.random(); // renderer-only cosmetic randomness

function propGeometry(spec) {
  const s = spec.size, seg = spec.segments;
  switch (spec.shape) {
    case 'box':      return new THREE.BoxGeometry(s[0], s[1], s[2]);
    case 'cylinder': return new THREE.CylinderGeometry(s[0], s[1], s[2], seg ?? 6, 1, !!spec.open);
    case 'cone':     return new THREE.ConeGeometry(s[0], s[1], seg ?? 5);
    case 'sphere':   return new THREE.SphereGeometry(s[0], seg ?? 8, 6);
    case 'plane':    return new THREE.PlaneGeometry(s[0], s[1]);
    default:         return new THREE.BoxGeometry(1, 1, 1);
  }
}

function propMaterial(spec) {
  const side = spec.inside ? THREE.BackSide : spec.shape === 'plane' ? THREE.DoubleSide : THREE.FrontSide;
  return cachedMat(pal(spec.color), !!spec.glow, side);
}

// field angle convention: a = PI * v + PI, so scatter arc [0.15, 0.85]
// fans across the outfield and ring arc [0, 2] is a full circle.
const A = (v) => Math.PI * v + Math.PI;

// field JSONs are authored against a 60-unit diamond; the renderer stretches
// horizontal distances to the current FIELD_SCALE so parks grow with the game
const PROP_SCALE = C.FIELD_SCALE / C.FIELD_BASE_SCALE;

function spawnProp(spec) {
  const geo = propGeometry(spec);
  const material = propMaterial(spec);
  const spots = [];
  const place = spec.place ?? 'single';
  if (place === 'single') {
    const p = spec.pos ?? [0, 0, 0];
    spots.push([p[0] * PROP_SCALE, p[1], p[2] * PROP_SCALE]);
  } else if (place === 'ring') {
    const [a0, a1] = spec.arc ?? [0, 2];
    const radius = spec.radius * PROP_SCALE;
    for (let i = 0; i < spec.count; i++) {
      const a = A(a0 + ((a1 - a0) * i) / spec.count);
      spots.push([Math.cos(a) * radius, spec.y ?? 0, Math.sin(a) * radius + (spec.zOff ?? 0) * PROP_SCALE]);
    }
  } else { // scatter
    const [a0, a1] = spec.arc ?? [0.1, 0.9];
    for (let i = 0; i < spec.count; i++) {
      const a = A(a0 + rng() * (a1 - a0));
      const r = (spec.ring[0] + rng() * (spec.ring[1] - spec.ring[0])) * PROP_SCALE;
      spots.push([Math.cos(a) * r, spec.y ?? 0, Math.sin(a) * r + (spec.zOff ?? 0) * PROP_SCALE]);
    }
  }

  // entries WITHOUT children render as one InstancedMesh — a single draw
  // call no matter the count, so fields can drown in themed clutter
  if (!(spec.children?.length) && spots.length >= 8) {
    const imesh = new THREE.InstancedMesh(geo, material, spots.length);
    const dummy = new THREE.Object3D();
    spots.forEach(([px, py, pz], i) => {
      dummy.position.set(px, py, pz);
      dummy.rotation.set(0, 0, 0);
      if (spec.rot) dummy.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
      if (spec.lookCenter) dummy.lookAt(0, py, 0);
      if (spec.yawJitter) dummy.rotation.y += (rng() * 2 - 1) * spec.yawJitter;
      if (spec.tiltJitter) dummy.rotation.z += (rng() * 2 - 1) * spec.tiltJitter;
      dummy.scale.setScalar(spec.scaleJitter ? 1 + (rng() * 2 - 1) * spec.scaleJitter : 1);
      dummy.updateMatrix();
      imesh.setMatrixAt(i, dummy.matrix);
    });
    imesh.instanceMatrix.needsUpdate = true;
    scene.add(imesh);
    return;
  }

  // children share one geometry/material across every parent instance
  const kids = (spec.children ?? []).map((ch) => ({ ch, geo: propGeometry(ch), material: propMaterial(ch) }));

  for (const [px, py, pz] of spots) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(px, py, pz);
    if (spec.rot) m.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
    if (spec.lookCenter) m.lookAt(0, py, 0);
    if (spec.yawJitter) m.rotation.y += (rng() * 2 - 1) * spec.yawJitter;
    if (spec.tiltJitter) m.rotation.z += (rng() * 2 - 1) * spec.tiltJitter;
    if (spec.scaleJitter) m.scale.setScalar(1 + (rng() * 2 - 1) * spec.scaleJitter);
    for (const { ch, geo: cGeo, material: cMat } of kids) {
      for (let i = 0; i < (ch.count ?? 1); i++) {
        const c = new THREE.Mesh(cGeo, cMat);
        const cp = ch.pos ?? [0, 0, 0];
        c.position.set(cp[0], cp[1] + (ch.stack ? i * ch.stack : 0), cp[2]);
        if (ch.posJitter) {
          c.position.x += (rng() * 2 - 1) * ch.posJitter[0];
          c.position.y += (rng() * 2 - 1) * ch.posJitter[1];
          c.position.z += (rng() * 2 - 1) * ch.posJitter[2];
        }
        if (ch.rot) c.rotation.set(ch.rot[0], ch.rot[1], ch.rot[2]);
        if (ch.rotJitter) {
          c.rotation.x += (rng() * 2 - 1) * ch.rotJitter[0];
          c.rotation.y += (rng() * 2 - 1) * ch.rotJitter[1];
          c.rotation.z += (rng() * 2 - 1) * ch.rotJitter[2];
        }
        m.add(c);
      }
    }
    scene.add(m);
  }
}

// ---------- the diamond (built-in on every field) ----------
const D = C.FIELD_SCALE; // mound->plate distance
{
  const ground = new THREE.Mesh(new THREE.CircleGeometry(300 * PROP_SCALE, 24), mat(pal('grass')));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // ---- the infield, laid out like the real thing ----
  // Real diamonds: the bases form a SQUARE rotated 45° with home at one
  // corner; second base sits BEYOND the mound; the dirt "skin" is an arc
  // around the whole square with grass inside the basepaths, dirt cutouts
  // at the bases, a raised mound, and a dirt circle at home.
  const BASE_HALF = D * 0.625;             // half-diagonal: first base at (62.5, -62.5) for D=100
  const clayMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(pal(field.palette.diamond ? 'diamond' : '#b98d5a')),
    flatShading: true,
  });

  // infield skin: the clay arc sweeps first -> behind second -> third, and
  // stops well short of home (real skins don't run behind the plate)
  const skin = new THREE.Mesh(new THREE.CircleGeometry(D * 0.82, 24), clayMat);
  skin.rotation.x = -Math.PI / 2;
  skin.position.set(0, 0.03, -D);
  scene.add(skin);

  // dirt basepaths: explicit strips along all four sides of the square
  {
    const SIDE = BASE_HALF * Math.SQRT2; // side length of the base square
    const strip = new THREE.PlaneGeometry(6, SIDE + 10);
    const mkPath = (x, z, rotZ) => {
      const p = new THREE.Mesh(strip, clayMat);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = rotZ;
      p.position.set(x, 0.045, z);
      scene.add(p);
    };
    mkPath(BASE_HALF / 2, -BASE_HALF / 2, Math.PI / 4);        // home -> first
    mkPath(BASE_HALF / 2, -BASE_HALF * 1.5, -Math.PI / 4);     // first -> second
    mkPath(-BASE_HALF / 2, -BASE_HALF * 1.5, Math.PI / 4);     // second -> third
    mkPath(-BASE_HALF / 2, -BASE_HALF / 2, -Math.PI / 4);      // third -> home
  }

  // grass interior inset from the basepaths (the manicured square)
  {
    const w = 6; // basepath width
    const cy = -BASE_HALF; // square center z
    const k = 1 - w / BASE_HALF;
    const iy = 0.06;
    const pt = (x, z) => [x * k, iy, cy + (z - cy) * k];
    const [p0, p1, p2, p3] = [pt(0, 0), pt(BASE_HALF, -BASE_HALF), pt(0, -2 * BASE_HALF), pt(-BASE_HALF, -BASE_HALF)];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      ...p0, ...p1, ...p2,
      ...p0, ...p2, ...p3,
    ]), 3));
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, mat(pal('grass'))));
  }

  // dirt cutouts at the three bases + the home-plate circle
  for (const [cx, cz, r] of [
    [BASE_HALF, -BASE_HALF, 7], [0, -2 * BASE_HALF, 7], [-BASE_HALF, -BASE_HALF, 7], [0, 0, 11],
  ]) {
    const cut = new THREE.Mesh(new THREE.CircleGeometry(r, 12), clayMat);
    cut.rotation.x = -Math.PI / 2;
    cut.position.set(cx, 0.08, cz);
    scene.add(cut);
  }

  // the mound: actually raised, with its own clay crown
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 9, 1.4, 12), clayMat);
  mound.position.set(0, 0.7, -D);
  scene.add(mound);

  // foul lines
  for (const side of [-1, 1]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 220 * PROP_SCALE), mat(pal('chalk')));
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = side * Math.PI / 4;
    line.position.set(side * 78 * PROP_SCALE, 0.04, -78 * PROP_SCALE);
    scene.add(line);
  }

  // bases at the true square corners (1st, 2nd, 3rd)
  window.__bases = [];
  const basePos = [[BASE_HALF, -BASE_HALF], [0, -2 * BASE_HALF], [-BASE_HALF, -BASE_HALF]];
  for (const [x, z] of basePos) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 2.6), new THREE.MeshLambertMaterial({ color: new THREE.Color(pal('chalk')), flatShading: true }));
    b.position.set(x, 0.25, z);
    b.rotation.y = Math.PI / 4; // bags sit square to the basepaths
    scene.add(b);
    window.__bases.push(b);
  }
  // home plate
  const plate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 2.6), mat(pal('chalk')));
  plate.position.set(0, 0.1, 0);
  scene.add(plate);
}

// field props from JSON
for (const spec of field.props ?? []) spawnProp(spec);

// ---------- crowd: one InstancedMesh of swaying mutant silhouettes ----------
let crowd = null;
if (field.crowd) {
  const cs = field.crowd;
  const geo = new THREE.BoxGeometry(1.3, 2.0, 0.55);
  const cMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(pal(cs.color ?? '#221a2e')), flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, cMat, cs.count);
  const base = [];
  const [a0, a1] = cs.arc ?? [0.1, 0.9];
  for (let i = 0; i < cs.count; i++) {
    const a = A(a0 + rng() * (a1 - a0));
    const r = (cs.ring[0] + rng() * (cs.ring[1] - cs.ring[0])) * PROP_SCALE;
    base.push({
      x: Math.cos(a) * r, y: cs.y ?? 1, z: Math.sin(a) * r + (cs.zOff ?? 0) * PROP_SCALE,
      s: 0.8 + rng() * 0.5, ry: rng() * Math.PI * 2, ph: rng() * Math.PI * 2,
    });
  }
  scene.add(mesh);
  crowd = { mesh, base, excite: 0 };
}

const _crowdDummy = new THREE.Object3D();
let crowdT = 0;
function updateCrowd() {
  if (!crowd) return;
  crowdT++;
  if (crowd.excite > 0) {
    crowd.excite--;
    if (crowd.excite === 0) audio.crowdSwell(false);
  }
  const roaring = crowd.excite > 0;
  const amp = roaring ? 1.0 : 0.16;
  const speed = roaring ? 0.28 : 0.06;
  for (let i = 0; i < crowd.base.length; i++) {
    const b = crowd.base[i];
    _crowdDummy.position.set(b.x, b.y + Math.abs(Math.sin(crowdT * speed + b.ph)) * amp, b.z);
    _crowdDummy.rotation.set(0, b.ry, 0);
    _crowdDummy.scale.setScalar(b.s);
    _crowdDummy.updateMatrix();
    crowd.mesh.setMatrixAt(i, _crowdDummy.matrix);
  }
  crowd.mesh.instanceMatrix.needsUpdate = true;
}

// ---------- mutants ----------
function makeMutant({ skin, extraArms = 0, headScale = 1 }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 1), mat(skin));
  body.position.y = 2.2;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.1 * headScale, 1.1 * headScale, 1.1 * headScale), mat(skin));
  head.position.y = 4.1;
  g.add(head);
  // glowing eyes
  for (const dx of [-0.25, 0.25]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.1), new THREE.MeshBasicMaterial({ color: 0xffcc22 }));
    eye.position.set(dx * headScale, 4.2, 0.56 * headScale);
    head.attach ? head.add(eye) : g.add(eye);
    eye.position.set(dx * headScale, 0.1, 0.56 * headScale);
  }
  const legs = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.9), mat(0x1c1622));
  legs.position.y = 0.6;
  g.add(legs);
  const arms = [];
  for (let i = 0; i <= extraArms; i++) {
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.8, 0.4), mat(skin));
      arm.position.set(side * 1.15, 2.6 - i * 0.8, 0);
      arm.rotation.z = side * 0.25;
      g.add(arm);
      arms.push(arm);
    }
  }
  g.userData.parts = { body, head, legs, arms };
  return g;
}

// quantize pose time so limbs snap between chunky keyframes (lofi charm)
const chunky = (v, steps = 6) => Math.round(v * steps) / steps;

const batter = makeMutant({ skin: 0x6fae5c, extraArms: 1 }); // sickly green, four arms
batter.position.set(-2.6, 0, 1.2);
batter.rotation.y = Math.PI / 2;
scene.add(batter);

const bat = new THREE.Group();
const batMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 4.4, 6), mat(0x7a5a33));
batMesh.position.y = 2.2;
bat.add(batMesh);
bat.position.set(-2.35, 3.05, 1.35); // cocked over the back shoulder, like a hitter
bat.rotation.set(0.55, 0, 0.3);
scene.add(bat);

const pitcher = makeMutant({ skin: 0x8a6fb0, headScale: 1.5 }); // bulbous purple dome
pitcher.position.set(0, 1.4, -D); // up on the mound
scene.add(pitcher);

const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xeeeae0 }));
scene.add(ball);

// ---------- the defense: a proper nine (minus pitcher and catcher here) ----------
// 1B, 2B, SS, 3B around the square; LF, CF, RF deep — authored in world units
const FIELDER_POSTS = [
  [58, -80],    // first base
  [30, -105],   // second base
  [-30, -105],  // shortstop
  [-58, -80],   // third base
  [-63, -158],  // left field
  [0, -187],    // center field
  [63, -158],   // right field
];
const fielders = FIELDER_POSTS.map(([x, z]) => {
  const m = makeMutant({ skin: 0x4a5568 }); // drab away-grays; every mutant fields in gray
  m.position.set(x, 0, z);
  m.rotation.y = Math.PI; // facing the plate
  scene.add(m);
  return { mesh: m, home: { x, z }, phase: Math.random() * Math.PI * 2 };
});

// the battery's other half and the law: catcher crouched behind the plate,
// umpire looming behind him — offset right so they never block the zone
const catcher = makeMutant({ skin: 0x7a4a3a });
catcher.position.set(1.7, 0, 7.2);
catcher.scale.set(1, 0.58, 1); // deep crouch
catcher.rotation.y = Math.PI;  // facing the mound
scene.add(catcher);

const umpire = makeMutant({ skin: 0x23232c, headScale: 1.2 });
umpire.position.set(2.9, 0, 10.4);
umpire.scale.set(1.05, 0.82, 1.05); // hunched over the catcher's shoulder
umpire.rotation.y = Math.PI;
scene.add(umpire);

// first and third base coaches, living in their boxes
const coaches = [0, 2].map((baseIdx) => {
  const m = makeMutant({ skin: 0x4a4458 }); // league-issue coach's cardigan
  const b = window.__bases[baseIdx].position;
  const side = baseIdx === 0 ? 1 : -1;
  m.position.set(b.x + side * 9, 0, b.z + 6);
  m.rotation.y = Math.atan2(-m.position.x, -m.position.z); // eyes on home plate
  scene.add(m);
  return m;
});

function poseCoaches() {
  const excited = crowd && crowd.excite > 0;
  // catcher sways in the crouch; the ump is a statue with opinions
  catcher.position.y = Math.sin(game.tick * 0.05) * 0.04;
  umpire.rotation.z = Math.sin(game.tick * 0.02) * 0.02;
  coaches.forEach((c, i) => {
    c.position.y = Math.sin(game.tick * 0.06 + i * 2) * 0.05;
    c.userData.parts.arms.forEach((a, j) => {
      // windmill the runner around when something's happening
      a.rotation.x = excited
        ? Math.sin(game.tick * 0.45 + j * Math.PI) * 1.4
        : a.rotation.x * 0.9;
    });
  });
}

// two nearest fielders converge on a struck ball; everyone else drifts home
function updateFielders() {
  const s = game.state;
  const chasing = s.phase === 'resolve' && s.lastPlay &&
    ['hit', 'homer', 'out'].includes(s.lastPlay.kind) && ball.visible;
  let a = null, b = null;
  if (chasing) {
    const byDist = [...fielders].sort((f, g) =>
      Math.hypot(f.mesh.position.x - ball.position.x, f.mesh.position.z - ball.position.z) -
      Math.hypot(g.mesh.position.x - ball.position.x, g.mesh.position.z - ball.position.z));
    [a, b] = byDist;
  }
  const step = 20 / C.TICKS_PER_SEC; // lope speed, units/s — mutants amble, they don't sprint
  for (const f of fielders) {
    const target = (f === a || f === b) ? { x: ball.position.x, z: ball.position.z } : f.home;
    const dx = target.x - f.mesh.position.x;
    const dz = target.z - f.mesh.position.z;
    const d = Math.hypot(dx, dz);
    const parts = f.mesh.userData.parts;
    if (d > 1.5) {
      f.mesh.position.x += (dx / d) * step;
      f.mesh.position.z += (dz / d) * step;
      f.mesh.rotation.y = Math.atan2(dx, dz);
      f.mesh.position.y = Math.abs(Math.sin(game.tick * 0.35 + f.phase)) * 0.5; // chunky run bob
      parts.arms.forEach((a, i) => { a.rotation.x = Math.sin(game.tick * 0.35 + f.phase + i * Math.PI) * 0.9; }); // arm pump
    } else {
      f.mesh.position.y *= 0.8;
      parts.arms.forEach((a) => { a.rotation.x *= 0.8; });
      if (target === f.home) f.mesh.rotation.y = Math.PI;
    }
  }
}

// ---------- strike zone + aim reticle ----------
const Z = C.ZONE;
const zone = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(Z.HALF_W * 2, Z.TOP - Z.BOT, 0.5)),
  new THREE.LineBasicMaterial({ color: 0x7df0c0, transparent: true, opacity: 0.35 })
);
zone.position.set(0, (Z.TOP + Z.BOT) / 2, 0);
scene.add(zone);

const reticle = new THREE.Group();
reticle.add(new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.3, 1.3, 0.16)),
  new THREE.LineBasicMaterial({ color: 0xffcc22 })
));
const retDot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.12), new THREE.MeshBasicMaterial({ color: 0xffcc22 }));
reticle.add(retDot);
reticle.position.set(0, (Z.TOP + Z.BOT) / 2, 0.3);
scene.add(reticle);

// ---------- app state machine: menu -> playing -> postgame -> menu ----------
const hud = document.getElementById('hud');
const controlsEl = document.getElementById('controls');
const postgameEl = document.getElementById('postgame');
const loadingEl = document.getElementById('loading');

let appState = 'menu'; // 'menu' | 'teamselect' | 'fieldselect' | 'options' | 'playing' | 'postgame'
let game = null;
let playerTeam = null; // 'home' | 'away' — chosen at team select, flavors postgame
let menuT = Math.random() * 100; // beauty-orbit clock
let podiumShot = false; // camera parked on the floating podium (team select, MVP)

function reloadTo(query) {
  // authentic loading beat: cut to black, reload with new params
  loadingEl.classList.remove('hidden');
  setTimeout(() => { location.href = query; }, 350);
}

// ---------- 3D mutant podium for team select ----------
// appearance is derived from stats: chaos tints the flesh toward the uncanny,
// power swells the head, high contact grows the spare set of arms
function appearanceFor(p) {
  return {
    skin: new THREE.Color().setHSL(0.24 + p.chaos * 0.55, 0.34, 0.36).getHex(),
    headScale: 0.9 + p.power * 0.6,
    extraArms: p.contact > 0.65 ? 1 : 0,
  };
}

// the podium floats in the void above the field — pure fog backdrop, own
// spotlight, nothing from the ballpark can photobomb the star (PS2 tradition)
const PODIUM_POS = { x: 0, y: 40, z: -10 };
const podium = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 0.5, 8), mat(pal('chalk')));
podium.position.set(PODIUM_POS.x, PODIUM_POS.y + 0.25, PODIUM_POS.z);
podium.visible = false;
scene.add(podium);

const podiumLight = new THREE.PointLight(0xffd9a0, 60, 30);
podiumLight.position.set(PODIUM_POS.x + 2, PODIUM_POS.y + 5.5, PODIUM_POS.z + 4);
podiumLight.visible = false;
scene.add(podiumLight);

const previewCache = new Map(); // player name -> mutant group
let previewMutant = null;
function showMutantPreview(p) {
  if (previewMutant) previewMutant.visible = false;
  if (!previewCache.has(p.name)) {
    const m = makeMutant(appearanceFor(p));
    m.position.set(PODIUM_POS.x, PODIUM_POS.y + 0.5, PODIUM_POS.z);
    scene.add(m);
    previewCache.set(p.name, m);
  }
  previewMutant = previewCache.get(p.name);
  previewMutant.visible = true;
}
function hidePreview() {
  if (previewMutant) previewMutant.visible = false;
  podium.visible = false;
  podiumLight.visible = false;
  batter.visible = true;
  bat.visible = true;
  podiumShot = false;
}

let pendingMode = 'match'; // 'match' | 'derby' — what the select flow launches
let derbyPlayerIdx = 0;

// ---------- persisted options ----------
const OPT_KEY = 'pmb-options';
const PICTURES = { 480: [480, 300], 640: [640, 400], 320: [320, 200] }; // all 1.6:1
let options = { difficulty: 'midnight', picture: '480', crt: 'off', sound: 'on' };
try { options = { ...options, ...JSON.parse(localStorage.getItem(OPT_KEY) ?? '{}') }; } catch { /* fresh TV */ }

function applyOptions() {
  const [w, h] = PICTURES[options.picture] ?? PICTURES[480];
  renderer.setSize(w, h, false); // CSS still upscales, pixelated
  document.getElementById('crt').classList.toggle('hidden', options.crt !== 'on');
  audio.setMuted(options.sound === 'off');
  localStorage.setItem(OPT_KEY, JSON.stringify(options));
}
applyOptions();

// browsers only allow audio after a user gesture — unlock on the first one
const unlockAudio = () => {
  audio.unlock(fieldName).then(() => audio.setMuted(options.sound === 'off'));
  removeEventListener('pointerdown', unlockAudio);
  removeEventListener('keydown', unlockAudio);
};
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);

const announcer = createAnnouncer();
announcer.setField(field);

let optionsReturnTo = 'menu'; // 'menu' | 'pause' — where BACK leads
const optionsScreen = createOptions({
  values: options,
  onChange: (key, value) => { options[key] = value; applyOptions(); },
  onBack: () => {
    optionsScreen.hide();
    if (optionsReturnTo === 'pause' && appState === 'playing') showPauseOverlay();
    else toMenu();
  },
});

function openOptions() {
  optionsReturnTo = 'menu';
  appState = 'options';
  menu.hide();
  optionsScreen.show();
}

// ---------- pause menu (Escape during play) ----------
const pauseEl = document.getElementById('pause');
const pauseItemsEl = document.getElementById('pause-items');
let paused = false;
let pauseSel = 0;
const PAUSE_ITEMS = [
  { label: 'RESUME', run: () => resumeGame() },
  { label: 'OPTIONS', run: () => { pauseEl.classList.add('hidden'); optionsReturnTo = 'pause'; optionsScreen.show(); } },
  { label: 'QUIT TO THE LOBBY', run: () => { resumeGame(); toMenu(); } },
];
const pauseItemEls = PAUSE_ITEMS.map((it, i) => {
  const el = document.createElement('div');
  el.className = 'menu-item';
  el.addEventListener('mouseenter', () => { pauseSel = i; renderPause(); });
  el.addEventListener('click', (e) => { e.stopPropagation(); it.run(); });
  pauseItemsEl.appendChild(el);
  return el;
});
function renderPause() {
  PAUSE_ITEMS.forEach((it, i) => {
    pauseItemEls[i].className = 'menu-item' + (i === pauseSel ? ' sel' : '');
    pauseItemEls[i].textContent = (i === pauseSel ? '► ' : '  ') + it.label;
  });
}
function showPauseOverlay() {
  pauseEl.classList.remove('hidden');
  renderPause();
}
function pauseGame() {
  if (appState !== 'playing' || paused) return;
  paused = true;
  pauseSel = 0;
  showPauseOverlay();
}
function resumeGame() {
  paused = false;
  pauseEl.classList.add('hidden');
}

// ---------- season mode ----------
let seasonActive = false;
const fieldTitleOf = (key) => (FIELDS[`../../fields/${key}.json`].default.name ?? key).toUpperCase();
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const seasonScreen = createSeasonScreen({
  fieldTitle: fieldTitleOf,
  onPlay: (season) => {
    const nextField = season.fields[season.i];
    playerTeam = season.team;
    pendingMode = 'match';
    if (nextField === fieldName) {
      seasonActive = true;
      seasonScreen.hide();
      startMatch();
    } else {
      reloadTo(`?field=${nextField}&play=1&team=${playerTeam}&season=1`);
    }
  },
  onAbandon: () => { saveSeason(null); seasonScreen.hide(); toMenu(); },
  onBack: () => { seasonScreen.hide(); toMenu(); },
});

function openSeason() {
  seasonActive = false;
  const season = loadSeason();
  if (!season) return openTeamSelect('season');
  appState = 'season';
  menu.hide();
  seasonScreen.show(season);
}

const recordsScreen = createRecordsScreen({
  onBack: () => { recordsScreen.hide(); toMenu(); },
});
function openRecords() {
  appState = 'records';
  menu.hide();
  recordsScreen.show();
}

const menu = createMenu({
  onQuickMatch: () => openTeamSelect('match'),
  onDerby: () => openTeamSelect('derby'),
  onFieldSelect: () => openFieldSelect('lobby'),
  onOptions: openOptions,
  onSeason: openSeason,
  onRecords: openRecords,
});

const teamSelect = createTeamSelect({
  rosters: ROSTERS,
  onBrowse: showMutantPreview,
  onConfirm: (teamKey, playerIdx) => {
    playerTeam = teamKey;
    derbyPlayerIdx = playerIdx;
    teamSelect.hide();
    hidePreview();
    if (pendingMode === 'season') {
      const season = newSeason(teamKey, unlockedFieldNames(), shuffle);
      saveSeason(season);
      appState = 'season';
      seasonScreen.show(season);
      return;
    }
    openFieldSelect('match', ROSTERS[teamKey]?.field); // default to your home park
  },
  onBack: () => { teamSelect.hide(); hidePreview(); toMenu(); },
});

let fieldSelectMode = 'lobby'; // 'lobby' (browse from menu) | 'match' (pre-game step)
const fieldSelect = createFieldSelect({
  fields: unlockedFieldNames().map((key) => {
    const f = FIELDS[`../../fields/${key}.json`].default;
    return { key, name: f.name ?? key, tagline: f.tagline ?? '', palette: f.palette };
  }),
  onConfirm: (key) => {
    if (fieldSelectMode === 'match') {
      if (key === fieldName) { fieldSelect.hide(); startMatch(); }
      else reloadTo(`?field=${key}&team=${playerTeam}&play=1&mode=${pendingMode}&player=${derbyPlayerIdx}`);
    } else {
      if (key === fieldName) { fieldSelect.hide(); toMenu(); }
      else reloadTo(`?field=${key}`);
    }
  },
  onBack: () => {
    fieldSelect.hide();
    if (fieldSelectMode === 'match') openTeamSelect();
    else toMenu();
  },
});

function openTeamSelect(mode = pendingMode) {
  pendingMode = mode;
  appState = 'teamselect';
  menu.hide();
  fieldSelect.hide();
  batter.visible = false;
  bat.visible = false;
  podium.visible = true;
  podiumLight.visible = true;
  // subject sits left-of-center; the DOM roster panel owns the right half
  camera.position.set(PODIUM_POS.x + 4.4, PODIUM_POS.y + 3.4, PODIUM_POS.z + 7.2);
  camera.lookAt(PODIUM_POS.x + 1.9, PODIUM_POS.y + 2.5, PODIUM_POS.z);
  podiumShot = true;
  teamSelect.show(pendingMode);
}

function openFieldSelect(mode, preferKey = null) {
  fieldSelectMode = mode;
  appState = 'fieldselect';
  menu.hide();
  teamSelect.hide();
  hidePreview();
  fieldSelect.show(preferKey && unlockedFieldNames().includes(preferKey) ? preferKey : fieldName);
}

function startMatch() {
  // the player's mutants host; a random rival comes to town
  const allKeys = Object.keys(ROSTERS);
  let opponent = allKeys[Math.floor(Math.random() * allKeys.length)];
  if (opponent === (playerTeam ?? 'ghouls')) opponent = allKeys[(allKeys.indexOf(opponent) + 1) % allKeys.length];
  game = new Game({
    seed: Date.now() & 0xffff,
    mode: pendingMode,
    homeKey: playerTeam ?? 'ghouls',
    awayKey: opponent,
    derbyTeam: playerTeam ?? 'ghouls',
    derbyPlayer: derbyPlayerIdx,
    difficulty: options.difficulty,
    playerSide: playerTeam ? 'home' : null,
  });
  appState = 'playing';
  swingQueued = false;
  menu.hide();
  teamSelect.hide();
  fieldSelect.hide();
  optionsScreen.hide();
  seasonScreen.hide();
  hidePreview();
  postgameEl.classList.add('hidden');
  hud.classList.remove('hidden');
  scorebugEl.classList.remove('hidden');
  controlsEl.classList.remove('hidden');
  camera.position.set(0.9, 4.7, 13.5);
  camera.lookAt(0, 3.1, -40);
  camMode = 'none'; // force a fresh cut on the first frame
  resumeGame();
  resetReplay();
  announcer.show();
  lastBatterName = null;
  walkupEl.classList.remove('in');
  lastHalfKey = null;
  lastRunTotal = 0;
  scorePulseUntil = -1;
  wipeEl.classList.remove('go');
  closePitchCall();
  pendingPitchPlan = null;
  pitchPlanSent = false;
}

function teamAgg(teamKey) {
  const agg = { hits: 0, homers: 0 };
  for (const p of ROSTERS[game.teams[teamKey]].players) {
    const st = game.state.playerStats[p.name];
    if (st) { agg.hits += st.hits; agg.homers += st.homers; }
  }
  return agg;
}

function findMvp() {
  let best = null;
  for (const side of ['home', 'away']) {
    const ros = ROSTERS[game.teams[side]];
    for (const p of ros.players) {
      const st = game.state.playerStats[p.name];
      if (st && st.ab > 0 && (!best || st.score > best.st.score)) best = { p, st, teamName: ros.name };
    }
  }
  return best;
}

function showPostgame() {
  appState = 'postgame';
  const headlineEl = postgameEl.querySelector('.headline');
  const boxEl = postgameEl.querySelector('#pg-box');
  const mvpEl = postgameEl.querySelector('#pg-mvp');
  const btnsEl = postgameEl.querySelector('#pg-buttons');
  boxEl.innerHTML = '';
  mvpEl.innerHTML = '';

  // rematch / continue / lobby buttons
  btnsEl.innerHTML = '';
  const mkBtn = (label, fn) => {
    const b = document.createElement('div');
    b.className = 'pg-btn';
    b.textContent = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    btnsEl.appendChild(b);
  };
  if (seasonActive && game.mode === 'match') {
    const season = loadSeason();
    if (season) recordGame(season, game);
    seasonActive = false; // recorded; any rematch from here is a casual game
    mkBtn('CONTINUE SEASON', () => { postgameEl.classList.add('hidden'); openSeason(); });
  } else {
    mkBtn('REMATCH', startMatch);
  }
  mkBtn('BACK TO THE LOBBY', toMenu);

  // the groundskeeper takes notes
  const rec = loadRecords();
  if (game.mode === 'derby') noteDerby(rec, game);
  else noteMatch(rec, game);

  // feats: 5+ homers in one derby impresses the front office
  if (game.mode === 'derby' && game.state.derby.homers >= 5 && unlock('commissioner')) {
    flash(UNLOCKS.commissioner.flash);
  }

  if (game.mode === 'derby') {
    const d = game.state.derby;
    headlineEl.textContent = `${d.homers} HOMER${d.homers === 1 ? '' : 'S'} — LONGEST ${d.longest} GRAVES`;
    headlineEl.className = 'headline' + (d.homers === 0 ? ' lose' : '');
    postgameEl.querySelector('.final').textContent =
      `${game.currentBatter().name} did ${d.totalGraves} total graves of damage`;
    postgameEl.classList.remove('side');
    postgameEl.classList.remove('hidden');
    controlsEl.classList.add('hidden');
    hud.classList.add('hidden');
    scorebugEl.classList.add('hidden');
    return;
  }

  // ---- full ceremony: headline, box score, MVP on the podium ----
  const s = game.state;
  if (game.playerSide) {
    const mine = s.score[game.playerSide], theirs = s.score[game.playerSide === 'home' ? 'away' : 'home'];
    headlineEl.textContent = mine > theirs ? 'VICTORY RISES FROM THE DIRT'
      : mine < theirs ? 'DEFEAT — THE WORMS FEAST TONIGHT'
      : 'A TIE. NOBODY REJOICES';
    headlineEl.className = 'headline' + (mine < theirs ? ' lose' : '');
  } else {
    headlineEl.textContent = 'FINAL';
    headlineEl.className = 'headline';
  }
  postgameEl.querySelector('.final').textContent = s.lastPlay?.text ?? '';

  const abbr = (side) => ROSTERS[game.teams[side]].name.split(' ').pop().slice(0, 6).toUpperCase();
  const cells = (teamKey) => {
    let row = `<td class="tm">${abbr(teamKey)}</td>`;
    for (let i = 0; i < C.INNINGS; i++) row += `<td>${s.lineScore[teamKey][i] ?? 0}</td>`;
    return row + `<td class="tot">${s.score[teamKey]}</td><td>${teamAgg(teamKey).hits}</td>`;
  };
  let head = '<th></th>';
  for (let i = 1; i <= C.INNINGS; i++) head += `<th>${i}</th>`;
  boxEl.innerHTML = `<table class="bs"><tr>${head}<th>R</th><th>H</th></tr>` +
    `<tr>${cells('away')}</tr><tr>${cells('home')}</tr></table>`;

  const mvp = findMvp();
  if (mvp) {
    mvpEl.innerHTML = `MVP MUTANT: <span class="who">${mvp.p.name.toUpperCase()}</span>` +
      ` (${mvp.teamName.split(' ').pop()}) — ${mvp.st.hits}-${mvp.st.ab}` +
      (mvp.st.homers ? `, ${mvp.st.homers} HR` : '');
    // MVP takes the podium against the void
    batter.visible = false;
    bat.visible = false;
    podium.visible = true;
    podiumLight.visible = true;
    showMutantPreview(mvp.p);
    camera.position.set(PODIUM_POS.x + 4.4, PODIUM_POS.y + 3.4, PODIUM_POS.z + 7.2);
    camera.lookAt(PODIUM_POS.x + 1.9, PODIUM_POS.y + 2.5, PODIUM_POS.z);
    podiumShot = true;
    postgameEl.classList.add('side');
  } else {
    postgameEl.classList.remove('side');
  }

  postgameEl.classList.remove('hidden');
  controlsEl.classList.add('hidden');
  hud.classList.add('hidden');
  scorebugEl.classList.add('hidden');
}

function toMenu() {
  game = null;
  appState = 'menu';
  pendingMode = 'match';
  resumeGame();
  resetReplay();
  announcer.hide();
  walkupEl.classList.remove('in');
  closePitchCall();
  pendingPitchPlan = null;
  pitchPlanSent = false;
  ball.visible = false;
  zone.visible = false;
  reticle.visible = false;
  teamSelect.hide();
  fieldSelect.hide();
  optionsScreen.hide();
  seasonScreen.hide();
  recordsScreen.hide();
  hidePreview();
  postgameEl.classList.add('hidden');
  hud.classList.add('hidden');
  scorebugEl.classList.add('hidden');
  controlsEl.classList.add('hidden');
  menu.show();
}

addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  if (appState !== 'postgame') return;
  if (e.code === 'Enter') { e.preventDefault(); toMenu(); }
  else if (e.code === 'KeyR') { e.preventDefault(); startMatch(); }
});

// move the bat by pointing at the hitting plane over the plate
const aim = { x: 0, y: (Z.TOP + Z.BOT) / 2 };
const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _hitPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const _hit = new THREE.Vector3();
addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
  _ray.setFromCamera(_ndc, camera);
  if (_ray.ray.intersectPlane(_hitPlane, _hit)) {
    aim.x = THREE.MathUtils.clamp(_hit.x, -3.6, 3.6);
    aim.y = THREE.MathUtils.clamp(_hit.y, 0.5, 5.6);
  }
});

let swingQueued = false;
let swingTypeQueued = 'contact';
function queueSwing(type) { swingQueued = true; swingTypeQueued = type; }

addEventListener('keydown', (e) => {
  if (appState !== 'playing' || e.defaultPrevented) return;
  if (e.code === 'Escape') {
    e.preventDefault();
    paused ? resumeGame() : pauseGame();
    return;
  }
  if (paused) {
    if (optionsScreen.visible) return; // options owns its keys
    if (e.code === 'ArrowUp') { pauseSel = (pauseSel + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length; renderPause(); }
    else if (e.code === 'ArrowDown') { pauseSel = (pauseSel + 1) % PAUSE_ITEMS.length; renderPause(); }
    else if (e.code === 'Enter') PAUSE_ITEMS[pauseSel].run();
    else return;
    e.preventDefault();
    return;
  }
  if (pitchCall) {
    const digit = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
    if (digit !== undefined && PITCH_NAMES[digit]) { pitchCall.type = PITCH_NAMES[digit]; renderPitchCall(); e.preventDefault(); }
    else if (e.code === 'Space' || e.code === 'Enter') { pitchCallAdvanceStage(); e.preventDefault(); }
    return;
  }
  if (e.code === 'Space') { queueSwing('contact'); e.preventDefault(); }
  else if (e.code === 'KeyX') { queueSwing('power'); e.preventDefault(); }
  else if (e.code === 'KeyB') { queueSwing('bunt'); e.preventDefault(); }
  else if (e.code === 'KeyS') { stealQueued = true; e.preventDefault(); }
});
let stealQueued = false;
addEventListener('pointerdown', (e) => {
  if (appState !== 'playing' || paused) return;
  if (pitchCall) {
    // clicks on the panel itself (type chips) don't lock the meter
    if (!e.target.closest('#pitchcall')) pitchCallAdvanceStage();
    return;
  }
  queueSwing(e.button === 2 ? 'power' : 'contact'); // right-click = power cut
});
addEventListener('contextmenu', (e) => { if (appState === 'playing') e.preventDefault(); });

// ---------- ball placement ----------
// hit balls fly a real (cosmetic) ballistic arc with a bounce
let hitFly = null;
const HIT_GRAVITY = 26, BALL_REST_Y = 0.45, BALL_DRAG = 0.32; // per-second air drag

function positionBall() {
  const s = game.state;
  if (s.phase === 'pitch' && s.pitch) {
    hitFly = null;
    ball.position.set(s.pitch.pos.x, s.pitch.pos.y, s.pitch.pos.z);
    ball.visible = true;
    return;
  }
  if (s.phase === 'resolve' && s.lastPlay && ['hit', 'homer', 'out'].includes(s.lastPlay.kind)) {
    if (!hitFly || hitFly.tick !== s.lastPlay.tick) {
      const lp = s.lastPlay;
      // real launch-angle model: loft picks the angle (-8° chopper up to ~72°
      // towering pop), hitScore picks the exit speed, gravity does the rest
      const ang = THREE.MathUtils.clamp(-lp.spray * 0.55 + (Math.random() - 0.5) * 0.25, -0.68, 0.68);
      const launchDeg = -8 + ((THREE.MathUtils.clamp(lp.loft, -1, 1) + 1) / 2) * 80;
      const launch = THREE.MathUtils.degToRad(launchDeg);
      const exit = (26 + lp.hitScore * 58) * (0.7 + PROP_SCALE * 0.3);
      const horiz = Math.cos(launch) * exit;
      const vy = Math.sin(launch) * exit;
      const contact = lp.hitScore > 0.2;
      hitFly = {
        tick: lp.tick,
        pos: new THREE.Vector3(0, 2.0, 0),
        vel: new THREE.Vector3(Math.sin(ang) * horiz, vy, -Math.cos(ang) * horiz),
        // the play that unfolds: outs get fielded and fired to first ahead of
        // the runner; hits get gathered too slowly to matter
        stage: 'fly',
        flyCatch: lp.kind === 'out' && lp.loft > 0.35 && contact,
        groundOut: lp.kind === 'out' && lp.loft <= 0.35 && contact,
        safeHit: lp.kind === 'hit' && contact,
        age: 0, gather: 0, carrier: null, throwFrom: null, throwT: 0, throwTicks: 1, bounced: false,
      };
    }
    const dt = 1 / 60;
    hitFly.age++;
    if (hitFly.stage === 'fly') {
      // real aerodynamics: gravity + air drag — screams off the bat, dies late
      hitFly.vel.y -= HIT_GRAVITY * dt;
      hitFly.vel.multiplyScalar(1 - BALL_DRAG * dt);
      hitFly.pos.addScaledVector(hitFly.vel, dt);
      if (hitFly.pos.y < BALL_REST_Y && hitFly.vel.y < 0) {
        hitFly.pos.y = BALL_REST_Y;
        hitFly.vel.y *= -0.42;
        hitFly.vel.x *= 0.66; // grass eats pace on every hop
        hitFly.vel.z *= 0.66;
        hitFly.bounced = true;
      }
      // fielding beats: catches settle into gloves, grounders get scooped
      const nearest = fielders.reduce((best, f) => {
        const d = Math.hypot(f.mesh.position.x - hitFly.pos.x, f.mesh.position.z - hitFly.pos.z);
        return d < best.d ? { f, d } : best;
      }, { f: null, d: 1e9 });
      const settling = hitFly.flyCatch && hitFly.vel.y < 0 && hitFly.pos.y < 6;
      const scooped = (hitFly.groundOut || hitFly.safeHit) && hitFly.bounced && nearest.d < 8;
      const tooLong = (hitFly.groundOut || hitFly.safeHit) && hitFly.age > 85;
      if (settling || scooped || tooLong) {
        hitFly.carrier = nearest.f ?? fielders[3];
        hitFly.stage = 'carried';
        hitFly.gather = hitFly.groundOut ? 10 : 26; // outs come out of the glove HOT
      }
    } else if (hitFly.stage === 'carried') {
      const c = hitFly.carrier.mesh.position;
      hitFly.pos.set(c.x + 0.9, c.y + 3.1, c.z + 0.9);
      if (--hitFly.gather <= 0) {
        if (hitFly.groundOut) {
          // a REAL throw: solve the projectile so it leaves hot, arcs under
          // gravity, and bleeds speed to the bag
          const first = window.__bases[0].position;
          const dx = first.x - hitFly.pos.x;
          const dz = first.z - hitFly.pos.z;
          const dy = (first.y + 1.2) - hitFly.pos.y;
          const dist = Math.hypot(dx, dz);
          const T = Math.max(0.3, dist / 88); // arm strength: ~88 u/s release
          hitFly.vel.set(dx / T, dy / T + 0.5 * HIT_GRAVITY * T, dz / T);
          hitFly.throwAge = 0;
          hitFly.throwTime = T;
          hitFly.stage = 'throw';
        } else {
          hitFly.stage = 'held'; // hits: too late, hold it and stew
        }
      }
    } else if (hitFly.stage === 'throw') {
      hitFly.vel.y -= HIT_GRAVITY * dt;
      hitFly.vel.multiplyScalar(1 - BALL_DRAG * 0.5 * dt); // spinning throws cut the air better
      hitFly.pos.addScaledVector(hitFly.vel, dt);
      hitFly.throwAge += dt;
      const first = window.__bases[0].position;
      const closing = Math.hypot(hitFly.pos.x - first.x, hitFly.pos.z - first.z);
      if (closing < 2.5 || hitFly.throwAge > hitFly.throwTime * 1.35) {
        hitFly.pos.set(first.x, first.y + 0.6, first.z); // smack into the bag-side glove
        hitFly.stage = 'beat';
      }
    } else if (hitFly.stage === 'held') {
      const c = hitFly.carrier.mesh.position;
      hitFly.pos.set(c.x + 0.9, c.y + 3.1, c.z + 0.9);
    } // 'beat': the ball sits on the bag while the runner arrives late
    ball.position.copy(hitFly.pos);
    ball.visible = true;
    return;
  }
  ball.visible = s.phase === 'windup';
  if (s.phase === 'windup') ball.position.set(0.8, 3.2, -D + 0.5); // in pitcher's claw
}

// ---------- instant replay (renderer-only) ----------
// A preallocated ring buffer records ball + bat transforms every sim tick.
// Homers and inning-enders replay once from the cinematic cam while the sim
// holds its breath; a REPLAY tag + forced scanlines sell the broadcast bit.
const REPLAY_TICKS = 240; // ~4s of history
const REPLAY_STRIDE = 10; // ballXYZ, ballVis, batPosXYZ, batRotXYZ
const replayBuf = new Float32Array(REPLAY_TICKS * REPLAY_STRIDE);
let replayWrite = 0;
let replayArmed = null; // { from } — set when a replay-worthy play happens
let replay = null;      // { from, to, i } — active playback
let lastSeenPlay = -1;
const replayTag = document.getElementById('replay-tag');
const crtEl = document.getElementById('crt');

function recordFrame() {
  const o = (replayWrite % REPLAY_TICKS) * REPLAY_STRIDE;
  replayBuf[o] = ball.position.x;
  replayBuf[o + 1] = ball.position.y;
  replayBuf[o + 2] = ball.position.z;
  replayBuf[o + 3] = ball.visible ? 1 : 0;
  replayBuf[o + 4] = bat.position.x;
  replayBuf[o + 5] = bat.position.y;
  replayBuf[o + 6] = bat.position.z;
  replayBuf[o + 7] = bat.rotation.x;
  replayBuf[o + 8] = bat.rotation.y;
  replayBuf[o + 9] = bat.rotation.z;
  replayWrite++;
}

function resetReplay() {
  replayWrite = 0;
  replayArmed = null;
  replay = null;
  lastSeenPlay = -1;
  replayTag.classList.add('hidden');
  crtEl.classList.toggle('hidden', options.crt !== 'on');
}

function playReplayStep() {
  const b = replayBuf;
  const o = ((replay.from + replay.i) % REPLAY_TICKS) * REPLAY_STRIDE;
  ball.position.set(b[o], b[o + 1], b[o + 2]);
  ball.visible = b[o + 3] > 0.5;
  bat.position.set(b[o + 4], b[o + 5], b[o + 6]);
  bat.rotation.set(b[o + 7], b[o + 8], b[o + 9]);
  camera.position.set(9, 1.6, -12); // low cinematic angle
  camera.lookAt(ball.position);
  replay.i++;
  if (replay.from + replay.i >= replay.to) {
    replay = null;
    replayTag.classList.add('hidden');
    crtEl.classList.toggle('hidden', options.crt !== 'on');
    camMode = 'none'; // force a clean cut back to live
  }
}

// ---------- broadcast camera suite (renderer-only) ----------
// Named cameras with hard cuts, The Show style:
//   duel    — over the mound during the windup, sizing up the batter
//   batting — behind the plate, the playable view (pitch in flight)
//   chase   — swoops after a struck ball
//   homer   — low angle near the plate, tilting up as it sails
//   beauty  — slow field pan between half-innings
let camMode = 'none';
const _camTarget = new THREE.Vector3();

function updateCamera() {
  const s = game.state;
  let want = 'batting';
  if (s.phase === 'windup') {
    want = s.phaseTicks > 22 ? 'duel' : 'batting'; // cut back just before release
  } else if (s.phase === 'resolve' && s.lastPlay) {
    if (s.lastPlay.kind === 'homer') want = 'homer';
    else if (s.lastPlay.kind === 'hit' || s.lastPlay.kind === 'out') want = 'iso';
    else if (s.lastPlay.kind === 'sideout') want = 'beauty';
  }

  if (want !== camMode) {
    camMode = want;
    if (camMode === 'batting') camera.position.set(0.9, 4.7, 13.5); // catcher's-eye low
    else if (camMode === 'iso') camera.position.set(D * 0.72, D * 0.55, D * 0.30); // tabletop 3/4 view

    else if (camMode === 'duel') camera.position.set(6.5, 8.5, -D - 18); // CF broadcast cam
    else if (camMode === 'homer') camera.position.set(9, 1.3, -10);
    // chase starts wherever the last cut left it and swoops from there
  }

  if (camMode === 'batting') {
    camera.lookAt(0, 3.1, -40);
  } else if (camMode === 'duel') {
    camera.lookAt(-0.8, 2.6, 2);
  } else if (camMode === 'homer') {
    camera.lookAt(ball.position);
  } else if (camMode === 'iso') {
    camera.lookAt(8, 0, -D * 0.42); // frames the runner's line AND the outfield chase
  } else if (camMode === 'chase') {
    _camTarget.set(ball.position.x * 0.6, ball.position.y * 0.5 + 7, ball.position.z + 26);
    camera.position.lerp(_camTarget, 0.08);
    camera.lookAt(ball.position);
  } else if (camMode === 'beauty') {
    const a = game.tick * 0.004;
    camera.position.set(Math.sin(a) * 46, 15, Math.cos(a) * 46 - 38);
    camera.lookAt(0, 5, -55);
  }
}

// ---------- player pitching: the eyeball meter (renderer-only UI) ----------
// MVP 2005's two-click meter wearing a mutant skin: aim in the zone, first
// click locks power as the glare fills, second click lands on the pupil for
// accuracy. The sim holds during the call; core gets { pitch: plan } once.
const pitchCallEl = document.getElementById('pitchcall');
const pcChipsEl = pitchCallEl.querySelector('.pc-chips');
const pcNeedleEl = pitchCallEl.querySelector('.pc-needle');
const pcHintEl = pitchCallEl.querySelector('.pc-hint');
const PITCH_NAMES = Object.keys(C.PITCH_TYPES);
const PC_PUPIL = 0.12; // accuracy target position on the meter

let pitchCall = null;       // { stage, type, needle, dir, power }
let pendingPitchPlan = null; // handed to core on the next update
let pitchPlanSent = false;
let prevPhase = null;        // for release detection (pitch-type flash)

const pcChipEls = PITCH_NAMES.map((name) => {
  const el = document.createElement('div');
  el.className = 'pc-chip';
  el.textContent = name.toUpperCase();
  el.addEventListener('click', (e) => { e.stopPropagation(); if (pitchCall) { pitchCall.type = name; renderPitchCall(); } });
  pcChipsEl.appendChild(el);
  return el;
});

function playerFields() {
  return !!game && game.mode === 'match' && !!game.playerSide && game.battingTeam() !== game.playerSide;
}

function renderPitchCall() {
  PITCH_NAMES.forEach((name, i) => {
    pcChipEls[i].className = 'pc-chip' + (pitchCall && pitchCall.type === name ? ' sel' : '');
  });
  if (!pitchCall) return;
  pcNeedleEl.style.left = `${(pitchCall.needle * 100).toFixed(1)}%`;
  pcHintEl.textContent = pitchCall.stage === 'aim'
    ? 'AIM with the mouse • 1/2/3 pitch • SPACE to wind up'
    : pitchCall.stage === 'power'
      ? 'SPACE at full glare for heat'
      : 'SPACE on the pupil to hit your spot';
}

function openPitchCall() {
  pitchCall = { stage: 'aim', type: PITCH_NAMES[0], needle: 0, dir: 1, power: 0 };
  pitchCallEl.classList.remove('hidden');
  controlsEl.classList.add('hidden'); // batting hint yields to the call panel
  zone.visible = true;
  reticle.visible = true;
  renderPitchCall();
}

function closePitchCall() {
  pitchCall = null;
  pitchCallEl.classList.add('hidden');
}

function pitchCallAdvanceStage() {
  if (!pitchCall) return;
  if (pitchCall.stage === 'aim') {
    pitchCall.stage = 'power';
    pitchCall.needle = 0;
    pitchCall.dir = 1;
  } else if (pitchCall.stage === 'power') {
    pitchCall.power = pitchCall.needle;
    pitchCall.stage = 'accuracy';
    pitchCall.dir = -1;
  } else {
    const accuracy = Math.max(0, 1 - Math.abs(pitchCall.needle - PC_PUPIL) / 0.5);
    pendingPitchPlan = { type: pitchCall.type, tx: aim.x, ty: aim.y, power: pitchCall.power, accuracy };
    pitchPlanSent = true;
    closePitchCall();
  }
  renderPitchCall();
}

function pitchCallTick() {
  if (pitchCall.stage === 'power' || pitchCall.stage === 'accuracy') {
    pitchCall.needle += pitchCall.dir / C.PLAYER_PITCH.METER_TICKS;
    if (pitchCall.needle >= 1) { pitchCall.needle = 1; pitchCall.dir = -1; }
    if (pitchCall.needle <= 0) { pitchCall.needle = 0; pitchCall.dir = 1; }
  }
  updateReticle();
  renderPitchCall();
}

// ---------- contact juice: hitstop, shake, particles, trail ----------
let hitstopTicks = 0;
let shakeTicks = 0;
let shakeAmp = 0;

// chunky particle pool (one Points mesh, preallocated)
const P_COUNT = 36;
const pPos = new Float32Array(P_COUNT * 3).fill(-500);
const pVel = new Float32Array(P_COUNT * 3);
const pLife = new Float32Array(P_COUNT);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: true, color: 0xaa8866 });
const particles = new THREE.Points(pGeo, pMat);
particles.frustumCulled = false;
scene.add(particles);

function burstParticles(x, y, z, color) {
  pMat.color.set(color);
  for (let i = 0; i < P_COUNT; i++) {
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = (Math.random() * 2 - 1) * 14;
    pVel[i * 3 + 1] = 4 + Math.random() * 14;
    pVel[i * 3 + 2] = (Math.random() * 2 - 1) * 14;
    pLife[i] = 0.5 + Math.random() * 0.5;
  }
}

function updateParticles() {
  const dt = 1 / C.TICKS_PER_SEC;
  let dirty = false;
  for (let i = 0; i < P_COUNT; i++) {
    if (pLife[i] <= 0) continue;
    dirty = true;
    pLife[i] -= dt * 1.6;
    pVel[i * 3 + 1] -= 30 * dt;
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pLife[i] <= 0) pPos[i * 3 + 1] = -500;
  }
  if (dirty) pGeo.attributes.position.needsUpdate = true;
}

// afterimage trail for screamers
const TRAIL_N = 7;
const trailMeshes = Array.from({ length: TRAIL_N }, (_, i) => {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.34 - i * 0.03, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xeeeae0, transparent: true, opacity: 0.5 - i * 0.06 }));
  m.visible = false;
  scene.add(m);
  return m;
});
const trailRing = Array.from({ length: TRAIL_N * 2 }, () => new THREE.Vector3(0, -500, 0));
let trailHead = 0;
let trailActive = false;

function updateTrail() {
  if (trailActive && ball.visible) {
    trailRing[trailHead % trailRing.length].copy(ball.position);
    trailHead++;
    for (let i = 0; i < TRAIL_N; i++) {
      const idx = trailHead - 2 - i * 2;
      trailMeshes[i].visible = idx >= 0;
      if (idx >= 0) trailMeshes[i].position.copy(trailRing[((idx % trailRing.length) + trailRing.length) % trailRing.length]);
    }
  } else {
    for (const m of trailMeshes) m.visible = false;
  }
}

// ---------- moonfire: Old Gasper's homers set the sky burning ----------
let moonfireTicks = 0;
const _fogBase = new THREE.Color(field.palette.fog);
const _fogFire = new THREE.Color('#8a1a10');
function updateMoonfire() {
  if (moonfireTicks <= 0) return;
  moonfireTicks--;
  const k = Math.sin((moonfireTicks / 180) * Math.PI); // swell in, burn out
  scene.fog.color.copy(_fogBase).lerp(_fogFire, k * 0.8);
  scene.background.copy(_fogBase).lerp(_fogFire, k * 0.5);
  if (moonfireTicks === 0) {
    scene.fog.color.copy(_fogBase);
    scene.background.set(field.palette.sky);
  }
}

// ---------- broadcast wipes + score pulse (renderer-only) ----------
const wipeEl = document.getElementById('wipe');
wipeEl.style.setProperty('--wipe-a', field.palette.fog);
wipeEl.style.setProperty('--wipe-b', field.palette.dirt);
let lastHalfKey = null;
let scorePulseUntil = -1;
let lastRunTotal = 0;

function updateBroadcastBeats() {
  const s = game.state;
  const halfKey = `${s.inning}-${s.half}`;
  if (lastHalfKey === null) {
    lastHalfKey = halfKey; // no wipe on the very first pitch of a match
  } else if (halfKey !== lastHalfKey && game.mode !== 'derby') {
    lastHalfKey = halfKey;
    if (s.inning <= C.INNINGS) {
      wipeEl.querySelector('.wipe-text').textContent =
        `${s.half === 'top' ? 'TOP' : 'BOTTOM'} ${s.inning} — ${field.name.toUpperCase()}`;
      wipeEl.classList.remove('go');
      void wipeEl.offsetWidth; // restart the sweep
      wipeEl.classList.add('go');
    }
  }
  const runs = s.score.home + s.score.away;
  if (runs > lastRunTotal) scorePulseUntil = game.tick + 45;
  lastRunTotal = runs;
}

// ---------- chunky keyframe poses (renderer-only) ----------
// The windup in seven snaps: idle sway -> gather back -> leg kick -> whip.
function posePitcher() {
  const parts = pitcher.userData.parts;
  const s = game.state;
  if (s.phase === 'windup') {
    const p = chunky(1 - s.phaseTicks / Math.max(1, C.WINDUP_TICKS), 7);
    if (p < 0.4) {
      // rocking, sizing up the batter
      pitcher.rotation.z = Math.sin(game.tick * 0.15) * 0.12;
      parts.body.rotation.x = 0;
      parts.legs.rotation.x = 0;
      parts.arms.forEach((a) => { a.rotation.x = 0; });
    } else if (p < 0.8) {
      // gather: lean back, glove up, leg coiled
      pitcher.rotation.z = 0;
      parts.body.rotation.x = -0.35;
      parts.legs.rotation.x = -0.9; // the kick
      parts.arms.forEach((a, i) => { a.rotation.x = i % 2 ? -2.4 : -0.6; });
    } else {
      // whip: everything forward
      parts.body.rotation.x = 0.5;
      parts.legs.rotation.x = 0.3;
      parts.arms.forEach((a, i) => { a.rotation.x = i % 2 ? 1.1 : 0.4; });
    }
  } else {
    pitcher.rotation.z = 0;
    parts.body.rotation.x *= 0.85;
    parts.legs.rotation.x *= 0.85;
    parts.arms.forEach((a) => { a.rotation.x *= 0.85; });
  }
}

// batter: idle sway -> coil -> swing -> DROP THE BAT AND RUN
function poseBatter() {
  const parts = batter.userData.parts;
  const s = game.state;

  const running = s.phase === 'resolve' && s.lastPlay &&
    ['hit', 'homer', 'out'].includes(s.lastPlay.kind) && s.lastPlay.hitScore > 0.2;
  if (running) {
    bat.visible = false; // bat's in the dirt where it belongs
    const first = window.__bases[0].position;
    const dx = first.x - batter.position.x;
    const dz = first.z - batter.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.2) {
      const step = 34 / C.TICKS_PER_SEC; // dig for first, it's a long way now
      batter.position.x += (dx / d) * step;
      batter.position.z += (dz / d) * step;
      batter.rotation.y = Math.atan2(dx, dz);
      batter.position.y = Math.abs(Math.sin(game.tick * 0.35)) * 0.5;
      parts.arms.forEach((a, i) => { a.rotation.x = Math.sin(game.tick * 0.35 + i * Math.PI) * 0.9; });
    } else {
      batter.position.y *= 0.8; // safe at first (or close enough for the mutant leagues)
    }
    return;
  }

  // back in the box
  if (batter.visible) bat.visible = true;
  batter.position.z += (1.2 - batter.position.z) * 0.25;
  parts.arms.forEach((a) => { a.rotation.x *= 0.85; });
  parts.head.rotation.y *= 0.8;
  batter.position.y = Math.sin(game.tick * 0.08) * 0.06;
  batter.position.x += ((-2.6 + aim.x * 0.12) - batter.position.x) * 0.25;
  if (swingAnim > 0) {
    // follow through: the whole body uncoils through the swing
    const k = chunky(1 - swingAnim / SWING_TICKS, 4);
    batter.rotation.y = Math.PI / 2 - k * 1.9;
    parts.body.rotation.y = k * 0.9;
    parts.legs.rotation.y = k * 0.45;
    parts.head.rotation.y = -k * 0.55; // eyes stay on the ball
  } else if (s.phase === 'pitch' && s.pitch.t > 0.5) {
    // coil + stride, snapped to two keyframes
    const c = chunky((s.pitch.t - 0.5) / 0.5, 2);
    batter.rotation.y = Math.PI / 2 + c * 0.18;
    parts.body.rotation.y = -c * 0.22;
    parts.legs.rotation.y = c * 0.15;
  } else {
    batter.rotation.y = Math.PI / 2;
    parts.body.rotation.y *= 0.8;
    parts.legs.rotation.y *= 0.8;
  }
}

// ---------- batter walk-ups (renderer-only) ----------
// The Show ritual, mutant flavor: name card slides in on each new batter,
// batter does a little flourish while the pitcher glowers.
const walkupEl = document.getElementById('walkup');
let lastBatterName = null;
let walkupHideAt = -1;
let walkupFlourish = 0;

function updateWalkup() {
  const s = game.state;
  if (s.phase === 'windup') {
    const b = game.currentBatter();
    if (b.name !== lastBatterName) {
      lastBatterName = b.name;
      const teamName = game.mode === 'derby'
        ? ROSTERS[game.derbyTeam].name : ROSTERS[game.teams[game.battingTeam()]].name;
      walkupEl.innerHTML =
        `<div class="wu-team">NOW BATTING — ${teamName.toUpperCase()}</div>` +
        `<div class="wu-name">${b.name.toUpperCase()}</div>` +
        `<div class="wu-gk">${b.gimmick ?? ''}</div>` +
        `<div class="wu-st"><span class="lb">PWR</span><span class="pwr">${statBlocks(b.power)}</span></div>` +
        `<div class="wu-st"><span class="lb">CON</span><span class="con">${statBlocks(b.contact)}</span></div>` +
        `<div class="wu-st"><span class="lb">CHA</span><span class="cha">${statBlocks(b.chaos)}</span></div>`;
      walkupEl.classList.add('in');
      walkupHideAt = game.tick + 150; // ~2.5s on screen
      walkupFlourish = 60;
      audio.organSting('walkup');
    }
  }
  if (walkupHideAt > 0 && game.tick >= walkupHideAt) {
    walkupEl.classList.remove('in');
    walkupHideAt = -1;
  }
  if (walkupFlourish > 0) {
    walkupFlourish--;
    const k = walkupFlourish / 60;
    batter.rotation.z = Math.sin(k * Math.PI * 4) * 0.12 * k; // knuckle-crack shimmy
  } else {
    batter.rotation.z = 0;
  }
}

// ---------- bat animation (renderer-only) ----------
let swingAnim = 0;
const SWING_TICKS = 12;

function updateBat() {
  if (swingAnim > 0) {
    swingAnim--;
    const k = 1 - swingAnim / SWING_TICKS;
    // lunge to the aim point and sweep through it
    bat.position.x += ((aim.x - 0.8) - bat.position.x) * 0.55;
    bat.position.y += ((aim.y - 0.6) - bat.position.y) * 0.55;
    bat.position.z += (0.5 - bat.position.z) * 0.55;
    bat.rotation.y = -k * k * Math.PI * 1.35;
    bat.rotation.x += (1.25 - bat.rotation.x) * 0.5; // bat levels out through the zone
    bat.rotation.z += (-0.2 - bat.rotation.z) * 0.5;
  } else {
    // held over the back shoulder, waggling slightly with the aim
    bat.position.x += ((-2.35 + aim.x * 0.08) - bat.position.x) * 0.2;
    bat.position.y += ((3.05 + (aim.y - 2.9) * 0.12) - bat.position.y) * 0.2;
    bat.position.z += (1.35 - bat.position.z) * 0.2;
    bat.rotation.x += ((0.55 + Math.sin(game.tick * 0.05) * 0.05) - bat.rotation.x) * 0.25; // waggle
    bat.rotation.y *= 0.8;
    bat.rotation.z += (0.3 - bat.rotation.z) * 0.25;
  }
}

// ---------- HUD: broadcast score bug + slim center lines ----------
const scorebugEl = document.getElementById('scorebug');
const sb = {
  awayAbbr: document.getElementById('sb-away-abbr'),
  awayScore: document.getElementById('sb-away-score'),
  homeAbbr: document.getElementById('sb-home-abbr'),
  homeScore: document.getElementById('sb-home-score'),
  inning: document.getElementById('sb-inning'),
  count: document.getElementById('sb-count'),
  bases: [document.getElementById('sb-b1'), document.getElementById('sb-b2'), document.getElementById('sb-b3')],
};
const teamAbbr = (side) => ROSTERS[game.teams[side]].name.split(' ').pop().slice(0, 3).toUpperCase();

const flashEl = document.getElementById('flash');
function flash(text, pitchStyle = false) {
  flashEl.textContent = text;
  flashEl.className = pitchStyle ? 'pitch' : '';
  void flashEl.offsetWidth;
  flashEl.classList.add('pop');
}

function drawHud() {
  if (!game) return;
  const s = game.state;
  const batterNow = game.currentBatter();
  if (game.mode === 'derby') {
    sb.awayAbbr.textContent = 'HR';
    sb.awayScore.textContent = s.derby.homers;
    sb.homeAbbr.textContent = 'OUT';
    sb.homeScore.textContent = `${s.derby.outs}/${C.DERBY.OUTS}`;
    sb.inning.textContent = 'DERBY';
    sb.count.textContent = `LNG ${s.derby.longest}`;
    sb.bases.forEach((el) => el.classList.remove('on'));
    hud.innerHTML =
      `<div class="line batter">AT BAT: ${batterNow.name}</div>` +
      (s.lastPlay ? `<div class="line play">${s.lastPlay.text}</div>` : '');
    return;
  }
  sb.awayAbbr.textContent = teamAbbr('away');
  sb.homeAbbr.textContent = teamAbbr('home');
  sb.awayScore.textContent = s.score.away;
  sb.homeScore.textContent = s.score.home;
  const pulsing = game.tick < scorePulseUntil;
  sb.awayScore.classList.toggle('pulse', pulsing);
  sb.homeScore.classList.toggle('pulse', pulsing);
  sb.inning.textContent = `${s.half === 'top' ? '▲' : '▼'} ${Math.min(s.inning, C.INNINGS)}`;
  sb.count.textContent = `${s.balls}-${s.strikes}  ${'●'.repeat(s.outs)}${'○'.repeat(Math.max(0, 2 - s.outs))}`;
  sb.bases.forEach((el, i) => el.classList.toggle('on', !!s.bases[i]));
  hud.innerHTML =
    `<div class="line batter">AT BAT: ${batterNow.name}</div>` +
    (s.lastPlay ? `<div class="line play">${s.lastPlay.text}</div>` : '');
  // light bases
  window.__bases.forEach((m, i) => m.material.color.set(s.bases[i] ? 0xd8ff55 : 0xcfc9b8));
}

// ---------- gamepad support ----------
// Standard-mapping pads. Buttons synthesize the same key events the keyboard
// uses (so every screen Just Works); the left stick drives the aim directly.
//   A swing/confirm • X power cut (rematch on the tally) • B bunt/back
//   Y steal • Start pause • D-pad/stick navigate • LB/RB cycle pitch types
const PAD = { deadzone: 0.18, prev: [], stick: { x: 0, y: 0 }, connected: false };
const padKey = (code) => dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }));

addEventListener('gamepadconnected', () => {
  PAD.connected = true;
  controlsEl.textContent = '🎮 STICK aims — A swing • X power • B bunt • Y steal • START pause';
  flash('CONTROLLER CONNECTED', true);
});
addEventListener('gamepaddisconnected', () => { PAD.connected = false; });

function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (!gp) return;

  const pressed = (i) => !!gp.buttons[i]?.pressed;
  const edge = (i) => pressed(i) && !PAD.prev[i];
  const inPlay = appState === 'playing' && !paused && !!game;

  // left stick: absolute bat/aim cursor while playing, menu nav elsewhere
  const sx = gp.axes[0] ?? 0;
  const sy = gp.axes[1] ?? 0;
  if (inPlay) {
    if (Math.abs(sx) > PAD.deadzone || Math.abs(sy) > PAD.deadzone) {
      aim.x = THREE.MathUtils.clamp(sx * 3.6, -3.6, 3.6);
      aim.y = THREE.MathUtils.clamp(2.95 - sy * 2.8, 0.5, 5.6);
    }
  } else {
    if (sy < -0.5 && PAD.stick.y >= -0.5) padKey('ArrowUp');
    if (sy > 0.5 && PAD.stick.y <= 0.5) padKey('ArrowDown');
    if (sx < -0.5 && PAD.stick.x >= -0.5) padKey('ArrowLeft');
    if (sx > 0.5 && PAD.stick.x <= 0.5) padKey('ArrowRight');
  }
  PAD.stick = { x: sx, y: sy };

  // d-pad always navigates
  if (edge(12)) padKey('ArrowUp');
  if (edge(13)) padKey('ArrowDown');
  if (edge(14)) padKey('ArrowLeft');
  if (edge(15)) padKey('ArrowRight');

  if (edge(0)) padKey(inPlay ? 'Space' : 'Enter');           // A
  if (edge(1)) padKey(inPlay ? 'KeyB' : 'Escape');           // B
  if (edge(2)) padKey(inPlay ? 'KeyX' : 'KeyR');             // X
  if (edge(3) && inPlay) padKey('KeyS');                     // Y
  if (edge(9)) padKey('Escape');                             // Start

  // shoulders flip through the arsenal during a pitch call
  if (pitchCall && (edge(4) || edge(5))) {
    const dir = edge(5) ? 1 : -1;
    const idx = (PITCH_NAMES.indexOf(pitchCall.type) + dir + PITCH_NAMES.length) % PITCH_NAMES.length;
    pitchCall.type = PITCH_NAMES[idx];
    renderPitchCall();
  }

  PAD.prev = gp.buttons.map((b) => b.pressed);
}

// ---------- main loop ----------
// Fixed timestep: the sim always runs at TICKS_PER_SEC regardless of display
// refresh (no double-speed pitches on 120Hz screens, no slow-mo on weak GPUs).
const STEP_MS = 1000 / C.TICKS_PER_SEC;
let acc = 0;
let last = performance.now();

let eyeReadPitch = -1;
let eyeReads = false;
function updateReticle() {
  const active = game.state.phase === 'windup' || game.state.phase === 'pitch';
  zone.visible = active;
  reticle.visible = active;
  reticle.position.x += (aim.x - reticle.position.x) * 0.4;
  reticle.position.y += (aim.y - reticle.position.y) * 0.4;
  const closing = game.state.phase === 'pitch' && game.state.pitch.t > 0.72;
  reticle.scale.setScalar(closing ? 1 + Math.sin(game.tick * 0.6) * 0.12 : 1);

  // batter's eye: sharp-eyed mutants telegraph probable balls mid-flight
  if (game.state.phase === 'pitch' && !playerFields()) {
    if (game.state.stats.pitches !== eyeReadPitch) {
      eyeReadPitch = game.state.stats.pitches;
      eyeReads = !game.state.pitch.isStrike &&
        Math.random() < game.currentBatter().contact * C.BATTER_EYE;
    }
    zone.material.color.set(eyeReads && game.state.pitch.t > 0.45 ? 0x66ff88 : 0x7df0c0);
  } else {
    zone.material.color.set(0x7df0c0);
  }
}

function stepGame() {
  // player on the mound: hold the sim and open the call UI at each windup
  if (playerFields() && game.state.phase === 'windup' && !pitchPlanSent && !pitchCall) {
    openPitchCall();
    return;
  }

  let input;
  if (playerFields()) {
    // CPU bats against the player's pitching; the call plan rides along once
    input = game.autoBatterInput();
    if (pendingPitchPlan) { input.pitch = pendingPitchPlan; pendingPitchPlan = null; }
    swingQueued = false;
    stealQueued = false; // you can't send the other team's runners
  } else {
    input = { swing: swingQueued, swingType: swingTypeQueued, aimX: aim.x, aimY: aim.y, steal: stealQueued };
    if (swingQueued && game.state.phase === 'pitch' && !game.state.swing) swingAnim = SWING_TICKS;
    swingQueued = false;
    stealQueued = false;
  }
  const phaseBefore = prevPhase;
  game.update(input);
  prevPhase = game.state.phase;
  if (phaseBefore === 'windup' && game.state.phase === 'pitch') {
    flash(`${game.state.pitch.type.toUpperCase()}...`, true); // called off the mound
  }
  if (game.state.phase === 'pitch' && pitchPlanSent) {
    pitchPlanSent = false; // re-arm for the next windup
  } else if (game.state.phase === 'pitch' && !playerFields() && controlsEl.classList.contains('hidden') && appState === 'playing') {
    controlsEl.classList.remove('hidden'); // batting hint returns for our half
  }
  if (game.state.phase === 'gameover') return showPostgame();

  // arm/launch instant replays + feed the booth
  const lp = game.state.lastPlay;
  if (lp && lp.tick !== lastSeenPlay) {
    lastSeenPlay = lp.tick;
    announcer.onPlay(lp);
    if (crowd && (lp.kind === 'homer' || lp.kind === 'hit')) { crowd.excite = 130; audio.crowdSwell(true); }
    if (lp.moonfire) moonfireTicks = 180; // Old Gasper lights the sky
    if (['hit', 'homer', 'out'].includes(lp.kind) && lp.hitScore > 0.2) audio.batCrack(lp.hitScore);
    if (lp.kind === 'homer') audio.organSting('homer');
    else if (/strikes out/.test(lp.text)) audio.organSting('strikeout');
    // broadcast stamp callouts
    if (lp.kind === 'homer') flash(lp.moonfire ? 'MOONFIRE!' : 'GRAVE DIGGER!');
    else if (/triple/.test(lp.text)) flash('BONE RATTLER!');
    else if (/ROBBED/.test(lp.text)) flash('DAYLIGHT ROBBERY!');
    else if (/BOOTED/.test(lp.text)) flash('BUTCHERED!');
    else if (/STEALS HOME/.test(lp.text)) flash('HOME INVASION!');
    // juice: hitstop + shake + dirt burst on real contact, ecto-splat on ecto fouls
    if (['hit', 'homer', 'out'].includes(lp.kind) && lp.hitScore > 0.45) {
      hitstopTicks = Math.round(2 + lp.hitScore * 4);
      shakeTicks = 18;
      shakeAmp = 0.1 + lp.hitScore * 0.45;
      burstParticles(0, 2.2, 0.3, pal('dirt'));
      trailActive = lp.hitScore > 0.85;
      trailHead = 0;
    } else if (lp.kind === 'foul' && game.state.pitch?.type === 'ectoball') {
      burstParticles(0, 2.6, 0.4, 0x6ef22e); // ectoplasm does not wipe off
    } else {
      trailActive = false;
    }
    if ((lp.kind === 'homer' || lp.kind === 'sideout') && replayWrite > 100) {
      replayArmed = { from: Math.max(0, replayWrite - 80) }; // a beat before contact
    }
  }
  announcer.tick(true);
  updateWalkup();
  updateBroadcastBeats();
  updateMoonfire();
  if (replayArmed && game.state.phase === 'resolve' && game.state.phaseTicks <= 2) {
    replay = { from: Math.max(replayArmed.from, replayWrite - REPLAY_TICKS + 1), to: replayWrite, i: 0 };
    replayArmed = null;
    replayTag.classList.remove('hidden');
    crtEl.classList.remove('hidden'); // scanline shimmer while we relive it
  }

  updateBat();

  posePitcher();
  poseBatter();

  // zone + reticle live only while a pitch is coming
  updateReticle();

  positionBall();
  updateFielders();
  poseCoaches();
  recordFrame();
}

function advanceOneTick() {
  if (paused) return;                           // the world holds still
  if (hitstopTicks > 0) hitstopTicks--;         // frozen at the moment of impact
  else if (replay) playReplayStep();            // the sim holds its breath
  else if (appState === 'playing' && game && pitchCall) pitchCallTick(); // calling the pitch
  else if (appState === 'playing' && game) stepGame();
  else menuT += 1 / C.TICKS_PER_SEC;
  updateCrowd(); // the crowd never stops (even in the lobby)
  updateParticles();
  updateTrail();
}

function frame(now) {
  pollGamepad();
  acc += Math.min(now - last, 1000); // clamp long gaps (tab switches)
  last = now;
  while (acc >= STEP_MS) {
    advanceOneTick();
    acc -= STEP_MS;
  }
  if (replay) {
    // playback owns the camera
  } else if (appState === 'playing' && game) {
    updateCamera();
  } else if (podiumShot) {
    // static podium shot; the mutant turns slowly on the slab
    if (previewMutant) previewMutant.rotation.y += 0.012;
  } else if (appState !== 'playing') {
    // lobby beauty orbit: slow drift around the diamond, landmark in the fog
    const a = menuT * 0.07;
    camera.position.set(Math.sin(a) * 46, 15 + Math.sin(menuT * 0.23) * 2.5, Math.cos(a) * 46 - 38);
    camera.lookAt(0, 5, -55);
  }
  drawHud();
  // screen shake rides on top of whatever camera is live, then backs off
  let shakeX = 0, shakeY = 0;
  if (shakeTicks > 0) {
    shakeTicks--;
    const k = shakeTicks / 18;
    shakeX = (Math.random() * 2 - 1) * shakeAmp * k;
    shakeY = (Math.random() * 2 - 1) * shakeAmp * k;
    camera.position.x += shakeX;
    camera.position.y += shakeY;
  }
  renderer.render(scene, camera);
  camera.position.x -= shakeX;
  camera.position.y -= shakeY;
  // rAF freezes in hidden tabs — fall back to timers so the game keeps living
  if (document.hidden) setTimeout(() => frame(performance.now()), STEP_MS);
  else requestAnimationFrame(frame);
}

// boot: field-select reloads carry ?play=1&team= to jump straight into the match
const bootParams = new URLSearchParams(location.search);
if (bootParams.get('play') === '1') {
  playerTeam = ROSTERS[bootParams.get('team')] ? bootParams.get('team') : null;
  pendingMode = bootParams.get('mode') === 'derby' ? 'derby' : 'match';
  derbyPlayerIdx = Math.max(0, parseInt(bootParams.get('player') ?? '0', 10) || 0) % 6;
  seasonActive = bootParams.get('season') === '1' && !!loadSeason();
  startMatch();
} else {
  toMenu();
}
frame(performance.now());

// the old ways still work: type it on the title screen
let cheatBuf = '';
addEventListener('keydown', (e) => {
  if (appState !== 'menu' || e.key.length !== 1) return;
  cheatBuf = (cheatBuf + e.key.toLowerCase()).slice(-5);
  if (cheatBuf === 'worms') {
    let earned = false;
    for (const id of Object.keys(UNLOCKS)) earned = unlock(id) || earned;
    if (earned) flash('THE WORMS PROVIDE — EVERYTHING UNLOCKED');
  }
});

// debug handles for harness/devtools poking (not used by game code)
Object.defineProperty(window, '__game', { get: () => game });
window.__startMatch = startMatch; // debug: skip the menu
window.__cam = camera;
window.__camMode = () => camMode;
window.__advance = (n = 1) => {
  for (let i = 0; i < n; i++) {
    advanceOneTick();
    if (!replay && appState === 'playing' && game) updateCamera(); // keep the camera honest for tests
  }
};
window.__swing = (x, y, type = 'contact') => { aim.x = x; aim.y = y; queueSwing(type); };
window.__replayActive = () => !!replay;
window.__drawCalls = () => renderer.info.render.calls;
window.__pitchCall = () => pitchCall && { ...pitchCall };
window.__aimAt = (x, y) => { aim.x = x; aim.y = y; };
window.__pollPad = pollGamepad; // deterministic gamepad polling for tests
window.__aim = () => ({ ...aim });
window.__actors = () => ({
  batter: batter.position.toArray().map((v) => +v.toFixed(1)),
  batVisible: bat.visible,
  coaches: coaches.map((c) => c.position.toArray().map((v) => +v.toFixed(1))),
  ball: ball.position.toArray().map((v) => +v.toFixed(1)),
});
