// Learn mode: interactive courses inside each universe.
//   #/learn            → the course map for the current universe
//   #/learn/<note id>  → one lesson: the interactive stage first, then tabs (See · Play · Remember · Explain · Exam)
//
// Courses are plain notes, so they follow the vault's hierarchy:
//   hub → category (a course, e.g. "Python") → topic (a module) → subtopic with `lesson: true` (a lesson)
// Lesson bodies are Markdown; ```kv-*``` blocks inside them become kit components (js/kit/).

import { vault, on, colorOf, lsGet, lsSet, currentUniverse, setUi, getUi } from '../store.js';
import { renderMarkdown } from '../markdown.js';
import { hydrate } from '../kit/blocks.js';
import { h, fill, icon, toast } from '../ui.js';

const PROGRESS_KEY = 'snu.learn';
const SECTIONS = [
  { key: 'see', label: 'See', ico: 'eye', soon: 'Animations and analogies for this lesson are on the way.' },
  { key: 'play', label: 'Play', ico: 'code', soon: 'Hands-on exercises for this lesson are on the way.' },
  { key: 'remember', label: 'Remember', ico: 'clock', soon: 'A recap card and revision questions are on the way.' },
  { key: 'explain', label: 'Explain', ico: 'message', soon: 'Interview questions and how to answer them are on the way.' },
  { key: 'exam', label: 'Exam', ico: 'file', soon: 'University exam answers (2-mark and 10-mark) and previous-year questions are coming soon.' },
];
const COMING_SOON = [
  { ico: 'message', title: 'Ask', text: 'An AI tutor that knows exactly what’s on your screen. Uses your own Anthropic API key.' },
  { ico: 'users', title: 'Squad', text: 'Learn with friends: open the same lab together and solve challenges as a team.' },
  { ico: 'target', title: 'Placements', text: 'Interview practice, aptitude tests, resume help and micro projects.' },
  { ico: 'file', title: 'University exams', text: 'Your syllabus mapped to lessons, with previous-year questions.' },
  { ico: 'globe', title: 'Your language', text: 'Lessons explained in Hindi, Tamil, Telugu and more.' },
];

let root = null;
let unhydrate = null;
let current = null;

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
  show(param);
  return () => {
    off();
    unhydrate?.();
    unhydrate = null;
  };
}

export function update(param) {
  show(param);
}

function show(param) {
  current = param || '';
  unhydrate?.();
  unhydrate = null;
  const note = param && vault.byId.get(param);
  if (note && note.lesson) renderLesson(note);
  else renderMap();
  root.scrollTop = 0;
}

// ---------- Course map ----------

