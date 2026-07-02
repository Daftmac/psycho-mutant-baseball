// src/render/options.js
// Options screen — DOM overlay, same Courier language as the rest of the UI.
// Pure renderer: difficulty is handed to core at match start; picture and
// CRT apply immediately. main.js owns persistence and application.

const ROWS = [
  {
    key: 'difficulty', label: 'DIFFICULTY',
    values: [['pushover', 'PUSHOVER'], ['midnight', 'MIDNIGHT LEAGUE'], ['nightmare', 'NIGHTMARE']],
  },
  {
    key: 'picture', label: 'PICTURE',
    values: [['480', '480×300 CLASSIC'], ['640', '640×400 REMASTER'], ['320', '320×200 HAUNTED']],
  },
  {
    key: 'crt', label: 'CRT GHOSTING',
    values: [['off', 'OFF'], ['on', 'HAUNTED TV']],
  },
  {
    key: 'sound', label: 'SOUND',
    values: [['on', 'ON'], ['off', 'OFF']],
  },
];

export function createOptions({ values, onChange, onBack }) {
  const root = document.getElementById('options');
  let visible = false;
  let selected = 0;

  root.innerHTML =
    `<div class="screen-title">OPTIONS</div>` +
    `<div id="opt-rows"></div>` +
    `<div id="opt-controls">` +
    `<div class="ctl-title">HOW TO PLAY</div>` +
    `<div>MOUSE — move the bat in the hitting zone</div>` +
    `<div>CLICK / SPACE — swing as the ball arrives</div>` +
    `<div>Perfect contact is just out front of the plate.</div>` +
    `</div>` +
    `<div class="screen-hint">↑↓ SELECT • ◄► CHANGE • ESC BACK</div>`;

  const rowsEl = root.querySelector('#opt-rows');
  const rowEls = ROWS.map((row, i) => {
    const el = document.createElement('div');
    el.className = 'opt-row';
    el.addEventListener('mouseenter', () => { selected = i; render(); });
    el.addEventListener('click', () => cycle(i, 1));
    rowsEl.appendChild(el);
    return el;
  });

  function idxOf(row) {
    const i = row.values.findIndex(([k]) => k === values[row.key]);
    return i >= 0 ? i : 0;
  }

  function cycle(i, dir) {
    const row = ROWS[i];
    const next = (idxOf(row) + dir + row.values.length) % row.values.length;
    onChange(row.key, row.values[next][0]);
    render();
  }

  function render() {
    ROWS.forEach((row, i) => {
      const [, label] = row.values[idxOf(row)];
      rowEls[i].className = 'opt-row' + (i === selected ? ' sel' : '');
      rowEls[i].textContent = `${i === selected ? '► ' : '  '}${row.label}:  ◄ ${label} ►`;
    });
  }

  function onKey(e) {
    if (!visible || e.defaultPrevented) return;
    if (e.code === 'ArrowUp') { selected = (selected + ROWS.length - 1) % ROWS.length; render(); }
    else if (e.code === 'ArrowDown') { selected = (selected + 1) % ROWS.length; render(); }
    else if (e.code === 'ArrowLeft') cycle(selected, -1);
    else if (e.code === 'ArrowRight') cycle(selected, 1);
    else if (e.code === 'Escape' || e.code === 'Enter') onBack();
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
