// src/render/audio.js
// Lofi audio kit (Tone.js) — everything synthesized, nothing sampled, all of
// it a little wrong on purpose. The AudioContext can only start on a user
// gesture; every call is a no-op until unlock() succeeds.

import * as Tone from 'tone';

let ready = false;
let muted = false;
let crowdNoise = null;
let crowdGain = null;
let ambientNoise = null;
let dripLoop = null;

// per-field ambient personalities: filter + accent cadence
const AMBIENTS = {
  boneyard:  { filter: 320,  type: 'brown', accent: 'owl' },
  undergut:  { filter: 500,  type: 'brown', accent: 'drip' },
  drivein:   { filter: 1800, type: 'white', accent: 'static' },
  widowsweb: { filter: 240,  type: 'pink',  accent: 'wind' },
};

const out = () => Tone.getDestination();

let crack, organ, blip, accent;

function buildGraph(fieldKey) {
  const master = new Tone.Gain(0.8).connect(out());

  // bat crack: a dead tree snapping
  crack = new Tone.MembraneSynth({
    pitchDecay: 0.008, octaves: 3,
    envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
  }).connect(master);

  // haunted ballpark organ
  organ = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsquare', count: 3, spread: 18 },
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.25, release: 0.4 },
    volume: -14,
  }).connect(new Tone.Vibrato(5.2, 0.15).connect(master));

  // UI blip
  blip = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.02 },
    volume: -18,
  }).connect(master);

  // crowd: a low moaning bed that swells on the roar
  crowdGain = new Tone.Gain(0.05).connect(master);
  crowdNoise = new Tone.Noise('brown').connect(
    new Tone.Filter(240, 'lowpass').connect(crowdGain));
  crowdNoise.start();

  // field ambient bed + accent loop
  const amb = AMBIENTS[fieldKey] ?? AMBIENTS.boneyard;
  ambientNoise = new Tone.Noise(amb.type).connect(
    new Tone.Filter(amb.filter, 'lowpass').connect(new Tone.Gain(0.045).connect(master)));
  ambientNoise.start();

  accent = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.25, release: 0.1 },
    harmonicity: 7.1, modulationIndex: 20, resonance: 900, volume: -26,
  }).connect(master);
  if (amb.accent === 'drip') {
    dripLoop = new Tone.Loop(() => {
      if (Math.random() < 0.5) accent.triggerAttackRelease(200 + Math.random() * 600, 0.05);
    }, 1.7).start(0);
    Tone.getTransport().start();
  }
}

export const audio = {
  async unlock(fieldKey) {
    if (ready) return;
    try {
      await Tone.start();
      buildGraph(fieldKey);
      ready = true;
    } catch { /* the TV stays silent */ }
  },
  setMuted(m) {
    muted = m;
    Tone.getDestination().mute = m;
  },
  get muted() { return muted; },
  batCrack(hitScore = 0.5) {
    if (!ready || muted) return;
    crack.triggerAttackRelease(60 + hitScore * 160, 0.09);
  },
  organSting(kind) {
    if (!ready || muted) return;
    const now = Tone.now();
    if (kind === 'homer') {
      organ.triggerAttackRelease(['C4', 'E4', 'G4'], 0.22, now);
      organ.triggerAttackRelease(['F4', 'A4', 'C5'], 0.22, now + 0.22);
      organ.triggerAttackRelease(['G4', 'B4', 'D5', 'G5'], 0.5, now + 0.44);
    } else if (kind === 'strikeout') {
      organ.triggerAttackRelease(['C3', 'Eb3', 'Gb3'], 0.6, now); // diminished dread
    } else if (kind === 'walkup') {
      organ.triggerAttackRelease(['C4', 'G4'], 0.12, now);
    }
  },
  uiBlip(confirm = false) {
    if (!ready || muted) return;
    blip.triggerAttackRelease(confirm ? 'A4' : 'E4', 0.05);
  },
  crowdSwell(excited) {
    if (!ready || muted || !crowdGain) return;
    crowdGain.gain.rampTo(excited ? 0.22 : 0.05, excited ? 0.15 : 1.2);
  },
};
