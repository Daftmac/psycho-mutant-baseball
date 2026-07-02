// src/render/select.js
// Team select + field select — DOM overlays in the HUD's Courier language.
// Pure renderer UI: no game rules, no Three.js. main.js supplies the 3D
// mutant podium preview via the onBrowse callback.

const blocks = (v) => {
  const n = Math.max(0, Math.min(10, Math.round(v * 10)));
  return '▰'.repeat(n) + '▱'.repeat(10 - n);
};

export function createTeamSelect({ rosters, onConfirm, onBack, onBrowse }) {
  const root = document.getElementById('teamselect');
  const teamKeys = Object.keys(rosters); // ['home', 'away']
  let visible = false;
  let teamIdx = 0;
  let playerIdx = 0;

  root.innerHTML =
    `<div class="screen-title">CHOOSE YOUR MUTANTS</div>` +
    `<div class="ts-team"><span class="arrow" id="ts-prev">◄</span> <span id="ts-name"></span> <span class="arrow" id="ts-next">►</span></div>` +
    `<div id="ts-cards"></div>` +
    `<div class="confirm" id="ts-confirm"></div>` +
    `<div class="screen-hint">↑↓ BROWSE • ◄► TEAM • ENTER PLAY BALL • ESC BACK</div>`;

  const nameEl = root.querySelector('#ts-name');
  const cardsEl = root.querySelector('#ts-cards');
  const confirmEl = root.querySelector('#ts-confirm');

  const team = () => rosters[teamKeys[teamIdx]];

  // build the six card elements once; update in place (see menu.js lesson)
  const cardEls = Array.from({ length: 6 }, (_, i) => {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML =
      `<div class="nm"></div><div class="gk"></div>` +
      `<div class="st"><span class="lb">PWR</span><span class="bar pwr"></span></div>` +
      `<div class="st"><span class="lb">CON</span><span class="bar con"></span></div>` +
      `<div class="st"><span class="lb">CHA</span><span class="bar cha"></span></div>`;
    el.addEventListener('mouseenter', () => { playerIdx = i; render(); });
    cardsEl.appendChild(el);
    return el;
  });

  root.querySelector('#ts-prev').addEventListener('click', () => switchTeam(-1));
  root.querySelector('#ts-next').addEventListener('click', () => switchTeam(1));
  confirmEl.addEventListener('click', () => onConfirm(teamKeys[teamIdx]));

  function switchTeam(dir) {
    teamIdx = (teamIdx + dir + teamKeys.length) % teamKeys.length;
    playerIdx = 0;
    render();
  }

  function render() {
    const t = team();
    nameEl.textContent = t.name.toUpperCase();
    t.players.forEach((p, i) => {
      const el = cardEls[i];
      el.className = 'card' + (i === playerIdx ? ' sel' : '');
      el.querySelector('.nm').textContent = p.name.toUpperCase();
      el.querySelector('.gk').textContent = p.gimmick ?? '';
      el.querySelector('.pwr').textContent = blocks(p.power);
      el.querySelector('.con').textContent = blocks(p.contact);
      el.querySelector('.cha').textContent = blocks(p.chaos);
    });
    confirmEl.textContent = `► PLAY AS THE ${t.name.toUpperCase()}`;
    onBrowse(t.players[playerIdx]);
  }

  function onKey(e) {
    if (!visible || e.defaultPrevented) return; // consumed by another screen this frame
    if (e.code === 'ArrowUp') { playerIdx = (playerIdx + 5) % 6; render(); }
    else if (e.code === 'ArrowDown') { playerIdx = (playerIdx + 1) % 6; render(); }
    else if (e.code === 'ArrowLeft') switchTeam(-1);
    else if (e.code === 'ArrowRight') switchTeam(1);
    else if (e.code === 'Enter') onConfirm(teamKeys[teamIdx]);
    else if (e.code === 'Escape') onBack();
    else return;
    e.preventDefault();
  }
  addEventListener('keydown', onKey);

  return {
    show() { visible = true; root.classList.remove('hidden'); render(); },
    hide() { visible = false; root.classList.add('hidden'); },
    get visible() { return visible; },
  };
}

export function createFieldSelect({ fields, onConfirm, onBack }) {
  const root = document.getElementById('fieldselect');
  let visible = false;
  let idx = 0;

  root.innerHTML =
    `<div class="screen-title">CHOOSE YOUR KILLING FIELD</div>` +
    `<div id="fs-cards"></div>` +
    `<div class="screen-hint">◄► BROWSE • ENTER CONFIRM • ESC BACK</div>`;

  const cardsEl = root.querySelector('#fs-cards');
  const cardEls = fields.map((f, i) => {
    const el = document.createElement('div');
    el.className = 'fcard';
    const chips = Object.values(f.palette).slice(0, 6)
      .map((c) => `<span class="chip" style="background:${c}"></span>`).join('');
    el.innerHTML =
      `<div class="nm">${f.name.toUpperCase()}</div>` +
      `<div class="gk">${f.tagline ?? ''}</div>` +
      `<div class="chips">${chips}</div>`;
    el.addEventListener('click', () => {
      if (idx === i) return onConfirm(fields[idx].key);
      idx = i; render();
    });
    cardsEl.appendChild(el);
    return el;
  });

  function render() {
    cardEls.forEach((el, i) => { el.className = 'fcard' + (i === idx ? ' sel' : ''); });
  }

  function onKey(e) {
    if (!visible || e.defaultPrevented) return; // consumed by another screen this frame
    if (e.code === 'ArrowLeft') { idx = (idx + fields.length - 1) % fields.length; render(); }
    else if (e.code === 'ArrowRight') { idx = (idx + 1) % fields.length; render(); }
    else if (e.code === 'Enter') onConfirm(fields[idx].key);
    else if (e.code === 'Escape') onBack();
    else return;
    e.preventDefault();
  }
  addEventListener('keydown', onKey);

  return {
    show(currentKey) {
      if (currentKey) { const i = fields.findIndex((f) => f.key === currentKey); if (i >= 0) idx = i; }
      visible = true; root.classList.remove('hidden'); render();
    },
    hide() { visible = false; root.classList.add('hidden'); },
    get visible() { return visible; },
  };
}
