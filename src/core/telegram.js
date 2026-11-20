// Интеграция с Telegram Mini Apps. Вне Telegram ничего не делает.
// Документация: https://core.telegram.org/bots/webapps

const tg = window.Telegram && window.Telegram.WebApp;
/** Открыто ли приложение внутри Telegram (initData пустой в обычном браузере). */
export const inTelegram = !!(tg && tg.initData);

const BG = '#0B0A14';
const ver = (v) => tg && tg.isVersionAtLeast && tg.isVersionAtLeast(v);

/** Данные игрока из Telegram (id, имя) или null. Для проверки на сервере нужен tg.initData. */
export const tgUser = inTelegram ? (tg.initDataUnsafe && tg.initDataUnsafe.user) || null : null;
export const tgInitData = inTelegram ? tg.initData : '';

let lastHaptic = 0;
/** Лёгкая вибрация при ударе шарика (не чаще раза в 70 мс). */
export function haptic(strength = 'light') {
  if (!inTelegram || !tg.HapticFeedback) return;
  const now = performance.now();
  if (now - lastHaptic < 70) return;
  lastHaptic = now;
  tg.HapticFeedback.impactOccurred(strength);
}

export function initTelegram({ onBack } = {}) {
  if (!inTelegram) return;
  document.documentElement.classList.add('in-telegram');

  tg.ready();
  tg.expand();
  if (ver('7.7')) tg.disableVerticalSwipes(); // чтобы свайп вниз не закрывал игру
  if (ver('6.1')) {
    tg.setHeaderColor(BG);
    tg.setBackgroundColor(BG);
  }
  if (ver('7.10')) tg.setBottomBarColor(BG);

  // Системная кнопка «Назад» Telegram вместо своей: видна везде, кроме списка игр
  if (ver('6.1') && tg.BackButton) {
    const sync = () => {
      const h = location.hash.replace(/^#\/?/, '');
      const root = h === '' || h === 'games';
      if (root) tg.BackButton.hide(); else tg.BackButton.show();
    };
    tg.BackButton.onClick(() => {
      if (onBack) onBack(); else location.hash = 'games';
    });
    window.addEventListener('hashchange', sync);
    sync();
  }
}
