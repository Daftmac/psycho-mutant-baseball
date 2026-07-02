// src/render/announcer.js
// Text play-by-play ticker — pure renderer, event-driven off lastPlay.
// Generic booth voice lives here; per-field flavor comes from the field
// JSON's "announcer" block (see fields/README.md).

const BOOTH = {
  homer: [
    "IT'S GONE! Somebody wake the gravedigger!",
    "KRZZT— MERCY! The official scorer just fainted!",
    "That ball is in ORBIT — tell the moon to duck!",
  ],
  hit: [
    "Clean contact — the crowd gurgles approvingly!",
    "That one's got legs! Several, actually!",
    "He'll take that all day and twice at midnight!",
  ],
  walk: [
    "A free pass! Generous! Suspicious!",
    "Four wide ones and he shambles down to first.",
  ],
  out: [
    "Snagged! The defense smells blood tonight!",
    "And the fielders converge like flies!",
    "A can of worms... CORKED!",
  ],
  strike: [
    "Carved up! That pitch had EVIL intent!",
    "He watched it go by! The AUDACITY!",
    "Right past him — did anyone else hear it whisper?",
  ],
  ball: [
    "Low and away. The ump blinks all six eyes.",
    "Just misses! Nobody argues with THIS umpire.",
  ],
  foul: [
    "Spoiled it! Someone in the cheap seats eats a souvenir!",
    "Fights it off — this at-bat refuses to die. Fitting!",
  ],
  sideout: [
    "And the side is retired — swap the meat!",
    "Three gone! The teams shuffle past each other, hissing.",
  ],
  take: [
    "He lets it drift by. The graveyard moans.",
  ],
  final: [
    "And that's the ballgame, fiends. Drive safe. Drive FAST.",
  ],
};

const IDLE_TICKS = 660; // ~11s of quiet before booth chatter

export function createAnnouncer() {
  const root = document.getElementById('ticker');
  const textEl = root.querySelector('.tk-text');
  let fieldLines = { ambient: [], homer: [] };
  let quiet = 0;

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function say(line) {
    textEl.textContent = line;
    textEl.classList.remove('pop');
    void textEl.offsetWidth; // restart the pop animation
    textEl.classList.add('pop');
    quiet = 0;
  }

  return {
    setField(field) {
      fieldLines = { ambient: [], homer: [], ...(field.announcer ?? {}) };
    },
    onPlay(lastPlay) {
      let kind = lastPlay.kind;
      if (kind === 'hit' && /walks/.test(lastPlay.text)) kind = 'walk';
      // routine plays sometimes yield the mic to local color commentary
      if (!['homer', 'final', 'sideout'].includes(kind) && fieldLines.ambient.length && Math.random() < 0.15) {
        return say(pick(fieldLines.ambient));
      }
      const pool = kind === 'homer' && fieldLines.homer.length && Math.random() < 0.6
        ? fieldLines.homer
        : BOOTH[kind];
      if (pool && pool.length) say(pick(pool));
    },
    tick(active) {
      if (!active) return;
      quiet++;
      if (quiet >= IDLE_TICKS) {
        const pool = fieldLines.ambient.length ? fieldLines.ambient : BOOTH.ball;
        say(pick(pool));
      }
    },
    show() { root.classList.remove('hidden'); say('Welcome back to the broadcast, fiends.'); },
    hide() { root.classList.add('hidden'); },
  };
}