function renderMap() {
  const u = currentUniverse();
  document.title = `${u.name} Learn · ${vault.name}`;
  const list = courses();

  const soon = h('aside', { class: 'learn-soon' },
    h('h3', {}, 'Coming soon'),
    COMING_SOON.map((s) => h('div', { class: 'soon-card' }, h('span', { class: 'soon-ico' }, icon(s.ico)), h('div', {}, h('strong', {}, s.title), h('p', {}, s.text)), icon('lock', 'soon-lock'))),
  );

  if (!list.length) {
    fill(root, h('div', { class: 'learn-wrap' },
      h('section', { class: 'learn-empty', style: { '--u': u.accent } },
        h('div', { class: 'orbit' }),
        h('span', { class: 'kicker' }, `${u.name} Universe`),
        h('h1', {}, 'Interactive lessons are coming here'),
        h('p', {}, 'This universe doesn’t have a course yet. The first course, Python, lives in the Programming universe.'),
        h('div', { class: 'row' },
          // A note id carries its universe, so this link switches to Programming and opens its course map.
          h('a', { class: 'btn primary', href: '#/learn/programming/python/python' }, icon('learn'), 'Open the Python course'),
          h('a', { class: 'btn', href: '#/note' }, icon('book'), 'Read the docs instead'),
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

function renderCourse({ course, modules, lessons }) {
  const color = colorOf(course);
  const ready = lessons.filter((l) => !l.placeholder);
  const done = ready.filter((l) => isDone(l.id)).length;
  const next = ready.find((l) => !isDone(l.id)) || ready[0];
  let number = 0;

  return h('section', { class: 'course', style: { '--c': color } },
    h('header', { class: 'course-hero' },
      h('div', { class: 'course-glow' }),
      h('span', { class: 'kicker' }, icon('learn'), 'Course'),
      h('h1', {}, course.title),
      course.description && h('p', { class: 'lead' }, course.description),
      h('div', { class: 'course-progress' },
        h('div', { class: 'bar' }, h('span', { style: { width: `${ready.length ? (done / ready.length) * 100 : 0}%` } })),
        h('span', {}, `${done} of ${ready.length} lessons done`),
      ),
      next && h('a', { class: 'btn primary', href: `#/learn/${next.id}` }, icon('play'), done ? `Continue: ${next.title}` : `Start: ${next.title}`),
    ),
    h('div', { class: 'module-tools' },
      h('button', { class: 'btn ghost small-btn', type: 'button', onclick: (e) => setModules(e.target.closest('.course'), true) }, icon('unfold'), 'Expand all'),
      h('button', { class: 'btn ghost small-btn', type: 'button', onclick: (e) => setModules(e.target.closest('.course'), false) }, icon('fold'), 'Collapse all')),
    modules.map(({ module, lessons: ls }) => h('details', { class: 'module', open: !closedModules().includes(module.id), 'data-id': module.id, ontoggle: (e) => rememberModule(module.id, e.target.open) },
      h('summary', { class: 'module-head', title: 'Click to collapse or expand' }, icon('chevron', 'module-twisty'), h('h2', {}, module.title), module.description && h('p', {}, module.description),
        h('span', { class: 'module-count' }, `${ls.filter((l) => isDone(l.id)).length}/${ls.length}`)),
      h('div', { class: 'lesson-list' }, ls.map((l) => {
        number++;
        const state = l.placeholder ? 'soon' : isDone(l.id) ? 'done' : l === next ? 'next' : '';
        return h(l.placeholder ? 'div' : 'a', { class: `lesson-row ${state}`, href: l.placeholder ? null : `#/learn/${l.id}` },
          h('span', { class: 'lesson-num' }, state === 'done' ? icon('check') : String(number).padStart(2, '0')),
          h('span', { class: 'lesson-text' }, h('strong', {}, l.title), h('span', {}, l.description)),
          h('span', { class: 'lesson-state' }, state === 'soon' ? 'Coming soon' : state === 'next' ? 'Up next' : state === 'done' ? 'Done' : ''),
          !l.placeholder && icon('chevron'),
        );
      })),
    )),
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
  const info = courseOf(note);
  const lessons = info?.lessons || [note];
  const at = lessons.indexOf(note);
  const prev = lessons.slice(0, at).reverse().find((l) => !l.placeholder);
  const next = lessons.slice(at + 1).find((l) => !l.placeholder);
  const module = vault.parentOf.get(note.id);
  const color = colorOf(note);
  const parts = splitSections(note.body);
  setUi({ lastLesson: note.id });
  document.title = `${note.title} · ${info?.course.title || 'Learn'} · ${vault.name}`;

  const panels = {};
  const tabs = SECTIONS.map((s) => {
    const content = parts[s.key];
    panels[s.key] = h('div', { class: 'lesson-panel', role: 'tabpanel', hidden: true },
      content
        ? h('div', { class: 'prose', html: renderMarkdown(content).html })
        : h('div', { class: 'soon-panel' }, icon('lock'), h('p', {}, s.soon)));
    return h('button', { class: `lesson-tab ${content ? '' : 'empty'}`, type: 'button', role: 'tab', 'data-key': s.key, onclick: () => select(s.key) }, icon(s.ico), s.label);
  });
  const tabBar = h('div', { class: 'lesson-tabs', role: 'tablist' }, tabs);
  function select(key) {
    for (const t of tabs) t.classList.toggle('active', t.dataset.key === key);
    for (const [k, p] of Object.entries(panels)) p.hidden = k !== key;
  }

  const doneBtn = h('button', { class: `btn ${isDone(note.id) ? 'done' : 'primary'}`, type: 'button', onclick: () => {
    const now = !isDone(note.id);
    setDone(note.id, now);
    doneBtn.className = `btn ${now ? 'done' : 'primary'}`;
    doneBtn.replaceChildren(icon('check'), now ? 'Understood' : 'I understood this');
    if (now) toast(next ? `Nice. Next up: ${next.title}` : 'You finished the course!', 'success');
    renderStrip();
  } }, icon('check'), isDone(note.id) ? 'Understood' : 'I understood this');

  const strip = h('nav', { class: 'lesson-strip', 'aria-label': 'Lessons' });
  function renderStrip() {
    let n = 0;
    fill(strip, lessons.map((l) => {
      n++;
      return h(l.placeholder ? 'div' : 'a', { class: `strip-card ${l === note ? 'active' : ''} ${isDone(l.id) ? 'done' : ''} ${l.placeholder ? 'soon' : ''}`, href: l.placeholder ? null : `#/learn/${l.id}` },
        h('span', { class: 'strip-num' }, isDone(l.id) ? icon('check') : n),
        h('span', { class: 'strip-title' }, l.title),
        l.placeholder && h('span', { class: 'strip-soon' }, 'soon'));
    }));
    strip.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  const doneCount = lessons.filter((l) => isDone(l.id)).length;
  const article = h('article', { class: 'lesson', style: { '--c': color } },
    h('div', { class: 'lesson-bar' },
      h('nav', { class: 'crumbs' },
        h('a', { href: '#/learn' }, 'Learn'), h('span', { class: 'sep' }, '/'),
        info && [h('a', { href: '#/learn' }, info.course.title), h('span', { class: 'sep' }, '/')],
        module && [h('span', {}, module.title), h('span', { class: 'sep' }, '/')],
        h('span', { class: 'here' }, note.title)),
      h('span', { class: 'spacer' }),
      h('span', { class: 'pill' }, `${doneCount}/${lessons.filter((l) => !l.placeholder).length} done`),
      h('a', { class: 'btn ghost', href: `#/note/${note.id}`, title: 'Read this lesson as a plain document' }, icon('book'), h('span', {}, 'Doc view')),
      prev && h('a', { class: 'icon-btn', href: `#/learn/${prev.id}`, title: `Previous: ${prev.title}`, 'aria-label': 'Previous lesson' }, icon('chevronLeft')),
      next && h('a', { class: 'icon-btn', href: `#/learn/${next.id}`, title: `Next: ${next.title}`, 'aria-label': 'Next lesson' }, icon('chevron')),
    ),
    h('header', { class: 'lesson-head' },
      h('span', { class: 'kicker' }, `Lesson ${at + 1}${module ? ` · ${module.title}` : ''}`),
      h('h1', {}, note.title),
      note.description && h('p', { class: 'lead' }, note.description),
    ),
    note.placeholder
      ? h('div', { class: 'soon-panel big' }, icon('lock'), h('p', {}, 'This lesson is being built. Its interactive lab, recap and interview questions will appear here.'))
      : [
          parts.intro && h('div', { class: 'prose lesson-intro', html: renderMarkdown(parts.intro).html }),
          tabBar,
          Object.values(panels),
          h('footer', { class: 'lesson-foot' },
            doneBtn,
            next && h('a', { class: 'btn', href: `#/learn/${next.id}` }, `Next: ${next.title}`, icon('arrowRight'))),
        ],
    strip,
  );

  fill(root, article);
  select(SECTIONS.find((s) => parts[s.key])?.key || 'see');
  renderStrip();
  unhydrate = hydrate(article);
}
