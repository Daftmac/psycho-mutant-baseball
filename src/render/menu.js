// src/render/menu.js
// Main menu — DOM overlay in the same Courier-and-shadow language as the HUD.
// Pure renderer UI: no game rules, no Three.js. The menu owns its own input
// while visible; main.js decides what the items actually do.

export function createMenu({ onQuickMatch, onFieldSelect }) {
  const root = document.getElementById('menu');
  const list = document.getElementById('menu-items');
  const flash = document.getElementById('menu-flash');

  let visible = false;
  let selected = 0;
  let flashTimer = null;

  const items = [
    { label: () => 'QUICK MATCH', run: () => onQuickMatch() },
    { label: () => 'HOME RUN DERBY', locked: 'STILL DIGGING THE LONG-BALL PIT' },
    { label: () => 'FIELD SELECT', run: () => onFieldSelect() },
    { label: () => 'OPTIONS', locked: 'THE COMMISSIONER IS SLEEPING' },
    { label: () => 'SEASON', locked: 'THE COMMISSIONER FORBIDS IT... FOR NOW' },
  ];

  function showFlash(text) {
    flash.textContent = text;
    flash.classList.add('on');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flash.classList.remove('on'), 1600);
  }

  function activate(i) {
    const item = items[i];
    if (item.locked) return showFlash(item.locked);
    if (item.run) item.run();
  }

  // build item elements ONCE and update in place — rebuilding on hover would
  // detach elements mid-click and eat the click event
  const els = items.map((item, i) => {
    const el = document.createElement('div');
    el.addEventListener('mouseenter', () => { selected = i; render(); });
    el.addEventListener('click', (e) => { e.stopPropagation(); activate(i); });
    list.appendChild(el);
    return el;
  });

  function render() {
    items.forEach((item, i) => {
      els[i].className = 'menu-item' + (i === selected ? ' sel' : '') + (item.locked ? ' locked' : '');
      els[i].textContent = (i === selected ? '► ' : '  ') + item.label();
    });
  }

  function onKey(e) {
    if (!visible || e.defaultPrevented) return; // consumed by another screen this frame
    if (e.code === 'ArrowUp') { selected = (selected - 1 + items.length) % items.length; render(); }
    else if (e.code === 'ArrowDown') { selected = (selected + 1) % items.length; render(); }
    else if (e.code === 'Enter' || e.code === 'Space') activate(selected);
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
