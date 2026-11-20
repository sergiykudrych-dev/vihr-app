// Точка входа: подключает экраны к навигации.

import { route, startRouter } from './core/router.js';
import { initGames, enterGames } from './ui/games.js';
import { initPlay, enterPlay, leavePlay } from './ui/play.js';
import { initSounds } from './ui/sounds.js';
import { initTrack, enterTrack } from './ui/track.js';
import { initBuilder, enterBuilder, leaveBuilder } from './ui/builder.js';
import { audio } from './audio/engine.js';

initGames();
initPlay();
initSounds();
initTrack();
initBuilder();

route('games', { enter: enterGames });
route('play', { enter: enterPlay, leave: leavePlay });
route('sounds', {});
route('track', { enter: enterTrack });
route('builder', { enter: enterBuilder, leave: leaveBuilder });

// Звук в браузере включается только после первого касания
window.addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });

startRouter();
