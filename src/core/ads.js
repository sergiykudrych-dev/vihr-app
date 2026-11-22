// Реклама AdsGram перед стартом игры. Правила частоты приходят с сервера (админка).
// Реклама показывается только внутри Telegram и никогда — админу.

import { ADSGRAM_BLOCK_ID } from '../config.js';
import { inTelegram } from './telegram.js';
import { api } from './api.js';

const startedAt = Date.now();
let lastAdAt = 0;
let playsSinceAd = 0;
let controller = null;

function getController() {
  if (controller) return controller;
  if (!window.Adsgram || !ADSGRAM_BLOCK_ID) return null;
  try { controller = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID }); } catch { controller = null; }
  return controller;
}

/** Нужно ли показать рекламу перед этой игрой. Каждый вызов считается за запуск игры. */
export function shouldShowAd() {
  playsSinceAd += 1;
  const s = api.ads;
  if (!s.enabled || !inTelegram || api.isAdmin) return false;
  const now = Date.now();
  if (now - startedAt < s.firstSec * 1000) return false;
  if (lastAdAt && now - lastAdAt < s.gapSec * 1000) return false;
  return playsSinceAd >= s.every;
}

/** Кнопка «Создать видео»: реклама на каждое нажатие (если реклама включена, мы в Telegram и это не админ). */
export function shouldShowRecordAd() {
  const s = api.ads;
  return !!(s.enabled && inTelegram && !api.isAdmin);
}

/** Показать рекламу. Всегда завершается: и после просмотра, и при ошибке, и если рекламы нет. */
export async function showAd(game) {
  const c = getController();
  if (!c) return false;
  try {
    // Страховка: если сеть зависла, игра всё равно стартует через 40 секунд
    await Promise.race([c.show(), new Promise((resolve) => setTimeout(resolve, 40000))]);
    lastAdAt = Date.now();
    playsSinceAd = 0;
    api.event('ad_view', game);
    return true;
  } catch {
    // Нет рекламы или ошибка — не наказываем игрока, просто играем
    return false;
  }
}
