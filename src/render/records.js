// src/render/records.js
// Career records, written like the cemetery keeps them. localStorage only.

import { ROSTERS } from '../core/constants.js';

const KEY = 'pmb-records';

const DEFAULTS = {
  games: 0,
  derbies: 0,
  longestGraves: { value: 0, who: null },   // deepest derby blast
  mostHomersGame: { value: 0, who: null },  // single-match homers
  bestGameHits: { value: 0, who: null },
  careerHomers: {},                          // name -> total (match + derby)
};

export function loadRecords() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; }
  catch { return { ...DEFAULTS }; }
}
export function saveRecords(r) { localStorage.setItem(KEY, JSON.stringify(r)); }

export function noteMatch(rec, game) {
  rec.games++;
  for (const [name, st] of Object.entries(game.state.playerStats)) {
    if (st.homers) rec.careerHomers[name] = (rec.careerHomers[name] ?? 0) + st.homers;
    if (st.homers > rec.mostHomersGame.value) rec.mostHomersGame = { value: st.homers, who: name };
    if (st.hits > rec.bestGameHits.value) rec.bestGameHits = { value: st.hits, who: name };
  }
  saveRecords(rec);
}

export function noteDerby(rec, game) {
  rec.derbies++;
  const d = game.state.derby;
  const who = ROSTERS[game.derbyTeam].players[game.derbyPlayer % 6].name;
  if (d.homers) rec.careerHomers[who] = (rec.careerHomers[who] ?? 0) + d.homers;
  if (d.longest > rec.longestGraves.value) rec.longestGraves = { value: d.longest, who };
  saveRecords(rec);
}

export function createRecordsScreen({ onBack }) {
  const root = document.getElementById('records');
  let visible = false;

  function render() {
    const r = loadRecords();
    const digger = Object.entries(r.careerHomers).sort((a, b) => b[1] - a[1])[0];
    const stone = (top, mid, bottom) =>
      `<div class="stone"><div class="st-top">${top}</div><div class="st-mid">${mid}</div><div class="st-bot">${bottom}</div></div>`;
    root.innerHTML =
      `<div class="screen-title">THE RECORDS</div>` +
      `<div class="screen-hint" style="margin-top:-8px">as kept by the groundskeeper</div>` +
      `<div id="rec-stones">` +
      stone('HERE LIES THE LONGEST BALL', r.longestGraves.value ? `${r.longestGraves.value} GRAVES` : '—',
        r.longestGraves.who ? `struck down by ${r.longestGraves.who}` : 'the pit awaits its first') +
      stone('MOST HOMERS, ONE GAME', r.mostHomersGame.value || '—',
        r.mostHomersGame.who ?? 'unclaimed') +
      stone('CAREER GRAVE DIGGER', digger ? `${digger[1]} HR` : '—',
        digger ? digger[0] : 'dig, mutants, dig') +
      stone('GAMES WITNESSED', r.games + r.derbies,
        `${r.games} matches, ${r.derbies} derbies`) +
      `</div>` +
      `<div id="rec-buttons"><div class="pg-btn" id="rec-back">LOBBY</div></div>` +
      `<div class="screen-hint">ESC BACK</div>`;
    root.querySelector('#rec-back').addEventListener('click', (e) => { e.stopPropagation(); onBack(); });
  }

  function onKey(e) {
    if (!visible || e.defaultPrevented) return;
    if (e.code === 'Escape' || e.code === 'Enter') { onBack(); e.preventDefault(); }
  }
  addEventListener('keydown', onKey);

  return {
    show() { visible = true; root.classList.remove('hidden'); render(); },
    hide() { visible = false; root.classList.add('hidden'); },
    get visible() { return visible; },
  };
}
