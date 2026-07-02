// src/render/unlocks.js
// Griffey-era unlockables. Feats earn them; a certain word still works too.

const KEY = 'pmb-unlocks';

export const UNLOCKS = {
  commissioner: {
    field: 'commissioner',
    flash: 'THE COMMISSIONER IS WATCHING — NEW FIELD UNLOCKED',
    hint: 'Impress the front office: 5+ homers in one derby.',
  },
};

export function loadUnlocks() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}

export function isUnlocked(id) { return !!loadUnlocks()[id]; }

export function unlock(id) {
  const u = loadUnlocks();
  if (u[id]) return false;
  u[id] = true;
  localStorage.setItem(KEY, JSON.stringify(u));
  return true; // freshly earned
}

// hidden fields stay out of rotations until earned
export function visibleFields(allFieldNames, hiddenByField) {
  return allFieldNames.filter((name) => {
    const gate = hiddenByField[name];
    return !gate || isUnlocked(gate);
  });
}
