let container: HTMLDivElement | null = null;

function getContainer() {
  if (!container) {
    container = document.createElement('div');
    container.style.cssText =
      'position:fixed;top:env(safe-area-inset-top,12px);left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message: string, duration = 2000) {
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText =
    'background:rgba(28,30,36,0.95);color:#fff;padding:2px 14px;border-radius:9999px;font-size:10.5px;line-height:1.2;font-weight:600;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.25);box-shadow:0 4px 20px rgba(0,0,0,0.4);pointer-events:auto;animation:fadeIn .2s ease;max-width:92vw;max-height:5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;';
  getContainer().appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s ease';
    setTimeout(() => el.remove(), 300);
  }, duration);
}
