// Learn mode: interactive courses inside each universe.
//   #/learn            → the course map for the current universe
//   #/learn/<note id>  → one lesson: the interactive stage first, then tabs (See · Play · Remember · Explain · Exam)
//
// Courses are plain notes, so they follow the vault's hierarchy:
//   hub → category (a course, e.g. "Python") → topic (a module) → subtopic with `lesson: true` (a lesson)
// Lesson bodies are Markdown; ```kv-*``` blocks inside them become kit components (js/kit/).
// Text follows the language switch: the screen's words come from ./learnStrings.js and a lesson's
// Telugish version (<name>.te.md) is used when there is one. Glossary words in lessons are underlined.

import { vault, on, colorOf, lsGet, lsSet, currentUniverse, setUi, getUi, inLang } from '../store.js';
import { renderMarkdown } from '../markdown.js';
import { hydrate } from '../kit/blocks.js';
import { h, fill, icon, toast } from '../ui.js';
import { translator, getLang, htmlLang } from '../i18n.js';
import { termifyProse } from '../words.js';
import { LEARN_STRINGS } from './learnStrings.js';

const t = translator(LEARN_STRINGS);

const PROGRESS_KEY = 'snu.learn';
// Section headings stay "## See", "## Play"… in every language's Markdown; only their labels change.
const SECTIONS = [
  { key: 'see', label: 'See', ico: 'eye' },
  { key: 'play', label: 'Play', ico: 'code' },
  { key: 'remember', label: 'Remember', ico: 'clock' },
  { key: 'explain', label: 'Explain', ico: 'message' },
  { key: 'exam', label: 'Exam', ico: 'file' },
];
const SOON_ICONS = ['message', 'users', 'target', 'file', 'globe'];

let root = null;
let unhydrate = null;
let current = null;
let tab = null; // the open lesson tab, kept when the language changes

// ---------- Progress (this browser only) ----------

const progress = () => lsGet(PROGRESS_KEY, { done: {} });
const isDone = (id) => Boolean(progress().done[id]);
function setDone(id, done) {
  const p = progress();
  if (done) p.done[id] = Date.now();
  else delete p.done[id];
  lsSet(PROGRESS_KEY, p);
}

// ---------- Course structure ----------

const byOrder = (a, b) => a.order - b.order || a.title.localeCompare(b.title, undefined, { numeric: true });

/** Every course in the current universe: [{ course, modules: [{ module, lessons }], lessons }] */
export function courses() {
  const out = [];
  for (const cat of vault.notes.filter((n) => n.type === 'category')) {
    const modules = (vault.children.get(cat.id) || [])
      .filter((m) => m.type === 'topic')
      .map((m) => ({ module: m, lessons: (vault.children.get(m.id) || []).filter((l) => l.lesson).sort(byOrder) }))
      .filter((m) => m.lessons.length)
      .sort((a, b) => byOrder(a.module, b.module));
    if (modules.length) out.push({ course: cat, modules, lessons: modules.flatMap((m) => m.lessons) });
  }
  return out.sort((a, b) => byOrder(a.course, b.course));
}

function courseOf(lesson) {
  return courses().find((c) => c.lessons.includes(lesson)) || null;
}

// ---------- Mount ----------

export function mount(el, param) {
  root = el;
  el.className = 'learn-view';
  const off = on('vault', () => show(current));
  const relang = () => show(current, true);
  document.addEventListener('kv-lang-changed', relang);
  show(param);
  return () => {
    off();
    document.removeEventListener('kv-lang-changed', relang);
    unhydrate?.();
    unhydrate = null;
  };
}

export function update(param) {
  show(param);
}

function show(param, keepPlace = false) {
  const same = keepPlace && param === current;
  if (!same) tab = null;
  current = param || '';
  const top = root.scrollTop;
  unhydrate?.();
  unhydrate = null;
  root.lang = htmlLang();
  const note = param && vault.byId.get(param);
  if (note && note.lesson) renderLesson(note);
  else renderMap();
  root.scrollTop = same ? top : 0;
}

// ---------- Course map ----------

function renderMap() {
  const u = currentUniverse();
  document.title = `${u.name} Learn · ${vault.name}`;
  const list = courses();

  const soon = h('aside', { class: 'learn-soon' },
    h('h3', {}, t('comingSoon')),
    t('soon').map(([title, text], i) => h('div', { class: 'soon-card' }, h('span', { class: 'soon-ico' }, icon(SOON_ICONS[i])), h('div', {}, h('strong', {}, title), h('p', {}, text)), icon('lock', 'soon-lock'))),
  );

  if (!list.length) {
    fill(root, h('div', { class: 'learn-wrap' },
      h('section', { class: 'learn-empty', style: { '--u': u.accent } },
        h('div', { class: 'orbit' }),
        h('span', { class: 'kicker' }, t('universe', u.name)),
        h('h1', {}, t('emptyTitle')),
        h('p', {}, t('emptyText')),
        h('div', { class: 'row' },
          // A note id carries its universe, so this link switches to Programming and opens its course map.
          h('a', { class: 'btn primary', href: '#/learn/programming/python/python' }, icon('learn'), t('openPython')),
          h('a', { class: 'btn', href: '#/note' }, icon('book'), t('readDocs')),
        ),
      ),
      soon,
    ));
    return;
  }

  fill(root, h('div', { class: 'learn-wrap' },
    h('div', { class: 'learn-main' }, list.map(renderCourse)),
    soon,
  ));
}

