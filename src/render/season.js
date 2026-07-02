// src/render/season.js
// Season mode lite — a 6-game campaign. Pure renderer state (localStorage);
// each game is a normal core match, aggregated here between games.

import { ROSTERS } from '../core/constants.js';

const KEY = 'pmb-season';
export const SEASON_GAMES = 6;

export function loadSeason() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
export function saveSeason(season) {
  if (season) localStorage.setItem(KEY, JSON.stringify(season));
  else localStorage.removeItem(KEY);
}

export function newSeason(team, fieldNames, shuffle) {
  const fields = [];
  while (fields.length < SEASON_GAMES) fields.push(...shuffle([...fieldNames]));
  return {
    team,
    i: 0, w: 0, l: 0, t: 0,
    fields: fields.slice(0, SEASON_GAMES),
    stats: {}, // name -> { ab, hits, homers }
  };
}

export function recordGame(season, game) {
  const s = game.state;
  const mine = s.score[season.team];
  const theirs = s.score[season.team === 'home' ? 'away' : 'home'];
  if (mine > theirs) season.w++;
  else if (mine < theirs) season.l++;
  else season.t++;
  for (const [name, st] of Object.entries(s.playerStats)) {
    const agg = season.stats[name] ?? (season.stats[name] = { ab: 0, hits: 0, homers: 0 });
    agg.ab += st.ab; agg.hits += st.hits; agg.homers += st.homers;
  }
  season.i++;
  saveSeason(season);
}

export function leaders(season, count = 3) {
  return Object.entries(season.stats)
    .map(([name, st]) => ({ name, ...st, score: st.hits + st.homers * 3 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

export function createSeasonScreen({ fieldTitle, onPlay, onAbandon, onBack }) {
  const root = document.getElementById('season');
  let visible = false;
  let season = null;

  function render() {
    if (!season) return;
    const over = season.i >= SEASON_GAMES;
    const teamName = ROSTERS[season.team].name.toUpperCase();
    const verdict = season.w > SEASON_GAMES / 2
      ? 'CHAMPIONS OF THE MUTANT LEAGUES' : season.w >= season.l
        ? 'A RESPECTABLE HAUNTING' : 'THE WORMS WON THIS YEAR';
    const ldrs = leaders(season);
    root.innerHTML =
      `<div class="screen-title">${over ? 'CAMPAIGN COMPLETE' : 'THE CAMPAIGN'}</div>` +
      `<div class="sn-team">${teamName}</div>` +
      `<div class="sn-record">${season.w}–${season.l}${season.t ? `–${season.t}` : ''}` +
      `<span class="sn-game">${over ? verdict : `GAME ${season.i + 1} OF ${SEASON_GAMES}`}</span></div>` +
      (over ? '' : `<div class="sn-next">NEXT: ${fieldTitle(season.fields[season.i])}</div>`) +
      (ldrs.length
        ? `<div class="sn-leaders"><div class="sn-lt">LEAGUE LEADERS</div>` +
          ldrs.map((l) => `<div class="sn-ldr">${l.name.toUpperCase()} — ${l.hits}-${l.ab}${l.homers ? `, ${l.homers} HR` : ''}</div>`).join('') +
          `</div>`
        : '') +
      `<div id="sn-buttons">` +
      (over
        ? `<div class="pg-btn" data-act="abandon">NEW CAMPAIGN</div>`
        : `<div class="pg-btn" data-act="play">PLAY BALL</div><div class="pg-btn" data-act="abandon">ABANDON</div>`) +
      `<div class="pg-btn" data-act="back">LOBBY</div></div>` +
      `<div class="screen-hint">ENTER PLAY • ESC BACK</div>`;
    root.querySelectorAll('.pg-btn').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = b.dataset.act;
        if (act === 'play') onPlay(season);
        else if (act === 'abandon') onAbandon();
        else onBack();
      });
    });
  }

  function onKey(e) {
    if (!visible || e.defaultPrevented) return;
    if (e.code === 'Enter' && season && season.i < SEASON_GAMES) { onPlay(season); }
    else if (e.code === 'Escape') { onBack(); }
    else return;
    e.preventDefault();
  }
  addEventListener('keydown', onKey);

  return {
    show(sn) { season = sn; visible = true; root.classList.remove('hidden'); render(); },
    hide() { visible = false; root.classList.add('hidden'); },
    get visible() { return visible; },
  };
}
