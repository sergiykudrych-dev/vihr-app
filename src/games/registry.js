// Каталог игр: название, описание, категория, картинка и класс.

import { VortexGame } from './vortex.js';
import { PlinkoGame } from './plinko.js';
import { HexagonGame } from './hexagon.js';
import { LaserGame } from './laser.js';
import { RaysGame } from './rays.js';
import { CustomGame } from './custom.js';
import { TunnelGame } from './tunnel.js';
import { HoneycombGame, TargetGame } from './smash.js';
import { t } from '../i18n/index.js';

export const GAMES = [
  { id: 'vortex', title: t('Вихрь'), sub: t('Разбей радужные кольца'), tag: 'rhythm', thumb: 'assets/img/games/vortex.svg', Game: VortexGame, hint: t('Касайся — в центре появится новый шарик') },
  { id: 'tunnel', title: t('Туннель'), sub: t('Пробей 900 колец'), tag: 'rhythm', thumb: 'assets/img/games/tunnel.svg', Game: TunnelGame, hint: t('Касайся — добавишь ещё шарик') },
  { id: 'honeycomb', title: t('Соты'), sub: t('Шарики разбивают соты'), tag: 'physics', thumb: 'assets/img/games/honeycomb.svg', Game: HoneycombGame, hint: t('Касайся — добавишь шарик') },
  { id: 'target', title: t('Мишень'), sub: t('Разбей радужные плитки'), tag: 'physics', thumb: 'assets/img/games/target.svg', Game: TargetGame, hint: t('Касайся — добавишь шарик') },
  { id: 'plinko', title: t('Плинко'), sub: t('Шарики падают в ноты'), tag: 'physics', thumb: 'assets/img/games/plinko.svg', Game: PlinkoGame, hint: t('Касайся — сверху упадёт шарик') },
  { id: 'hexagon', title: t('Шестиугольник'), sub: t('Мяч бьёт по граням'), tag: 'physics', thumb: 'assets/img/games/hexagon.svg', Game: HexagonGame, hint: t('Касайся — добавишь мяч, веди пальцем — крутишь') },
  { id: 'laser', title: t('Лазерное кольцо'), sub: t('Шары тянут лучи'), tag: 'rhythm', thumb: 'assets/img/games/laser.svg', Game: LaserGame, hint: t('Касайся — добавишь шар') },
  { id: 'rays', title: t('Лучи'), sub: t('Веера света и звука'), tag: 'rhythm', thumb: 'assets/img/games/rays.svg', Game: RaysGame, hint: t('Касайся — добавишь шар') },
];

export const CUSTOM_META = { tag: 'mine', thumb: 'assets/img/games/custom.svg', Game: CustomGame, hint: t('Касайся — добавишь шарик') };

export const CATEGORIES = [
  { id: 'all', name: t('Все') },
  { id: 'rhythm', name: t('Ритм') },
  { id: 'physics', name: t('Физика') },
  { id: 'mine', name: t('Мои') },
];
