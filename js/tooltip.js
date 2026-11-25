// Tooltips for the whole app. Any element with a `title` gets a designed tooltip instead of the
// browser's plain one: a short delay, placed above (or below when there is no room), kept inside
// the window, shown on keyboard focus too, and hidden on click, scroll or Escape.
// Buttons on the left rail get it on their right. Large areas (a whole panel) get the tooltip next to the mouse instead of centred on the panel.

const SHOW_DELAY = 350;
const WARM_WINDOW = 600; // moving from one tooltip to the next shows it at once

let tipEl = null;
let target = null;
let timer = null;
let lastHide = 0;
let mouse = { x: 0, y: 0 };

/** Move `title` to `data-tip` so the browser's own tooltip never appears. */
function adopt(el) {
  const text = el.getAttribute('title');
  if (text == null) return;
  el.removeAttribute('title');
  if (!text.trim()) return;
  el.dataset.tip = text;
  if (!el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', text);
}

function find(node) {
  const el = node?.closest?.('[title], [data-tip]');
  if (!el || el.closest('svg')) return null;
  adopt(el);
  return el.dataset.tip ? el : null;
}

function place() {
  if (!tipEl || !target) return;
  const r = target.getBoundingClientRect();
  const big = r.width > 300 || r.height > 110;
  const w = tipEl.offsetWidth;
  const h = tipEl.offsetHeight;
  const gap = 9;
  tipEl.classList.remove('side', 'below');
  // Elements on a vertical bar (data-tip-side="right") get the tooltip beside them.
  if (target.dataset.tipSide === 'right' && r.right + gap + w < window.innerWidth - 8 && r.height < window.innerHeight / 2 && r.left < 120) {
    tipEl.style.transform = `translate(${Math.round(r.right + gap)}px, ${Math.round(r.top + r.height / 2 - h / 2)}px)`;
    tipEl.classList.add('side');
    return;
  }
  const anchorX = big ? mouse.x : r.left + r.width / 2;
  const top = big ? mouse.y - 14 : r.top;
  const bottom = big ? mouse.y + 18 : r.bottom;
  const below = top - h - gap < 6;
  const x = Math.max(8, Math.min(window.innerWidth - w - 8, anchorX - w / 2));
  const y = below ? Math.min(window.innerHeight - h - 6, bottom + gap) : top - h - gap;
  tipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  tipEl.style.setProperty('--arrow', `${Math.max(12, Math.min(w - 12, anchorX - x))}px`);
  tipEl.classList.toggle('below', below);
}

function show(el) {
  if (!el.isConnected || !el.dataset.tip) return;
  target = el;
  tipEl ??= Object.assign(document.createElement('div'), { className: 'tooltip', role: 'tooltip' });
  // In full screen only the full-screen element is drawn, so the tooltip goes inside it.
  const host = document.fullscreenElement || document.body;
  if (tipEl.parentNode !== host) host.append(tipEl);
  tipEl.textContent = el.dataset.tip;
  tipEl.classList.remove('in');
  place();
  requestAnimationFrame(() => tipEl?.classList.add('in'));
}

function hide() {
  clearTimeout(timer);
  timer = null;
  if (target) lastHide = Date.now();
  target = null;
  tipEl?.classList.remove('in');
}

function schedule(el) {
  if (el === target) return;
  hide();
  const warm = Date.now() - lastHide < WARM_WINDOW;
  timer = setTimeout(() => show(el), warm ? 60 : SHOW_DELAY);
}

export function installTooltips() {
  document.addEventListener('pointermove', (e) => {
    mouse = { x: e.clientX, y: e.clientY };
  }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    mouse = { x: e.clientX, y: e.clientY };
    const el = find(e.target);
    if (el) schedule(el);
    else hide();
  });
  document.addEventListener('pointerout', (e) => {
    if (target && !target.contains(e.relatedTarget)) hide();
    else if (!target && timer && !find(e.relatedTarget)) hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = find(e.target);
    if (el && e.target.matches(':focus-visible')) show(el);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hide());
  document.addEventListener('scroll', hide, { capture: true, passive: true });
  window.addEventListener('hashchange', hide);
  // The element under the mouse can be re-rendered (and get a new title) without the mouse moving.
  new MutationObserver(() => {
    if (target && !target.isConnected) hide();
  }).observe(document.body, { childList: true, subtree: true });
}
