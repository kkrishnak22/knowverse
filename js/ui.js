// Small DOM helpers shared by every view.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** h('div', { class: 'x', onclick: fn }, child, 'text') */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v)) p.startsWith('--') ? el.style.setProperty(p, val) : (el.style[p] = val);
    }
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Replace an element's children, skipping null/false entries. */
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false).map((c) => (c.nodeType ? c : document.createTextNode(String(c)))));
  return el;
}

const P = (d) => `<path d="${d}"/>`;
const svg = (inner) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const icons = {
  graph: svg('<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="12" cy="18" r="2.5"/>' + P('M8.3 7l7.3.7M7.2 8.2l3.7 7.6M16.8 10.2l-3.6 5.6')),
  book: svg(P('M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z') + P('M4 20.5A2.5 2.5 0 0 0 6.5 21H20') + P('M9 8h7M9 12h5')),
  sparkles: svg(P('M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z') + P('M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z')),
  search: svg('<circle cx="11" cy="11" r="6.5"/>' + P('M20 20l-4.2-4.2')),
  settings: svg('<circle cx="12" cy="12" r="3"/>' + P('M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z')),
  plus: svg(P('M12 5v14M5 12h14')),
  minus: svg(P('M5 12h14')),
  x: svg(P('M6 6l12 12M18 6L6 18')),
  chevron: svg(P('M9 6l6 6-6 6')),
  chevronLeft: svg(P('M15 6l-6 6 6 6')),
  skip: svg(P('M6 6l8 6-8 6zM18 6v12')),
  learn: svg(P('M2 9l10-5 10 5-10 5z') + P('M6 11v5c3 2.5 9 2.5 12 0v-5') + P('M22 9v6')),
  users: svg('<circle cx="9" cy="8" r="3.2"/>' + P('M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6') + '<circle cx="17" cy="9" r="2.4"/>' + P('M16 14.2c3 .2 5 2.6 5 5.8')),
  message: svg(P('M4 5h16v11H9l-5 4z')),
  target: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/>' + P('M8 11V8a4 4 0 0 1 8 0v3')),
  globe: svg('<circle cx="12" cy="12" r="8.5"/>' + P('M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17')),
  arrowRight: svg(P('M5 12h14M13 6l6 6-6 6')),
  send: svg(P('M5 12l14-7-5 14-3-6z')),
  stop: svg('<rect x="7" y="7" width="10" height="10" rx="1.5"/>'),
  check: svg(P('M5 12.5l4.5 4.5L19 7.5')),
  github: svg(P('M9 19c-4.5 1.4-4.5-2.3-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21')),
  download: svg(P('M12 4v11M7 10.5l5 5 5-5M5 20h14')),
  edit: svg(P('M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z') + P('M14.5 7.5l3 3')),
  trash: svg(P('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3')),
  undo: svg(P('M9 14L4 9l5-5') + P('M4 9h10a6 6 0 0 1 0 12h-3')),
  fit: svg(P('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')),
  link: svg(P('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1') + P('M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1')),
  file: svg(P('M6 3h8l5 5v13H6z') + P('M14 3v5h5')),
  eye: svg(P('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z') + '<circle cx="12" cy="12" r="3"/>'),
  code: svg(P('M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14')),
  sliders: svg(P('M4 7h10M18 7h2M4 17h4M12 17h8') + '<circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  tag: svg(P('M3 12V4h8l10 10-8 8z') + '<circle cx="7.5" cy="8.5" r="1.2"/>'),
  menu: svg(P('M4 7h16M4 12h16M4 17h16')),
  panelLeft: svg('<rect x="3" y="4" width="18" height="16" rx="2"/>' + P('M9 4v16')),
  unfold: svg(P('M8 9l4-4 4 4M8 15l4 4 4-4')),
  fold: svg(P('M8 4l4 4 4-4M8 20l4-4 4 4')),
  grip: svg('<circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/>'),
  turnLeft: svg(P('M9 14L4 9l5-5') + P('M4 9h9a6 6 0 0 1 6 6v5')),
  turnRight: svg(P('M15 14l5-5-5-5') + P('M20 9h-9a6 6 0 0 0-6 6v5')),
  arrowUp: svg(P('M12 19V5M6 11l6-6 6 6')),
  panel: svg('<rect x="3" y="4" width="18" height="16" rx="2"/>' + P('M15 4v16')),
  clock: svg('<circle cx="12" cy="12" r="8.5"/>' + P('M12 7.5V12l3 2')),
  upload: svg(P('M12 20V9M7 13.5l5-5 5 5M5 4h14')),
  home: svg(P('M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z')),
  orbit: svg('<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-28 12 12)"/>'),
  layers: svg(P('M12 3l9 5-9 5-9-5z') + P('M3 12.5l9 5 9-5') + P('M3 16.5l9 5 9-5')),
  brain: svg(P('M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V7a3 3 0 0 0-3-3z') + P('M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0')),
  briefcase: svg('<rect x="3" y="7" width="18" height="13" rx="2"/>' + P('M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18')),
  chart: svg(P('M4 20V10M10 20V4M16 20v-7M21 20H3')),
  cloud: svg(P('M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.2A3.5 3.5 0 0 1 17 18z')),
  atom: svg('<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>'),
  pi: svg(P('M4 7h16M9 7v11M15 7v8a3 3 0 0 0 3 3')),
  cpu: svg('<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="10" y="10" width="4" height="4"/>' + P('M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3')),
  play: svg(P('M7 5l12 7-12 7z')),
  pause: svg(P('M8 5v14M16 5v14')),
  info: svg('<circle cx="12" cy="12" r="8.5"/>' + P('M12 11v5M12 7.8v.2')),
};

export const icon = (name, cls = '') => h('span', { class: `ico ${cls}`, html: icons[name] || '' });

/** Fill any <span data-icon="name"> placeholders in static HTML. */
export function hydrateIcons(root = document) {
  for (const el of $$('[data-icon]', root)) el.innerHTML = icons[el.dataset.icon] || '';
}

export function toast(message, kind = 'info', ms = 3800) {
  const el = h('div', { class: `toast ${kind}` }, icon(kind === 'error' ? 'info' : kind === 'success' ? 'check' : 'info'), h('span', {}, message));
  $('#toasts').append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

export function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Open a modal dialog. Returns { close, el }. */
export function openModal({ title, body, footer, wide = false, onClose }) {
  const overlays = $('#overlays');
  const close = () => {
    backdrop.classList.remove('in');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => backdrop.remove(), 180);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  const dialog = h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Close' }, icon('x'))),
    h('div', { class: 'modal-body' }, body),
    footer && h('footer', { class: 'modal-foot' }, footer),
  );
  const backdrop = h('div', { class: 'backdrop', onmousedown: (e) => e.target === backdrop && close() }, dialog);
  overlays.append(backdrop);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => backdrop.classList.add('in'));
  return { close, el: dialog };
}

export function downloadText(filename, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/markdown' })), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

/** Run `fn` once, the first time `el` comes near the viewport. Returns a function that cancels the wait. */
export function whenVisible(el, fn) {
  const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && (io.disconnect(), fn()), { rootMargin: '200px' });
  io.observe(el);
  return () => io.disconnect();
}

export const debounce = (fn, ms = 200) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};
