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

// ---------- field loading ----------
// Fields are pure data (fields/*.json — schema in fields/README.md).
// Pick one with ?field=<name>; with no param the menu boots on a random field.
const FIELDS = import.meta.glob('../../fields/*.json', { eager: true });
const FIELD_NAMES = Object.keys(FIELDS).map((k) => k.match(/([^/]+)\.json$/)[1]).sort();
const urlField = new URLSearchParams(location.search).get('field');
const fieldName = urlField && FIELDS[`../../fields/${urlField}.json`]
  ? urlField
  : FIELD_NAMES[Math.floor(Math.random() * FIELD_NAMES.length)];
const field = FIELDS[`../../fields/${fieldName}.json`].default;

// ---------- setup ----------
const LOW_W = 480, LOW_H = 300; // internal PS2-ish resolution
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(LOW_W, LOW_H, false); // CSS upscales; image-rendering: pixelated

const scene = new THREE.Scene();
scene.background = new THREE.Color(field.palette.sky);
scene.fog = new THREE.FogExp2(field.palette.fog, field.fogDensity);

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

function spawnProp(spec) {
  const geo = propGeometry(spec);
  const material = propMaterial(spec);
  const spots = [];
  const place = spec.place ?? 'single';
  if (place === 'single') {
    spots.push(spec.pos ?? [0, 0, 0]);
  } else if (place === 'ring') {
    const [a0, a1] = spec.arc ?? [0, 2];
    for (let i = 0; i < spec.count; i++) {
      const a = A(a0 + ((a1 - a0) * i) / spec.count);
      spots.push([Math.cos(a) * spec.radius, spec.y ?? 0, Math.sin(a) * spec.radius + (spec.zOff ?? 0)]);
    }
  } else { // scatter
    const [a0, a1] = spec.arc ?? [0.1, 0.9];
    for (let i = 0; i < spec.count; i++) {
      const a = A(a0 + rng() * (a1 - a0));
      const r = spec.ring[0] + rng() * (spec.ring[1] - spec.ring[0]);
      spots.push([Math.cos(a) * r, spec.y ?? 0, Math.sin(a) * r + (spec.zOff ?? 0)]);
    }
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
  const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 24), mat(pal('grass')));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const infield = new THREE.Mesh(new THREE.CircleGeometry(D * 1.4, 16), mat(pal('dirt')));
  infield.rotation.x = -Math.PI / 2;
  infield.position.set(0, 0.02, -D * 0.7);
  scene.add(infield);

  // foul lines
  for (const side of [-1, 1]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 220), mat(pal('chalk')));
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = side * Math.PI / 4;
    line.position.set(side * 78, 0.04, -78);
    scene.add(line);
  }

  // bases
  window.__bases = [];
  const basePos = [[16, -16], [0, -32], [-16, -16]];
  for (const [x, z] of basePos) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 2.4), new THREE.MeshLambertMaterial({ color: new THREE.Color(pal('chalk')), flatShading: true }));
    b.position.set(x, 0.15, z - D * 0.15);
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
    const r = cs.ring[0] + rng() * (cs.ring[1] - cs.ring[0]);
    base.push({
      x: Math.cos(a) * r, y: cs.y ?? 1, z: Math.sin(a) * r + (cs.zOff ?? 0),
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
  if (crowd.excite > 0) crowd.excite--;
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
    g.add(eye);
  }
  const legs = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.9), mat(0x1c1622));
  legs.position.y = 0.6;
  g.add(legs);
  for (let i = 0; i <= extraArms; i++) {
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.8, 0.4), mat(skin));
      arm.position.set(side * 1.15, 2.6 - i * 0.8, 0);
      arm.rotation.z = side * 0.25;
      g.add(arm);
    }
  }
  return g;
}

const batter = makeMutant({ skin: 0x6fae5c, extraArms: 1 }); // sickly green, four arms
batter.position.set(-2.6, 0, 1.2);
batter.rotation.y = Math.PI / 2;
scene.add(batter);

