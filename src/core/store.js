// Настройки и свои игры. Хранятся в браузере (localStorage), чтобы не терялись между запусками.

const KEY = 'vihr:v1';

const defaults = {
  pack: 'glass',
  scale: 'pentatonic',
  volume: 0.7,
  sensitivity: 0.6,
  trackVolume: 0.9,
  hitsWithMusic: 0.5,
  muted: false,
  react: { beat: true, bass: true, color: false },
  customGames: [],
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(defaults);
    const data = JSON.parse(raw);
    return { ...structuredClone(defaults), ...data, react: { ...defaults.react, ...(data.react || {}) } };
  } catch (e) {
    return structuredClone(defaults);
  }
}

export const store = {
  data: load(),
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* приватный режим — просто не сохраняем */ }
  },
  set(key, value) { this.data[key] = value; this.save(); },
};
