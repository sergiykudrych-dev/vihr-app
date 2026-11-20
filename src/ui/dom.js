// Мелкие помощники для работы с разметкой.

export const $ = (sel, root = document) => root.querySelector(sel);

/** Создать элемент: el('button', { class: 'chip', onclick }, 'Текст') */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c instanceof Node ? c : document.createTextNode(c));
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function icon(id, cls = 'icon') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `assets/img/icons/sprite.svg#${id}`);
  svg.append(use);
  return svg;
}

let toastTimer = 0;
export function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-visible'), 2200);
}

/** Группа кнопок «выбери одну» (чипы, сегменты). */
export function pressGroup(container, items, value, onPick, cls = '') {
  container.replaceChildren(...items.map(([id, label]) => el('button', {
    class: cls, type: 'button', 'aria-pressed': String(id === value), 'data-id': id,
    onclick: () => {
      container.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
      onPick(id);
    },
  }, label)));
}

/** Ползунок с подписью значения. */
export function bindSlider(input, out, value, format, onInput) {
  input.value = value;
  out.textContent = format(Number(value));
  input.addEventListener('input', () => {
    out.textContent = format(Number(input.value));
    onInput(Number(input.value));
  });
}

export function fmtTime(sec) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
