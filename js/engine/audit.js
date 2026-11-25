// Automatic quality audit. Open any page with ?audit before the # (e.g. /?audit#/learn).
//
// It inspects the live page and lists problems, most serious first, in a small panel and as
// window.__audit (so tools and Claude can read it). It re-runs after every route change.
// The rules come from docs/QUALITY.md; each finding names the rule so it can be looked up there.
//
// It catches what a careful reviewer would notice in the first minute:
//   heavy downloads before the visitor asked for anything, layout shift, long tasks,
//   sideways overflow, squeezed content, over-long lines, things that snap or animate forever,
//   unlabelled buttons and links, images without alt text, low contrast, tiny tap targets.
// It cannot judge taste or flow; docs/QUALITY.md lists the checks that need eyes.

const KB = 1024;
let firstInput = Infinity; // when the visitor first clicked or pressed a key
let cls = 0;
let lcp = 0;
const longTasks = [];
let panel = null;
const firstPage = location.hash; // load timings only describe the page the visitor opened first

function observe(type, fn) {
  try {
    new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true });
  } catch {
    /* not supported in this browser */
  }
}

/** A short CSS-like name for an element, good enough to find it. */
function nameOf(el) {
  if (!el || el.nodeType !== 1) return '';
  const id = el.id ? `#${el.id}` : '';
  const cls = [...el.classList].slice(0, 2).map((c) => `.${c}`).join('');
  const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` “${text}”` : ''}`;
}

const visible = (el) => {
  if (el.closest?.('.audit-panel') || !el.getClientRects().length) return false; // never audit the audit panel
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && Number(s.opacity) > 0.05;
};

// ---------- colour contrast (WCAG 2.2: 4.5:1 for text, 3:1 for large text) ----------

function rgba(str) {
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a };
}
function luminance({ r, g, b }) {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** The solid colour behind an element, or null when there is an image or gradient (unknown). */
function backgroundOf(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.backgroundImage !== 'none') return null;
    const c = rgba(s.backgroundColor);
    if (c && c.a >= 0.9) return c;
  }
  return rgba(getComputedStyle(document.body).backgroundColor);
}

// ---------- the rules ----------

function run() {
  const out = [];
  const add = (level, rule, what, where = []) => out.push({ level, rule, what, where: where.slice(0, 4).map(nameOf).filter(Boolean) });
  const wide = innerWidth > 900;

  // Loading: nothing heavy before the visitor asks for it (facade / import-on-interaction).
  const res = performance.getEntriesByType('resource');
  const size = (r) => r.transferSize || r.encodedBodySize || r.decodedBodySize || 0;
  const early = res.filter((r) => r.startTime < firstInput);
  const heavy = early.filter((r) => size(r) > 150 * KB && /\.(m?js|wasm|zip|whl)(\?|$)|pyodide|three/i.test(r.name));
  for (const r of heavy) add('fail', 'load.heavy-before-ask', `${Math.round(size(r) / KB)} KB downloaded before any click: ${r.name.split('/').pop().split('?')[0]}`);
  const weight = early.reduce((n, r) => n + size(r), 0);
  if (weight > 1500 * KB) add('warn', 'load.page-weight', `${Math.round(weight / KB)} KB downloaded before any click (budget 1500 KB)`);

  // Stability and speed (Core Web Vitals: CLS ≤ 0.1, LCP ≤ 2.5 s).
  if (cls > 0.1) add('fail', 'perf.layout-shift', `Layout shift ${cls.toFixed(3)} (budget 0.1): things move after they appear`);
  else if (cls > 0.05) add('warn', 'perf.layout-shift', `Layout shift ${cls.toFixed(3)}: close to the 0.1 budget`);
  if (lcp > 2500 && location.hash === firstPage) add('warn', 'perf.lcp', `Main content appeared after ${Math.round(lcp)} ms (budget 2500 ms)`);
  const slow = longTasks.filter((t) => t > 200);
  if (slow.length) add('warn', 'perf.long-task', `Since the page opened: ${slow.length} script task${slow.length > 1 ? 's' : ''} over 200 ms (longest ${Math.round(Math.max(...slow))} ms): the page freezes meanwhile`);

  // Layout: no sideways scrolling; content uses the room; readable lines.
  if (document.documentElement.scrollWidth > innerWidth + 1) {
    const culprits = [...document.querySelectorAll('body *')].filter((el) => visible(el) && el.getBoundingClientRect().right > innerWidth + 1 && !el.closest('[class*="drawer"], .tree-pane, .peek'));
    add('fail', 'layout.overflow-x', `The page scrolls sideways (${document.documentElement.scrollWidth}px wide on a ${innerWidth}px screen)`, culprits);
  }
  if (innerWidth >= 1280) {
    for (const main of document.querySelectorAll('.article, .lesson, .learn-wrap')) {
      if (!visible(main)) continue;
      const room = main.parentElement.clientWidth;
      const used = main.getBoundingClientRect().width;
      if (room > 900 && used / room < 0.6) add('warn', 'layout.squeezed', `Main content uses ${Math.round((used / room) * 100)}% of the available width (${Math.round(used)} of ${room}px)`, [main]);
    }
  }
  const longLines = [...document.querySelectorAll('.prose p, .lead')].filter((p) => {
    if (!visible(p)) return false;
    // Real characters per line: the text length over the number of lines it wraps to.
    const s = getComputedStyle(p);
    const lineHeight = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.5;
    const lines = Math.round(p.getBoundingClientRect().height / lineHeight);
    return lines >= 4 && p.textContent.trim().length / (lines - 0.5) > 95; // short paragraphs give unreliable counts
  });
  if (longLines.length) add('warn', 'layout.line-length', `${longLines.length} paragraph${longLines.length > 1 ? 's' : ''} wider than about 95 characters a line: hard to read`, longLines);

  // Motion: nothing loops forever unless it moves only transform/opacity; nothing big runs unasked.
  const forever = document.getAnimations().filter((a) => a.effect?.getTiming().iterations === Infinity && a.playState === 'running' && a.effect.target && visible(a.effect.target));
  const costly = forever.filter((a) => {
    const props = (a.effect.getKeyframes?.() || []).flatMap((k) => Object.keys(k)).filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p));
    return props.some((p) => !['transform', 'opacity'].includes(p));
  });
  if (costly.length) add('fail', 'motion.costly-loop', `${costly.length} endless animation${costly.length > 1 ? 's' : ''} repaint the page every frame (only transform/opacity may loop)`, costly.map((a) => a.effect.target));
  if (forever.length > 3) add('warn', 'motion.busy', `${forever.length} things keep animating on their own: the page never rests`, forever.map((a) => a.effect.target));
  // A canvas that IS the page (the home map, the graph) is fine; one embedded in reading content is not.
  const canvases = [...document.querySelectorAll('.prose canvas, .kv-block canvas, .lesson canvas')].filter((c) => visible(c) && c.width * c.height > 200000);
  if (canvases.length && firstInput === Infinity) add('warn', 'motion.unasked-3d', 'A large canvas (3D or animation) is running before the visitor asked for it', canvases);

  // Snapping: state classes that switch display:none cannot animate (docs/ENGINEERING.md §2b).
  const snaps = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of rules) {
      if (r.selectorText && /\.[\w-]*(collapsed|closed|expanded|open)\b/.test(r.selectorText) && r.style?.display === 'none' && !/@media/.test(r.parentRule?.cssText || '')) snaps.push(r.selectorText);
    }
  }
  if (snaps.length) out.push({ level: 'warn', rule: 'motion.snap', what: `${snaps.length} open/close state${snaps.length > 1 ? 's' : ''} switch with display:none, so they snap instead of moving`, where: snaps.slice(0, 4) });

  // Floating things on top of each other: two visible overlays (a message, a legend, a button
  // group) that share space in the same container, so one hides the other.
  const floaters = [...document.querySelectorAll('body *')].filter((el) => {
    if (el.closest('.audit-panel, [data-overlay], [aria-hidden="true"]') || !visible(el)) return false; // meant to sit on top, or decoration
    const pos = getComputedStyle(el).position;
    if (pos !== 'absolute' && pos !== 'fixed') return false;
    const r = el.getBoundingClientRect();
    const p = el.offsetParent?.getBoundingClientRect();
    return r.width > 20 && r.height > 12 && (!p || r.width * r.height < p.width * p.height * 0.5); // not full-size layers
  });
  const clashes = [];
  for (let i = 0; i < floaters.length; i++) {
    for (let j = i + 1; j < floaters.length; j++) {
      const [a, b] = [floaters[i], floaters[j]];
      if (a.parentElement !== b.parentElement) continue; // only siblings compete for the same space
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const hgt = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 1 && hgt > 1) clashes.push(a, b); // any real overlap: even a few pixels look broken
    }
  }
  if (clashes.length) add('fail', 'ui.overlap', `${clashes.length / 2} pair${clashes.length > 2 ? 's' : ''} of floating elements cover each other`, clashes);

  // Invisible layers that still catch clicks (a dialog fading out, a forgotten overlay): the
  // visitor clicks a button they can see and nothing happens.
  const blockers = [...document.querySelectorAll('body *')].filter((el) => {
    if (el.closest('.audit-panel') || !el.getClientRects().length) return false;
    const s = getComputedStyle(el);
    if (s.pointerEvents === 'none' || s.visibility === 'hidden' || Number(s.opacity) > 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width * r.height > innerWidth * innerHeight * 0.25;
  });
  if (blockers.length) add('fail', 'ui.invisible-blocker', `${blockers.length} invisible layer${blockers.length > 1 ? 's cover' : ' covers'} the page and catch${blockers.length > 1 ? '' : 'es'} clicks`, blockers);

  // Words: a count and its word agree ("1 category", not "1 categories").
  const plural = [...document.body.innerText.matchAll(/(?<![\d.,])1 (notes|links|categories|universes|lessons|commands|drafts|runs|lines|steps|words|missions|squares|items|results)\b/g)].map((m) => m[0]);
  if (plural.length) out.push({ level: 'warn', rule: 'copy.plural', what: `A count does not match its word: ${[...new Set(plural)].join(', ')}`, where: [] });

  // Accessibility basics (WCAG 2.2 AA).
  const interactive = [...document.querySelectorAll('button, a[href], [role="button"], input:not([type="hidden"]), select, textarea')].filter(visible);
  const unnamed = interactive.filter((el) => {
    const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.dataset.tip || el.textContent.trim() || el.querySelector('img[alt]')?.alt;
    const forLabel = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    return !label && !forLabel && !el.closest('label') && !el.placeholder;
  });
  if (unnamed.length) add('fail', 'a11y.name', `${unnamed.length} button${unnamed.length > 1 ? 's or links have' : ' or link has'} no name a screen reader can say`, unnamed);
  const noAlt = [...document.querySelectorAll('img:not([alt])')].filter(visible);
  if (noAlt.length) add('fail', 'a11y.alt', `${noAlt.length} image${noAlt.length > 1 ? 's have' : ' has'} no alt text`, noAlt);
  if (!wide) {
    const tiny = interactive.filter((el) => {
      const r = el.getBoundingClientRect();
      // Words inside text (underlined terms, links in sentences) are exempt under WCAG 2.5.8.
      return (r.width < 24 || r.height < 24) && !el.closest('p, li, .prose') && !el.classList.contains('kv-term');
    });
    if (tiny.length) add('warn', 'a11y.target-size', `${tiny.length} tap target${tiny.length > 1 ? 's are' : ' is'} smaller than 24×24 px on a phone`, tiny);
  }
  const lowContrast = [];
  let checked = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (checked > 1500) break;
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) continue;
    if (!visible(el) || el.closest('svg, canvas, [aria-hidden="true"]')) continue;
    checked++;
    const s = getComputedStyle(el);
    const fg = rgba(s.color);
    const bg = backgroundOf(el);
    if (!fg || !bg || fg.a < 0.5) continue;
    const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    const px = parseFloat(s.fontSize);
    const large = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) lowContrast.push(el);
  }
  if (lowContrast.length) add('warn', 'a11y.contrast', `${lowContrast.length} piece${lowContrast.length > 1 ? 's' : ''} of text below the contrast minimum (4.5:1, or 3:1 when large)`, lowContrast);

  const order = { fail: 0, warn: 1 };
  out.sort((a, b) => order[a.level] - order[b.level]);
  return { page: location.hash || '#/', width: innerWidth, at: new Date().toISOString(), interacted: firstInput !== Infinity, findings: out };
}

// ---------- the panel ----------

function render(result) {
  panel ??= Object.assign(document.createElement('aside'), { className: 'audit-panel' });
  if (!panel.isConnected) document.body.append(panel);
  const fails = result.findings.filter((f) => f.level === 'fail').length;
  const warns = result.findings.length - fails;
  panel.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'audit-head';
  head.textContent = result.findings.length ? `Audit · ${fails} fail · ${warns} warn` : 'Audit · nothing found';
  const again = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Run again', onclick: () => runAudit() });
  const fold = Object.assign(document.createElement('button'), { type: 'button', textContent: '–', title: 'Fold', onclick: () => panel.classList.toggle('folded') });
  head.append(again, fold);
  const list = document.createElement('ol');
  for (const f of result.findings) {
    const li = document.createElement('li');
    li.className = f.level;
    li.innerHTML = `<b></b><span></span><small></small>`;
    li.querySelector('b').textContent = f.rule;
    li.querySelector('span').textContent = f.what;
    li.querySelector('small').textContent = f.where.join('  ·  ');
    list.append(li);
  }
  panel.append(head, list);
}

export function runAudit({ quiet = false } = {}) {
  const result = run();
  window.__audit = result;
  if (!quiet) render(result);
  return result;
}

/** Tell the audit the visitor has interacted (used by the scenario sweep, which clicks in code). */
export function markInteraction() {
  firstInput = Math.min(firstInput, performance.now());
}

/** The panel styles, shared with the scenario sweep (added once). */
export function ensureStyle() {
  if (document.getElementById('audit-style')) return;
  const style = Object.assign(document.createElement('style'), { id: 'audit-style' });
  style.textContent = `.audit-panel{position:fixed;left:12px;bottom:12px;z-index:9999;width:min(460px,calc(100vw - 24px));max-height:46vh;overflow:auto;border-radius:12px;border:1px solid #39415a;background:#0e1220;color:#e6e9f2;font:12px/1.45 system-ui,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.6)}
.audit-head{position:sticky;top:0;display:flex;gap:8px;align-items:center;padding:8px 10px;background:#151b2e;font-weight:700}
.audit-head button{margin-left:auto;font:inherit;font-weight:600;color:#cfd6ea;background:#232b44;border:0;border-radius:6px;padding:3px 8px;cursor:pointer}.audit-head button+button{margin-left:0}
.audit-panel ol{margin:0;padding:6px 10px 10px 28px}.audit-panel li{margin:6px 0}.audit-panel li b{display:block;font:600 11px ui-monospace,monospace}
.audit-panel li.fail b{color:#ff7a8a}.audit-panel li.warn b{color:#ffd27a}.audit-panel small{display:block;color:#8f98b3;word-break:break-word}
.audit-panel.folded ol{display:none}`;
  document.head.append(style);
}

export function installAudit() {
  const mark = () => (firstInput = Math.min(firstInput, performance.now()));
  addEventListener('pointerdown', (e) => !e.target.closest?.('.audit-panel') && mark(), { capture: true, passive: true });
  addEventListener('keydown', mark, { capture: true, passive: true });
  observe('layout-shift', (e) => !e.hadRecentInput && (cls += e.value));
  observe('largest-contentful-paint', (e) => (lcp = e.startTime));
  observe('longtask', (e) => longTasks.push(e.duration));
  ensureStyle();
  setTimeout(runAudit, 2500);
  addEventListener('hashchange', () => setTimeout(runAudit, 1500));
}
