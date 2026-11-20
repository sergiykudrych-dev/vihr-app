// Языки интерфейса. По умолчанию английский, русский — по выбору игрока.
// Тексты в коде пишутся по-русски через t('…'); перевод лежит в en.js.

import { EN } from './en.js';

const KEY = 'vihr:lang';
export const LANGS = [['en', 'EN'], ['ru', 'RU']];

export const lang = (() => {
  try { return localStorage.getItem(KEY) === 'ru' ? 'ru' : 'en'; } catch { return 'en'; }
})();

/** Перевести строку: t('Минимум {min}', { min: 3 }) */
export function t(ru, vars) {
  let s = lang === 'en' ? (EN[ru] ?? ru) : ru;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** Сменить язык и перезапустить интерфейс (адрес экрана сохраняется). */
export function setLang(next) {
  if (next === lang) return;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  location.reload();
}

const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];

/** Перевести статический текст разметки (index.html). */
export function translateDom(root = document.body) {
  document.documentElement.lang = lang;
  if (lang === 'ru') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const key = n.nodeValue.trim();
    if (key && EN[key]) n.nodeValue = n.nodeValue.replace(key, EN[key]);
  }
  for (const el of root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && EN[v]) el.setAttribute(a, EN[v]);
    }
  }
}
