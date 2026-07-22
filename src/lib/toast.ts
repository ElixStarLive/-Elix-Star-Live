let container: HTMLDivElement | null = null;
let activeEl: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let removeTimer: ReturnType<typeof setTimeout> | null = null;
let lastMessage = '';
let lastShownAt = 0;

/** Same message within this window is ignored — one capsule only per action burst. */
const DEDUPE_MS = 2500;

const TOAST_STYLE =
  'background:rgba(28,30,36,0.95);color:#FF6B6B;padding:2px 14px;border-radius:9999px;font-size:10.5px;line-height:1.2;font-weight:600;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.25);box-shadow:0 4px 20px rgba(0,0,0,0.4);pointer-events:auto;animation:fadeIn .2s ease;max-width:92vw;max-height:5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;';

function getContainer() {
  if (!container) {
    container = document.createElement('div');
    container.style.cssText =
      'position:fixed;top:env(safe-area-inset-top,12px);left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
  }
  return container;
}

function clearTimers() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (removeTimer) {
    clearTimeout(removeTimer);
    removeTimer = null;
  }
}

function dismissActive() {
  clearTimers();
  if (activeEl) {
    activeEl.remove();
    activeEl = null;
  }
}

export function showToast(message: string, duration = 2000) {
  const trimmed = typeof message === 'string' ? message.trim() : '';
  if (!trimmed) return;

  const now = Date.now();
  if (trimmed === lastMessage && now - lastShownAt < DEDUPE_MS) {
    return;
  }
  lastMessage = trimmed;
  lastShownAt = now;

  clearTimers();

  if (!activeEl) {
    activeEl = document.createElement('div');
    activeEl.style.cssText = TOAST_STYLE;
    getContainer().appendChild(activeEl);
  } else {
    Array.from(getContainer().children).forEach((child) => {
      if (child !== activeEl) child.remove();
    });
  }

  activeEl.textContent = trimmed;
  activeEl.style.opacity = '1';
  activeEl.style.transition = '';

  hideTimer = setTimeout(() => {
    if (!activeEl) return;
    activeEl.style.opacity = '0';
    activeEl.style.transition = 'opacity .3s ease';
    removeTimer = setTimeout(() => {
      dismissActive();
      lastMessage = '';
    }, 300);
  }, duration);
}
