// Палитры для колец. Цвета идут от центра к краю.
// Чтобы добавить свою — допиши объект в PALETTES: { name, stops: ['#от', '#…', '#до'] }.

import { t } from '../i18n/index.js';

export const PALETTES = {
  rainbow: { name: t('Радуга'), rainbow: true },
  neon: { name: t('Неон'), stops: ['#22E4F5', '#3B7BFF', '#9B5CFF', '#E84BFF'] },
  sunset: { name: t('Закат'), stops: ['#FFD84A', '#FF8A3D', '#FF4D6A', '#D94BFF'] },
  ocean: { name: t('Океан'), stops: ['#7CFFE0', '#2EE6C8', '#22B8F5', '#4F6BFF'] },
  acid: { name: t('Кислота'), stops: ['#F4FF4A', '#9DF24B', '#4BF28A', '#2EE6C8'] },
  candy: { name: t('Конфета'), stops: ['#FFB3E6', '#FF6FC8', '#B86BFF', '#6FA8FF'] },
  fire: { name: t('Огонь'), stops: ['#FFF3A8', '#FFC23D', '#FF6A2B', '#E8243C'] },
  ice: { name: t('Лёд'), stops: ['#FFFFFF', '#CDEBFF', '#8FC8FF', '#6E8CFF'] },
  custom: { name: t('Свои'), custom: true },
};

export const PALETTE_KEYS = Object.keys(PALETTES);

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Плавный переход по опорным цветам: t от 0 до 1. */
export function mixStops(stops, t) {
  if (stops.length === 1) return stops[0];
  const x = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const k = x - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  return rgbToHex(a.map((v, j) => v + (b[j] - v) * k));
}

/**
 * Список из n цветов для палитры.
 * @param {string} key ключ из PALETTES
 * @param {number} n сколько колец
 * @param {{from: string, to: string}} [custom] цвета для «Свои»
 */
export function paletteColors(key, n, custom = { from: '#22E4F5', to: '#FF4FD8' }) {
  const p = PALETTES[key] || PALETTES.rainbow;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    if (p.rainbow) out.push(`hsl(${Math.round(18 + t * 250)},95%,60%)`);
    else out.push(mixStops(p.custom ? [custom.from, custom.to] : p.stops, t));
  }
  return out;
}

/** CSS-градиент для превью палитры на кнопке. */
export function paletteCss(key, custom) {
  const colors = paletteColors(key, 6, custom);
  return `linear-gradient(90deg, ${colors.join(', ')})`;
}
