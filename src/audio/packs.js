// Наборы звуков. Каждый — маленький синтезатор на Web Audio, без файлов: звук рождается в момент касания.
// play(ctx, out, freq, vel, when) — vel от 0 до 1 (сила удара).

import { t } from '../i18n/index.js';

function env(ctx, when, attack, decay, peak) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  return g;
}

function osc(ctx, type, freq, when, dur) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, when);
  o.start(when);
  o.stop(when + dur + 0.05);
  return o;
}

export const PACKS = {
  glass: {
    name: t('Стекло'),
    sub: t('Звонкие ноты'),
    icon: 'i-bell',
    color: '#22E4F5',
    octave: 1,
    play(ctx, out, f, vel, t) {
      const g = env(ctx, t, 0.004, 1.4, 0.32 * vel);
      g.connect(out);
      osc(ctx, 'sine', f, t, 1.4).connect(g);
      const g2 = env(ctx, t, 0.002, 0.5, 0.12 * vel);
      g2.connect(out);
      osc(ctx, 'sine', f * 2.76, t, 0.5).connect(g2);
    },
  },
  drops: {
    name: t('Капли'),
    sub: t('Мягкие капли'),
    icon: 'i-drop',
    color: '#4BF28A',
    octave: 1,
    play(ctx, out, f, vel, t) {
      const o = osc(ctx, 'sine', f * 1.6, t, 0.25);
      o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.12);
      const g = env(ctx, t, 0.003, 0.22, 0.5 * vel);
      o.connect(g).connect(out);
    },
  },
  bit8: {
    name: t('8-бит'),
    sub: t('Пиксельные пики'),
    icon: 'i-pixel',
    color: '#FFD84A',
    octave: 0,
    play(ctx, out, f, vel, t) {
      const o = osc(ctx, 'square', f, t, 0.16);
      o.frequency.setValueAtTime(f * 2, t + 0.04);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      const g = env(ctx, t, 0.002, 0.14, 0.13 * vel);
      o.connect(lp).connect(g).connect(out);
    },
  },
  bass: {
    name: t('Бас'),
    sub: t('Глубокие удары'),
    icon: 'i-pulse',
    color: '#FF4FD8',
    octave: -2,
    play(ctx, out, f, vel, t) {
      const o = osc(ctx, 'triangle', f, t, 0.7);
      o.frequency.exponentialRampToValueAtTime(f * 0.97, t + 0.6);
      const g = env(ctx, t, 0.005, 0.65, 0.7 * vel);
      o.connect(g).connect(out);
      const click = osc(ctx, 'sine', f * 4, t, 0.04);
      const gc = env(ctx, t, 0.001, 0.035, 0.18 * vel);
      click.connect(gc).connect(out);
    },
  },
};

export const PACK_KEYS = Object.keys(PACKS);
