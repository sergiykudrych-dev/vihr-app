// Запрет масштаба и прокрутки страницы — чтобы игра вела себя как приложение.
// Safari на iPhone игнорирует user-scalable=no, поэтому страхуемся событиями.

export function lockViewport() {
  // Щипок двумя пальцами (Safari)
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }

  // Двойное нажатие
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    // Второе касание быстрее 300 мс — это «двойной тап», не даём браузеру увеличить.
    // Поля ввода не трогаем, чтобы в них можно было ставить курсор.
    if (now - lastTouchEnd < 300 && !e.target.closest('input, textarea')) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    // Масштаб двумя пальцами
    if (e.touches.length > 1) { e.preventDefault(); return; }
    // На игровом экране ничего не прокручивается
    if (e.target.closest('.screen--game')) e.preventDefault();
  }, { passive: false });
}