const bat = new THREE.Group();
const batMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 4.4, 6), mat(0x7a5a33));
batMesh.position.y = 2.2;
bat.add(batMesh);
bat.position.set(-2.0, 2.6, 0.6);
bat.rotation.set(0.4, 0, -0.9);
scene.add(bat);

const pitcher = makeMutant({ skin: 0x8a6fb0, headScale: 1.5 }); // bulbous purple dome
pitcher.position.set(0, 0, -D);
scene.add(pitcher);

const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xeeeae0 }));
scene.add(ball);

// ---------- fielders: four gloves in the murk ----------
const FIELDER_POSTS = [[-38, -95], [0, -112], [38, -95], [15, -52]]; // LF CF RF rover
const fielders = FIELDER_POSTS.map(([x, z]) => {
  const m = makeMutant({ skin: 0x4a5568 }); // drab away-grays; every mutant fields in gray
  m.position.set(x, 0, z);
  m.rotation.y = Math.PI; // facing the plate
  scene.add(m);
  return { mesh: m, home: { x, z }, phase: Math.random() * Math.PI * 2 };
});

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
  const step = 30 / C.TICKS_PER_SEC; // sprint speed, units/s
  for (const f of fielders) {
    const target = (f === a || f === b) ? { x: ball.position.x, z: ball.position.z } : f.home;
    const dx = target.x - f.mesh.position.x;
    const dz = target.z - f.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.5) {
      f.mesh.position.x += (dx / d) * step;
      f.mesh.position.z += (dz / d) * step;
      f.mesh.rotation.y = Math.atan2(dx, dz);
      f.mesh.position.y = Math.abs(Math.sin(game.tick * 0.35 + f.phase)) * 0.5; // chunky run bob
    } else {
      f.mesh.position.y *= 0.8;
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
let options = { difficulty: 'midnight', picture: '480', crt: 'off' };
try { options = { ...options, ...JSON.parse(localStorage.getItem(OPT_KEY) ?? '{}') }; } catch { /* fresh TV */ }

function applyOptions() {
  const [w, h] = PICTURES[options.picture] ?? PICTURES[480];
  renderer.setSize(w, h, false); // CSS still upscales, pixelated
  document.getElementById('crt').classList.toggle('hidden', options.crt !== 'on');
  localStorage.setItem(OPT_KEY, JSON.stringify(options));
}
applyOptions();

const announcer = createAnnouncer();
announcer.setField(field);

const optionsScreen = createOptions({
  values: options,
  onChange: (key, value) => { options[key] = value; applyOptions(); },
  onBack: () => { optionsScreen.hide(); toMenu(); },
});

function openOptions() {
  appState = 'options';
  menu.hide();
  optionsScreen.show();
}

const menu = createMenu({
  onQuickMatch: () => openTeamSelect('match'),
  onDerby: () => openTeamSelect('derby'),
  onFieldSelect: () => openFieldSelect('lobby'),
  onOptions: openOptions,
});

const teamSelect = createTeamSelect({
  rosters: ROSTERS,
  onBrowse: showMutantPreview,
  onConfirm: (teamKey, playerIdx) => {
    playerTeam = teamKey;
    derbyPlayerIdx = playerIdx;
    teamSelect.hide();
    hidePreview();
    openFieldSelect('match');
  },
  onBack: () => { teamSelect.hide(); hidePreview(); toMenu(); },
});

let fieldSelectMode = 'lobby'; // 'lobby' (browse from menu) | 'match' (pre-game step)
const fieldSelect = createFieldSelect({
  fields: FIELD_NAMES.map((key) => {
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

function openFieldSelect(mode) {
  fieldSelectMode = mode;
  appState = 'fieldselect';
  menu.hide();
  teamSelect.hide();
  hidePreview();
  fieldSelect.show(fieldName);
}

function startMatch() {
  game = new Game({
    seed: Date.now() & 0xffff,
    mode: pendingMode,
    derbyTeam: playerTeam ?? 'home',
    derbyPlayer: derbyPlayerIdx,
    difficulty: options.difficulty,
  });
  appState = 'playing';
  swingQueued = false;
  menu.hide();
  teamSelect.hide();
  fieldSelect.hide();
  optionsScreen.hide();
  hidePreview();
  postgameEl.classList.add('hidden');
  hud.classList.remove('hidden');
  controlsEl.classList.remove('hidden');
  camera.position.set(0, 7.5, 14);
  camera.lookAt(0, 2.5, -40);
  camMode = 'none'; // force a fresh cut on the first frame
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
  for (const p of ROSTERS[teamKey].players) {
    const st = game.state.playerStats[p.name];
    if (st) { agg.hits += st.hits; agg.homers += st.homers; }
  }
  return agg;
}

function findMvp() {
  let best = null;
  for (const [teamKey, ros] of Object.entries(ROSTERS)) {
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

  // rematch / lobby buttons (both modes)
  btnsEl.innerHTML = '';
  const mkBtn = (label, fn) => {
    const b = document.createElement('div');
    b.className = 'pg-btn';
    b.textContent = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    btnsEl.appendChild(b);
  };
  mkBtn('REMATCH', startMatch);
  mkBtn('BACK TO THE LOBBY', toMenu);

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
    return;
  }

  // ---- full ceremony: headline, box score, MVP on the podium ----
  const s = game.state;
  if (playerTeam) {
    const mine = s.score[playerTeam], theirs = s.score[playerTeam === 'home' ? 'away' : 'home'];
    headlineEl.textContent = mine > theirs ? 'VICTORY RISES FROM THE DIRT'
      : mine < theirs ? 'DEFEAT — THE WORMS FEAST TONIGHT'
      : 'A TIE. NOBODY REJOICES';
    headlineEl.className = 'headline' + (mine < theirs ? ' lose' : '');
  } else {
    headlineEl.textContent = 'FINAL';
    headlineEl.className = 'headline';
  }
  postgameEl.querySelector('.final').textContent = s.lastPlay?.text ?? '';

  const abbr = (teamKey) => ROSTERS[teamKey].name.split(' ').pop().slice(0, 6).toUpperCase();
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
}

function toMenu() {
  game = null;
  appState = 'menu';
  pendingMode = 'match';
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
  hidePreview();
  postgameEl.classList.add('hidden');
  hud.classList.add('hidden');
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
addEventListener('keydown', (e) => {
  if (appState !== 'playing') return;
  if (pitchCall) {
    const digit = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
    if (digit !== undefined && PITCH_NAMES[digit]) { pitchCall.type = PITCH_NAMES[digit]; renderPitchCall(); e.preventDefault(); }
    else if (e.code === 'Space' || e.code === 'Enter') { pitchCallAdvanceStage(); e.preventDefault(); }
    return;
  }
  if (e.code === 'Space') { swingQueued = true; e.preventDefault(); }
});
addEventListener('pointerdown', (e) => {
  if (appState !== 'playing') return;
  if (pitchCall) {
    // clicks on the panel itself (type chips) don't lock the meter
    if (!e.target.closest('#pitchcall')) pitchCallAdvanceStage();
    return;
  }
  swingQueued = true; // tap/click to swing
});

// ---------- ball placement ----------
// hit balls fly a real (cosmetic) ballistic arc with a bounce
let hitFly = null;
const HIT_GRAVITY = 26, BALL_REST_Y = 0.45;

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
      // spray from contact timing (early = pulled), loft from where the bat met the ball
      const ang = THREE.MathUtils.clamp(-lp.spray * 0.55 + (Math.random() - 0.5) * 0.25, -0.68, 0.68);
      const speed = 16 + lp.hitScore * 55;
      const grounder = lp.loft < -0.15;
      const vy = grounder ? 3 + lp.hitScore * 4 : 7 + Math.max(0, lp.loft) * 13 + lp.hitScore * 13;
      hitFly = {
        tick: lp.tick,
        pos: new THREE.Vector3(0, 2.0, 0),
        vel: new THREE.Vector3(Math.sin(ang) * speed, vy, -Math.cos(ang) * speed),
      };
    }
    const dt = 1 / 60;
    hitFly.vel.y -= HIT_GRAVITY * dt;
    hitFly.pos.addScaledVector(hitFly.vel, dt);
    if (hitFly.pos.y < BALL_REST_Y && hitFly.vel.y < 0) {
      hitFly.pos.y = BALL_REST_Y;
      hitFly.vel.y *= -0.42;
      hitFly.vel.x *= 0.72;
      hitFly.vel.z *= 0.72;
    }
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
    else if (s.lastPlay.kind === 'hit' || s.lastPlay.kind === 'out') want = 'chase';
    else if (s.lastPlay.kind === 'sideout') want = 'beauty';
  }

  if (want !== camMode) {
    camMode = want;
    if (camMode === 'batting') camera.position.set(0, 7.5, 14);
    else if (camMode === 'duel') camera.position.set(6.5, 8.5, -D - 18); // CF broadcast cam
    else if (camMode === 'homer') camera.position.set(9, 1.3, -10);
    // chase starts wherever the last cut left it and swoops from there
  }

  if (camMode === 'batting') {
    camera.lookAt(0, 2.5, -40);
  } else if (camMode === 'duel') {
    camera.lookAt(-0.8, 2.6, 2);
  } else if (camMode === 'homer') {
    camera.lookAt(ball.position);
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

const pcChipEls = PITCH_NAMES.map((name) => {
  const el = document.createElement('div');
  el.className = 'pc-chip';
  el.textContent = name.toUpperCase();
  el.addEventListener('click', (e) => { e.stopPropagation(); if (pitchCall) { pitchCall.type = name; renderPitchCall(); } });
  pcChipsEl.appendChild(el);
  return el;
});

function playerFields() {
  return !!game && game.mode === 'match' && !!playerTeam && game.battingTeam() !== playerTeam;
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
        ? ROSTERS[game.derbyTeam].name : ROSTERS[game.battingTeam()].name;
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
    // cocked over the shoulder, drifting with the aim
    bat.position.x += ((-2.0 + aim.x * 0.18) - bat.position.x) * 0.2;
    bat.position.y += ((2.4 + (aim.y - 2.9) * 0.3) - bat.position.y) * 0.2;
    bat.position.z += (0.6 - bat.position.z) * 0.2;
    bat.rotation.x += (0.4 - bat.rotation.x) * 0.25;
    bat.rotation.y *= 0.8;
    bat.rotation.z += (-0.9 - bat.rotation.z) * 0.25;
  }
}

// ---------- HUD ----------
function drawHud() {
  if (!game) return;
  const s = game.state;
  const batterNow = game.currentBatter();
  if (game.mode === 'derby') {
    const d = s.derby;
    hud.innerHTML =
      `<div class="line score">HOME RUN DERBY — ${batterNow.name.toUpperCase()}</div>` +
      `<div class="line">HOMERS ${d.homers}  •  OUTS ${d.outs}/${C.DERBY.OUTS}  •  LONGEST ${d.longest} GRAVES</div>` +
      (s.lastPlay ? `<div class="line play">${s.lastPlay.text}</div>` : '');
    return;
  }
  const half = s.half === 'top' ? '▲' : '▼';
  const basesTxt = s.bases.map((b) => (b ? '◆' : '◇')).join(' ');
  const teams = `${ROSTERS.away.name} ${s.score.away} — ${s.score.home} ${ROSTERS.home.name}`;
  const pulse = game.tick < scorePulseUntil ? ' pulse' : '';
  hud.innerHTML =
    `<div class="line score${pulse}">${teams}</div>` +
    `<div class="line">${half} INN ${Math.min(s.inning, C.INNINGS)}  •  ${s.outs} OUT  •  ${s.balls}-${s.strikes}  •  ${basesTxt}</div>` +
    `<div class="line batter">AT BAT: ${batterNow.name}</div>` +
    (s.lastPlay ? `<div class="line play">${s.lastPlay.text}</div>` : '');
  // light bases
  window.__bases.forEach((m, i) => m.material.color.set(s.bases[i] ? 0xd8ff55 : 0xcfc9b8));
}

// ---------- main loop ----------
// Fixed timestep: the sim always runs at TICKS_PER_SEC regardless of display
// refresh (no double-speed pitches on 120Hz screens, no slow-mo on weak GPUs).
const STEP_MS = 1000 / C.TICKS_PER_SEC;
let acc = 0;
let last = performance.now();

function updateReticle() {
  const active = game.state.phase === 'windup' || game.state.phase === 'pitch';
  zone.visible = active;
  reticle.visible = active;
  reticle.position.x += (aim.x - reticle.position.x) * 0.4;
  reticle.position.y += (aim.y - reticle.position.y) * 0.4;
  const closing = game.state.phase === 'pitch' && game.state.pitch.t > 0.72;
  reticle.scale.setScalar(closing ? 1 + Math.sin(game.tick * 0.6) * 0.12 : 1);
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
  } else {
    input = { swing: swingQueued, aimX: aim.x, aimY: aim.y };
    if (swingQueued && game.state.phase === 'pitch' && !game.state.swing) swingAnim = SWING_TICKS;
    swingQueued = false;
  }
  game.update(input);
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
    if (crowd && (lp.kind === 'homer' || lp.kind === 'hit')) crowd.excite = 130; // the roar
    if ((lp.kind === 'homer' || lp.kind === 'sideout') && replayWrite > 100) {
      replayArmed = { from: Math.max(0, replayWrite - 80) }; // a beat before contact
    }
  }
  announcer.tick(true);
  updateWalkup();
  updateBroadcastBeats();
  if (replayArmed && game.state.phase === 'resolve' && game.state.phaseTicks <= 2) {
    replay = { from: Math.max(replayArmed.from, replayWrite - REPLAY_TICKS + 1), to: replayWrite, i: 0 };
    replayArmed = null;
    replayTag.classList.remove('hidden');
    crtEl.classList.remove('hidden'); // scanline shimmer while we relive it
  }

  updateBat();

  // pitcher windup wobble
  pitcher.rotation.z = game.state.phase === 'windup'
    ? Math.sin(game.tick * 0.15) * 0.12
    : 0;
  // batter idle sway + lean toward the aim
  batter.position.y = Math.sin(game.tick * 0.08) * 0.06;
  batter.position.x = -2.6 + aim.x * 0.12;

  // zone + reticle live only while a pitch is coming
  updateReticle();

  positionBall();
  updateFielders();
  recordFrame();
}

function advanceOneTick() {
  if (replay) playReplayStep();                 // the sim holds its breath
  else if (appState === 'playing' && game && pitchCall) pitchCallTick(); // calling the pitch
  else if (appState === 'playing' && game) stepGame();
  else menuT += 1 / C.TICKS_PER_SEC;
  updateCrowd(); // the crowd never stops (even in the lobby)
}

function frame(now) {
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
  renderer.render(scene, camera);
  // rAF freezes in hidden tabs — fall back to timers so the game keeps living
  if (document.hidden) setTimeout(() => frame(performance.now()), STEP_MS);
  else requestAnimationFrame(frame);
}

// boot: field-select reloads carry ?play=1&team= to jump straight into the match
const bootParams = new URLSearchParams(location.search);
if (bootParams.get('play') === '1') {
  playerTeam = ['home', 'away'].includes(bootParams.get('team')) ? bootParams.get('team') : null;
  pendingMode = bootParams.get('mode') === 'derby' ? 'derby' : 'match';
  derbyPlayerIdx = Math.max(0, parseInt(bootParams.get('player') ?? '0', 10) || 0) % 6;
  startMatch();
} else {
  toMenu();
}
frame(performance.now());

// debug handles for harness/devtools poking (not used by game code)
Object.defineProperty(window, '__game', { get: () => game });
window.__startMatch = startMatch; // debug: skip the menu
window.__cam = camera;
window.__camMode = () => camMode;
window.__advance = (n = 1) => { for (let i = 0; i < n; i++) advanceOneTick(); }; // synchronous stepping
window.__swing = (x, y) => { aim.x = x; aim.y = y; swingQueued = true; };
window.__replayActive = () => !!replay;
window.__pitchCall = () => pitchCall && { ...pitchCall };
window.__aimAt = (x, y) => { aim.x = x; aim.y = y; };
