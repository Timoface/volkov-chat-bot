// Пошаговый ввод: один осознанный жест = один шаг.
// Во время перехода ввод заблокирован; инерция тачпада/колеса после жеста отбрасывается —
// следующий шаг возможен только после паузы в событиях (новый жест) или явного нового «толчка».
const WHEEL_THRESHOLD = 36;   // px накопленной прокрутки для срабатывания
const GESTURE_GAP = 220;      // мс тишины, после которых начинается новый жест
const SETTLE = 280;           // мс устойчивой паузы после прибытия камеры
const SWIPE_MIN = 46;         // px для свайпа

export function createInput(target, { canStep, step, onActivity }) {
  let lastWheel = 0, acc = 0, consumed = false, prevAbs = 0, readyAt = 0;

  const normalize = (e) => {
    let dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (e.deltaMode === 1) dy *= 32; else if (e.deltaMode === 2) dy *= window.innerHeight;
    return dy;
  };

  function tryStep(dir) {
    if (!canStep() || performance.now() < readyAt) return false;
    return step(dir);
  }

  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey) return; // пинч-зум тачпада — не навигация
    const now = performance.now();
    const dy = normalize(e), abs = Math.abs(dy);
    const gap = now - lastWheel;
    lastWheel = now;
    onActivity?.();

    // новый жест: после тишины или при резком «толчке» поверх затухающей инерции
    const freshPush = consumed && canStep() && now >= readyAt && abs > 24 && abs > prevAbs * 2.2 && prevAbs < 40;
    if (gap > GESTURE_GAP || freshPush) { consumed = false; acc = 0; }
    prevAbs = abs * 0.6 + prevAbs * 0.4;

    if (consumed) return;
    if (!canStep() || now < readyAt) { acc = 0; consumed = true; return; } // жест во время перехода сгорает целиком
    if (Math.sign(dy) !== Math.sign(acc)) acc = 0;
    acc += dy;
    if (Math.abs(acc) >= WHEEL_THRESHOLD) {
      consumed = true;
      acc = 0;
      step(Math.sign(dy));
    }
  }

  let touchY = null, touchX = 0, touchT = 0, touchFired = false;
  function onTouchStart(e) {
    if (e.touches.length !== 1) { touchY = null; return; }
    touchY = e.touches[0].clientY; touchX = e.touches[0].clientX; touchT = performance.now(); touchFired = false;
  }
  function onTouchMove(e) {
    if (touchY === null) return;
    if (!e.target.closest?.('button, a')) e.preventDefault();
    const dy = touchY - e.touches[0].clientY, dx = touchX - e.touches[0].clientX;
    if (!touchFired && Math.abs(dy) > SWIPE_MIN && Math.abs(dy) > Math.abs(dx) * 1.2) {
      touchFired = true; // один свайп = один шаг, даже если палец продолжает движение
      onActivity?.();
      tryStep(dy > 0 ? 1 : -1);
    }
  }
  function onTouchEnd() { touchY = null; }

  function onKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
    let dir = 0;
    switch (e.key) {
      case 'ArrowDown': case 'ArrowRight': case 'PageDown': dir = 1; break;
      case 'ArrowUp': case 'ArrowLeft': case 'PageUp': dir = -1; break;
      case ' ': case 'Spacebar':
        if (tag === 'BUTTON' || tag === 'A') return; // пробел на кнопке — это её нажатие
        dir = e.shiftKey ? -1 : 1; break;
      default: return;
    }
    e.preventDefault();
    if (e.repeat) return; // удержание клавиши не листает этапы
    onActivity?.();
    tryStep(dir);
  }

  target.addEventListener('wheel', onWheel, { passive: false });
  target.addEventListener('touchstart', onTouchStart, { passive: true });
  target.addEventListener('touchmove', onTouchMove, { passive: false });
  target.addEventListener('touchend', onTouchEnd, { passive: true });
  target.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('keydown', onKey);

  return {
    // вызывается при прибытии камеры: короткая устойчивая пауза + требование нового жеста
    arrived() { readyAt = performance.now() + SETTLE; consumed = true; acc = 0; },
    dispose() {
      target.removeEventListener('wheel', onWheel);
      target.removeEventListener('touchstart', onTouchStart);
      target.removeEventListener('touchmove', onTouchMove);
      target.removeEventListener('touchend', onTouchEnd);
      target.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('keydown', onKey);
    },
  };
}
