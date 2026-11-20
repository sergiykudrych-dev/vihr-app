// Точка входа: подключает экраны к навигации.

import { route, startRouter } from './core/router.js';
import { initGames, enterGames } from './ui/games.js';
import { initPlay, enterPlay, leavePlay } from './ui/play.js';
import { initSounds } from './ui/sounds.js';
import { initTrack, enterTrack } from './ui/track.js';
import { initBuilder, enterBuilder, leaveBuilder } from './ui/builder.js';
import { audio } from './audio/engine.js';
import { lockViewport } from './core/nozoom.js';
import { initTelegram, haptic } from './core/telegram.js';
import { api } from './core/api.js';
import { initAdmin, enterAdmin } from './ui/admin.js';
import { lang, setLang, translateDom } from './i18n/index.js';

// Язык: переводим разметку до запуска экранов
translateDom();
// Название приложения: Spinly по-английски, Вихрь по-русски
document.title = lang === 'en' ? 'Spinly' : 'Вихрь';
if (lang === 'en') document.getElementById('games-title').textContent = 'Spinly';
const langBtn = document.getElementById('lang-toggle');
langBtn.textContent = lang === 'en' ? 'RU' : 'EN'; // кнопка показывает язык, на который переключит
langBtn.addEventListener('click', () => setLang(lang === 'en' ? 'ru' : 'en'));

lockViewport();
initTelegram();
audio.onHit = () => haptic('light');

initGames();
initPlay();
initSounds();
initTrack();
initBuilder();
initAdmin();

route('games', { enter: enterGames });
route('play', { enter: enterPlay, leave: leavePlay });
route('sounds', {});
route('track', { enter: enterTrack });
route('builder', { enter: enterBuilder, leave: leaveBuilder });
route('admin', { enter: enterAdmin });

// Звук в браузере включается только после первого касания
window.addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });

startRouter();

// Регистрация игрока и список выключенных игр; экран «Игры» обновится сам
api.hello();