// Which modules the student has collapsed on the course map.
const closedModules = () => getUi().learnClosed || [];
function rememberModule(id, open) {
  const closed = closedModules().filter((x) => x !== id);
  if (!open) closed.push(id);
  setUi({ learnClosed: closed });
}
function setModules(courseEl, open) {
  for (const d of courseEl.querySelectorAll('details.module')) d.open = open;
}

function renderCourse({ course: courseNote, modules, lessons }) {
  const course = inLang(courseNote);
  const color = colorOf(courseNote);
  const ready = lessons.filter((l) => !l.placeholder);
  const done = ready.filter((l) => isDone(l.id)).length;
  const next = ready.find((l) => !isDone(l.id)) || ready[0];
  let number = 0;

  return h('section', { class: 'course', style: { '--c': color } },
    h('header', { class: 'course-hero' },
      h('div', { class: 'course-glow' }),
      h('span', { class: 'kicker' }, icon('learn'), t('course')),
      h('h1', {}, course.title),
      course.description && h('p', { class: 'lead' }, course.description),
      h('div', { class: 'course-progress' },
        h('div', { class: 'bar' }, h('span', { style: { width: `${ready.length ? (done / ready.length) * 100 : 0}%` } })),
        h('span', {}, t('progress', done, ready.length)),
      ),
      next && h('a', { class: 'btn primary', href: `#/learn/${next.id}` }, icon('play'), done ? t('continue', inLang(next).title) : t('start', inLang(next).title)),
    ),
    h('div', { class: 'module-tools' },
      h('button', { class: 'btn ghost small-btn', type: 'button', onclick: (e) => setModules(e.target.closest('.course'), true) }, icon('unfold'), t('expandAll')),
      h('button', { class: 'btn ghost small-btn', type: 'button', onclick: (e) => setModules(e.target.closest('.course'), false) }, icon('fold'), t('collapseAll'))),
    modules.map(({ module: moduleNote, lessons: ls }) => ((module) => h('details', { class: 'module', open: !closedModules().includes(module.id), 'data-id': module.id, ontoggle: (e) => rememberModule(module.id, e.target.open) },
      h('summary', { class: 'module-head', title: t('moduleToggle') }, icon('chevron', 'module-twisty'), h('h2', {}, module.title), module.description && h('p', {}, module.description),
        h('span', { class: 'module-count' }, `${ls.filter((l) => isDone(l.id)).length}/${ls.length}`)),
      h('div', { class: 'lesson-list' }, ls.map((l) => {
        number++;
        const state = l.placeholder ? 'soon' : isDone(l.id) ? 'done' : l === next ? 'next' : '';
        return h(l.placeholder ? 'div' : 'a', { class: `lesson-row ${state}`, href: l.placeholder ? null : `#/learn/${l.id}` },
          h('span', { class: 'lesson-num' }, state === 'done' ? icon('check') : String(number).padStart(2, '0')),
          h('span', { class: 'lesson-text' }, h('strong', {}, inLang(l).title), h('span', {}, inLang(l).description)),
          h('span', { class: 'lesson-state' }, state === 'soon' ? t('stateSoon') : state === 'next' ? t('stateNext') : state === 'done' ? t('stateDone') : ''),
          !l.placeholder && icon('chevron'),
        );
      })),
    ))(inLang(moduleNote))),
  );
}

// ---------- Lesson ----------

/** Split a lesson body into the intro (before the first ## heading) and the known sections. */
export function splitSections(body) {
  const lines = String(body).split('\n');
  const parts = { intro: [] };
  let cur = 'intro';
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    const m = !inFence && line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      const key = SECTIONS.find((s) => s.label.toLowerCase() === m[1].toLowerCase())?.key;
      if (key) {
        cur = key;
        parts[cur] = [];
        continue;
      }
    }
    (parts[cur] ||= []).push(line);
  }
  return Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.join('\n').trim()]));
}

