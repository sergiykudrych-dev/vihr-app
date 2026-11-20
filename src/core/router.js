// Навигация по экранам через адрес: #games, #play-vortex, #sounds, #track, #builder.
// Простые имена без «/», чтобы ссылки работали и в встроенных просмотрщиках.

const routes = new Map();
let current = null;

export function route(name, { enter, leave } = {}) {
  routes.set(name, { enter, leave });
}

export function go(hash) {
  if (location.hash !== '#' + hash) location.hash = hash;
  else render();
}

function parse() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  if (h.startsWith('play-')) return { name: 'play', param: h.slice(5) };
  return { name: h || 'games', param: null };
}

function render() {
  const { name, param } = parse();
  const r = routes.has(name) ? name : 'games';
  if (current && routes.get(current).leave) routes.get(current).leave();
  current = r;

  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-active', s.dataset.screen === r));
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === r) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.querySelector('.tabbar').hidden = r === 'play';
  document.getElementById('app').dataset.route = r;
  if (routes.get(r).enter) routes.get(r).enter(param);
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  render();
}
