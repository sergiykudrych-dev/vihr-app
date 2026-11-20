// Каталог игр: название, описание, категория, картинка и класс.

import { VortexGame } from './vortex.js';
import { PlinkoGame } from './plinko.js';
import { HexagonGame } from './hexagon.js';
import { LaserGame } from './laser.js';
import { RaysGame } from './rays.js';
import { CustomGame } from './custom.js';

export const GAMES = [
  { id: 'vortex', title: 'Вихрь', sub: 'Разбей радужные кольца', tag: 'rhythm', thumb: 'assets/img/games/vortex.svg', Game: VortexGame, hint: 'Касайся — в центре появится новый шарик' },
  { id: 'plinko', title: 'Плинко', sub: 'Шарики падают в ноты', tag: 'physics', thumb: 'assets/img/games/plinko.svg', Game: PlinkoGame, hint: 'Касайся — сверху упадёт шарик' },
  { id: 'hexagon', title: 'Шестиугольник', sub: 'Мяч бьёт по граням', tag: 'physics', thumb: 'assets/img/games/hexagon.svg', Game: HexagonGame, hint: 'Касайся — добавишь мяч, веди пальцем — крутишь' },
  { id: 'laser', title: 'Лазерное кольцо', sub: 'Шары тянут лучи', tag: 'rhythm', thumb: 'assets/img/games/laser.svg', Game: LaserGame, hint: 'Касайся — добавишь шар' },
  { id: 'rays', title: 'Лучи', sub: 'Веера света и звука', tag: 'rhythm', thumb: 'assets/img/games/rays.svg', Game: RaysGame, hint: 'Касайся — добавишь шар' },
];

export const CUSTOM_META = { tag: 'mine', thumb: 'assets/img/games/custom.svg', Game: CustomGame, hint: 'Касайся — добавишь шарик' };

export const CATEGORIES = [
  { id: 'all', name: 'Все' },
  { id: 'rhythm', name: 'Ритм' },
  { id: 'physics', name: 'Физика' },
  { id: 'mine', name: 'Мои' },
];
