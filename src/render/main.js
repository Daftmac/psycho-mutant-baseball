// src/render/main.js
// RENDERING SHELL — Three.js, PS2-lofi style. No game rules here.
// The PS2 look: render at low internal resolution, upscale with pixelation,
// flat/vertex-ish lighting, heavy fog, chunky low-poly geometry.

import * as THREE from 'three';
import { Game } from '../core/game.js';
import { C, ROSTERS } from '../core/constants.js';
import { createMenu } from './menu.js';
import { createTeamSelect, createFieldSelect } from './select.js';

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

let appState = 'menu'; // 'menu' | 'teamselect' | 'fieldselect' | 'playing' | 'postgame'
let game = null;
let playerTeam = null; // 'home' | 'away' — chosen at team select, flavors postgame
let menuT = Math.random() * 100; // beauty-orbit clock

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
}

const menu = createMenu({
  onQuickMatch: openTeamSelect,
  onFieldSelect: () => openFieldSelect('lobby'),
});

const teamSelect = createTeamSelect({
  rosters: ROSTERS,
  onBrowse: showMutantPreview,
  onConfirm: (teamKey) => {
    playerTeam = teamKey;
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
      else reloadTo(`?field=${key}&team=${playerTeam}&play=1`);
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

function openTeamSelect() {
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
  teamSelect.show();
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
  game = new Game({ seed: Date.now() & 0xffff });
  appState = 'playing';
  swingQueued = false;
  menu.hide();
  teamSelect.hide();
  fieldSelect.hide();
  hidePreview();
  postgameEl.classList.add('hidden');
  hud.classList.remove('hidden');
  controlsEl.classList.remove('hidden');
  camera.position.set(0, 7.5, 14);
  camera.lookAt(0, 2.5, -40);
}

function showPostgame() {
  appState = 'postgame';
  const headlineEl = postgameEl.querySelector('.headline');
  if (playerTeam) {
    const s = game.state.score;
    const mine = s[playerTeam], theirs = s[playerTeam === 'home' ? 'away' : 'home'];
    headlineEl.textContent = mine > theirs ? 'VICTORY RISES FROM THE DIRT'
      : mine < theirs ? 'DEFEAT — THE WORMS FEAST TONIGHT'
      : 'A TIE. NOBODY REJOICES';
    headlineEl.className = 'headline' + (mine < theirs ? ' lose' : '');
  } else {
    headlineEl.textContent = '';
  }
  postgameEl.querySelector('.final').textContent = game.state.lastPlay?.text ?? 'FINAL';
  postgameEl.classList.remove('hidden');
  controlsEl.classList.add('hidden');
}

function toMenu() {
  game = null;
  appState = 'menu';
  ball.visible = false;
  zone.visible = false;
  reticle.visible = false;
  teamSelect.hide();
  fieldSelect.hide();
  hidePreview();
  postgameEl.classList.add('hidden');
  hud.classList.add('hidden');
  controlsEl.classList.add('hidden');
  menu.show();
}

addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  if (appState === 'postgame' && e.code === 'Enter') { e.preventDefault(); toMenu(); }
});
addEventListener('pointerdown', () => {
  if (appState === 'postgame') toMenu();
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
  if (appState === 'playing' && e.code === 'Space') { swingQueued = true; e.preventDefault(); }
});
addEventListener('pointerdown', () => { if (appState === 'playing') swingQueued = true; }); // tap/click to swing

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
  const half = s.half === 'top' ? '▲' : '▼';
  const basesTxt = s.bases.map((b) => (b ? '◆' : '◇')).join(' ');
  const teams = `${ROSTERS.away.name} ${s.score.away} — ${s.score.home} ${ROSTERS.home.name}`;
  hud.innerHTML =
    `<div class="line score">${teams}</div>` +
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

function stepGame() {
  const input = { swing: swingQueued, aimX: aim.x, aimY: aim.y };
  if (swingQueued && game.state.phase === 'pitch' && !game.state.swing) swingAnim = SWING_TICKS;
  swingQueued = false;
  game.update(input);
  if (game.state.phase === 'gameover') return showPostgame();

  updateBat();

  // pitcher windup wobble
  pitcher.rotation.z = game.state.phase === 'windup'
    ? Math.sin(game.tick * 0.15) * 0.12
    : 0;
  // batter idle sway + lean toward the aim
  batter.position.y = Math.sin(game.tick * 0.08) * 0.06;
  batter.position.x = -2.6 + aim.x * 0.12;

  // zone + reticle live only while a pitch is coming
  const active = game.state.phase === 'windup' || game.state.phase === 'pitch';
  zone.visible = active;
  reticle.visible = active;
  reticle.position.x += (aim.x - reticle.position.x) * 0.4;
  reticle.position.y += (aim.y - reticle.position.y) * 0.4;
  const closing = game.state.phase === 'pitch' && game.state.pitch.t > 0.72;
  reticle.scale.setScalar(closing ? 1 + Math.sin(game.tick * 0.6) * 0.12 : 1);

  positionBall();
}

function frame(now) {
  acc += Math.min(now - last, 1000); // clamp long gaps (tab switches)
  last = now;
  while (acc >= STEP_MS) {
    if (appState === 'playing' && game) stepGame();
    else menuT += 1 / C.TICKS_PER_SEC;
    acc -= STEP_MS;
  }
  if (appState === 'teamselect') {
    // static podium shot; the highlighted mutant turns slowly on the slab
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
  startMatch();
} else {
  toMenu();
}
frame(performance.now());

// debug handle for harness/devtools poking (not used by game code)
Object.defineProperty(window, '__game', { get: () => game });
window.__startMatch = startMatch; // debug: skip the menu