function renderLesson(note) {
  const view = inLang(note); // the words; `note` keeps its place in the course
  const info = courseOf(note);
  const lessons = info?.lessons || [note];
  const at = lessons.indexOf(note);
  const prev = lessons.slice(0, at).reverse().find((l) => !l.placeholder);
  const next = lessons.slice(at + 1).find((l) => !l.placeholder);
  const module = inLang(vault.parentOf.get(note.id));
  const color = colorOf(note);
  const parts = splitSections(view.body);
  const untranslated = getLang() === 'te' && !note.te && !note.placeholder;
  setUi({ lastLesson: note.id });
  document.title = `${view.title} · ${inLang(info?.course)?.title || 'Learn'} · ${vault.name}`;

  const panels = {};
  const tabs = SECTIONS.map((s) => {
    const content = parts[s.key];
    panels[s.key] = h('div', { class: 'lesson-panel', role: 'tabpanel', hidden: true },
      content
        ? h('div', { class: 'prose', html: renderMarkdown(content).html })
        : h('div', { class: 'soon-panel' }, icon('lock'), h('p', {}, t('sections')[s.key][1])));
    return h('button', { class: `lesson-tab ${content ? '' : 'empty'}`, type: 'button', role: 'tab', 'data-key': s.key, onclick: () => select(s.key) }, icon(s.ico), t('sections')[s.key][0]);
  });
  const tabBar = h('div', { class: 'lesson-tabs', role: 'tablist' }, tabs);
  function select(key) {
    tab = key;
    for (const b of tabs) b.classList.toggle('active', b.dataset.key === key);
    for (const [k, p] of Object.entries(panels)) p.hidden = k !== key;
  }

  const doneBtn = h('button', { class: `btn ${isDone(note.id) ? 'done' : 'primary'}`, type: 'button', onclick: () => {
    const now = !isDone(note.id);
    setDone(note.id, now);
    doneBtn.className = `btn ${now ? 'done' : 'primary'}`;
    doneBtn.replaceChildren(icon('check'), now ? t('understood') : t('iUnderstood'));
    if (now) toast(next ? t('toastNext', inLang(next).title) : t('toastDone'), 'success');
    renderStrip();
  } }, icon('check'), isDone(note.id) ? t('understood') : t('iUnderstood'));

  const strip = h('nav', { class: 'lesson-strip', 'aria-label': t('lessons') });
  function renderStrip() {
    let n = 0;
    fill(strip, lessons.map((l) => {
      n++;
      return h(l.placeholder ? 'div' : 'a', { class: `strip-card ${l === note ? 'active' : ''} ${isDone(l.id) ? 'done' : ''} ${l.placeholder ? 'soon' : ''}`, href: l.placeholder ? null : `#/learn/${l.id}` },
        h('span', { class: 'strip-num' }, isDone(l.id) ? icon('check') : n),
        h('span', { class: 'strip-title' }, inLang(l).title),
        l.placeholder && h('span', { class: 'strip-soon' }, t('stripSoon')));
    }));
    strip.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  const doneCount = lessons.filter((l) => isDone(l.id)).length;
  const article = h('article', { class: 'lesson', style: { '--c': color } },
    h('div', { class: 'lesson-bar' },
      h('nav', { class: 'crumbs' },
        h('a', { href: '#/learn' }, t('learn')), h('span', { class: 'sep' }, '/'),
        info && [h('a', { href: '#/learn' }, inLang(info.course).title), h('span', { class: 'sep' }, '/')],
        module && [h('span', {}, module.title), h('span', { class: 'sep' }, '/')],
        h('span', { class: 'here' }, view.title)),
      h('span', { class: 'spacer' }),
      h('span', { class: 'pill' }, t('doneCount', doneCount, lessons.filter((l) => !l.placeholder).length)),
      h('a', { class: 'btn ghost', href: `#/note/${note.id}`, title: t('docViewTitle') }, icon('book'), h('span', {}, t('docView'))),
      prev && h('a', { class: 'icon-btn', href: `#/learn/${prev.id}`, title: t('prev', inLang(prev).title), 'aria-label': t('prevAria') }, icon('chevronLeft')),
      next && h('a', { class: 'icon-btn', href: `#/learn/${next.id}`, title: t('next', inLang(next).title), 'aria-label': t('nextAria') }, icon('chevron')),
    ),
    h('header', { class: 'lesson-head' },
      h('span', { class: 'kicker' }, t('lessonKicker', at + 1, module?.title)),
      h('h1', {}, view.title),
      view.description && h('p', { class: 'lead' }, view.description),
      untranslated && h('p', { class: 'lesson-lang-note' }, icon('globe'), t('noTelugish')),
    ),
    note.placeholder
      ? h('div', { class: 'soon-panel big' }, icon('lock'), h('p', {}, t('building')))
      : [
          parts.intro && h('div', { class: 'prose lesson-intro', html: renderMarkdown(parts.intro).html }),
          tabBar,
          Object.values(panels),
          h('footer', { class: 'lesson-foot' },
            doneBtn,
            next && h('a', { class: 'btn', href: `#/learn/${next.id}` }, t('next', inLang(next).title), icon('arrowRight'))),
        ],
    strip,
  );

  fill(root, article);
  // Underline glossary words once per lesson, across all tabs, before kit blocks come alive.
  const scope = new Set();
  const intro = article.querySelector('.lesson-intro');
  if (intro) termifyProse(intro, scope);
  for (const p of Object.values(panels)) termifyProse(p, scope);
  select(tab && parts[tab] ? tab : SECTIONS.find((s) => parts[s.key])?.key || 'see');
  renderStrip();
  unhydrate = hydrate(article);
}
