// Documentation viewer: file tree, article, and a context panel
// (local graph, outline, backlinks, related topics).

import { vault, on, colorOf, backlinks, related, ancestors, getUi, setUi, isLocalOnly, removeLocalNote, loadVault, inLang } from '../store.js';
import { termifyProse } from '../words.js';
import { htmlLang } from '../i18n.js';
import { ForceGraph } from '../graph.js';
import { renderMarkdown } from '../markdown.js';
import { $, h, fill, icon, toast } from '../ui.js';
import { draftFromNote } from './architectView.js';
import { hydrate, SELF_TRANSLATING } from '../kit/blocks.js';

let root = null;
let currentId = null;
let mini = null;
let treeFilter = '';
let open = new Set();
let unhydrate = null; // tears down interactive kit blocks in the current article

const TYPE_LABEL = { hub: 'Hub', category: 'Category', topic: 'Topic', subtopic: 'Subtopic' };
const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true });

export function mount(el, param) {
  root = el;
  el.className = 'docs-view';
  open = new Set(getUi().treeOpen || []);
  el.classList.toggle('tree-collapsed', Boolean(getUi().treeCollapsed));
  el.classList.toggle('ctx-collapsed', Boolean(getUi().ctxCollapsed));

  el.append(
    h('aside', { class: 'tree-pane', 'aria-label': 'Notes' },
      h('div', { class: 'pane-head' },
        h('div', { class: 'tree-filter' }, icon('search'), h('input', { type: 'text', placeholder: 'Filter notes…', spellcheck: 'false', 'aria-label': 'Filter notes', oninput: (e) => {
          treeFilter = e.target.value.trim().toLowerCase();
          renderTree();
        } })),
        h('button', { class: 'icon-btn', type: 'button', title: 'Expand all', 'aria-label': 'Expand all', onclick: () => setAll(true) }, icon('unfold')),
        h('button', { class: 'icon-btn', type: 'button', title: 'Collapse all', 'aria-label': 'Collapse all', onclick: () => setAll(false) }, icon('fold')),
      ),
      h('nav', { class: 'tree', id: 'doc-tree' }),
    ),
    h('div', { class: 'tree-scrim', onclick: () => el.classList.remove('tree-open') }),
    h('section', { class: 'article-pane', id: 'doc-scroll' }, h('div', { class: 'article', id: 'doc-article' })),
    h('aside', { class: 'context-pane', id: 'doc-context', 'aria-label': 'Note context' }),
    // Handles on the panel edges: click to collapse or expand the left and right bars.
    h('button', { class: 'pane-handle left', type: 'button', onclick: () => togglePane('tree-collapsed', 'treeCollapsed') }, icon('chevronLeft')),
    h('button', { class: 'pane-handle right', type: 'button', onclick: () => togglePane('ctx-collapsed', 'ctxCollapsed') }, icon('chevron')),
  );
  labelHandles();

  const off = on('vault', () => show(currentId));
  // A note with a Telugish version (<name>.te.md) switches with the top bar's language switch.
  const relang = () => show(currentId, true);
  document.addEventListener('kv-lang-changed', relang);
  show(param);
  return () => {
    off();
    document.removeEventListener('kv-lang-changed', relang);
    unhydrate?.();
    unhydrate = null;
    mini?.destroy();
    mini = null;
  };
}

export function update(param) {
  show(param);
}

/** Expand or collapse every branch of the tree. */
function setAll(expand) {
  open = new Set(expand ? vault.notes.filter((n) => (vault.children.get(n.id) || []).length).map((n) => n.id) : []);
  setUi({ treeOpen: [...open] });
  renderTree();
}

/** Show or hide a side panel, and remember the choice. */
function labelHandles() {
  const set = (sel, collapsed, name) => {
    const b = root.querySelector(sel);
    const text = `${collapsed ? 'Show' : 'Hide'} the ${name}`;
    b.removeAttribute('data-tip');
    b.title = text;
    b.setAttribute('aria-label', text);
    b.setAttribute('aria-expanded', String(!collapsed));
  };
  set('.pane-handle.left', root.classList.contains('tree-collapsed'), 'notes list');
  set('.pane-handle.right', root.classList.contains('ctx-collapsed'), 'side panel');
}

function togglePane(cls, key) {
  const now = root.classList.toggle(cls);
  setUi({ [key]: now });
  labelHandles();
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

function defaultNote() {
  const last = vault.byId.get(getUi().lastNote);
  return last || vault.notes.find((n) => n.type === 'hub') || vault.notes[0] || null;
}

/** Show a note. `relang`: the language changed, so keep the reader's place and any live game. */
function show(id, relang = false) {
  const note = (id && vault.byId.get(id)) || (!id && defaultNote());
  root.classList.remove('tree-open');
  if (!note) {
    currentId = null;
    renderTree();
    renderMissing(id);
    return;
  }
  currentId = note.id;
  for (const a of ancestors(note)) open.add(a.id);
  const recent = [note.id, ...(getUi().recent || []).filter((r) => r !== note.id)].slice(0, 8);
  setUi({ lastNote: note.id, recent, treeOpen: [...open] });
  document.title = `${note.title} · ${vault.name}`;
  renderTree();
  const scroller = $('#doc-scroll', root);
  const top = scroller.scrollTop;
  renderArticle(note, relang && note.id === currentId);
  renderContext(note);
  scroller.scrollTop = relang ? top : 0;
}

// ---------- Tree ----------

function renderTree() {
  const tree = $('#doc-tree', root);
  if (!vault.notes.length) {
    fill(tree, h('p', { class: 'tree-empty' }, 'No notes yet.'));
    return;
  }
  if (treeFilter) {
    const hits = vault.notes.filter((n) => n.title.toLowerCase().includes(treeFilter));
    fill(tree, ...(hits.length ? hits.map((n) => row(n, 0, false)) : [h('p', { class: 'tree-empty' }, 'No notes match.')]));
    return;
  }
  const roots = vault.notes.filter((n) => !vault.parentOf.has(n.id)).sort((a, b) => (b.type === 'hub') - (a.type === 'hub') || byTitle(a, b));
  const frag = [];
  const walk = (n, depth) => {
    const kids = [...vault.children.get(n.id)].sort(byTitle);
    // The hub is always expanded so the categories are visible at a glance.
    const expanded = n.type === 'hub' || open.has(n.id);
    frag.push(row(n, depth, kids.length > 0, expanded, kids.length));
    if (expanded) for (const k of kids) walk(k, depth + 1);
  };
  roots.forEach((r) => walk(r, 0));
  fill(tree, ...frag);
  tree.querySelector('.tree-row.active')?.scrollIntoView({ block: 'nearest' });
}

function row(n, depth, hasKids, expanded, count) {
  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    open.has(n.id) ? open.delete(n.id) : open.add(n.id);
    setUi({ treeOpen: [...open] });
    renderTree();
  };
  return h('a', { class: `tree-row ${n.id === currentId ? 'active' : ''} t-${n.type}`, href: `#/note/${n.id}`, style: { paddingLeft: `${10 + depth * 14}px` } },
    hasKids && n.type !== 'hub'
      ? h('button', { class: `twisty ${expanded ? 'open' : ''}`, type: 'button', 'aria-label': expanded ? 'Collapse' : 'Expand', onclick: toggle }, icon('chevron'))
      : h('span', { class: 'twisty-gap' }),
    h('span', { class: 'dot', style: { background: colorOf(n) } }),
    h('span', { class: 'tree-title' }, n.title),
    count > 0 && h('span', { class: 'count' }, count),
  );
}

// ---------- Article ----------

function renderMissing(id) {
  // The article is about to be replaced: stop its interactive blocks first.
  unhydrate?.();
  unhydrate = null;
  mini?.destroy();
  mini = null;
  fill($('#doc-context', root), );
  fill($('#doc-article', root), 
    h('div', { class: 'empty-state' },
      h('div', { class: 'orbit' }),
      h('h2', {}, id ? 'Note not found' : 'No notes yet'),
      h('p', {}, id ? `Nothing in the vault matches “${id}”.` : 'Create the first note with the AI Knowledge Architect.'),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/' }, 'Back to graph'), h('a', { class: 'btn primary', href: '#/architect/new' }, icon('sparkles'), 'New note')),
    ),
  );
}

function renderArticle(note, keepLive = false) {
  const color = colorOf(note);
  const view = inLang(note); // the words in the current language
  const { html, headings } = renderMarkdown(view.body);
  const trail = ancestors(note);
  const parent = vault.parentOf.get(note.id);
  const siblings = parent ? [...vault.children.get(parent.id)].sort(byTitle) : [];
  const at = siblings.indexOf(note);
  const prev = at > 0 ? siblings[at - 1] : null;
  const next = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : null;
  const kids = [...vault.children.get(note.id)].sort(byTitle);

  note._headings = headings;
  const article = $('#doc-article', root);
  // On a language change, games that translate themselves keep running (no restart, progress
  // kept); every other block is rebuilt in the new language.
  const kept = keepLive ? [...article.querySelectorAll('.kv-block[data-mounted]')].filter((b) => SELF_TRANSLATING.has(b.dataset.kv)) : [];
  if (kept.length) for (const b of article.querySelectorAll('.kv-block[data-mounted]')) !kept.includes(b) && b.__kvCleanup?.();
  else unhydrate?.();
  article.style.setProperty('--note-color', color);
  fill(article, 
    h('div', { class: 'article-bar' },
      h('button', { class: 'icon-btn tree-toggle', title: 'Browse notes', 'aria-label': 'Browse notes', onclick: () => root.classList.toggle('tree-open') }, icon('menu')),
      h('button', { class: 'icon-btn pane-toggle', type: 'button', title: 'Show or hide the notes list', 'aria-label': 'Show or hide the notes list', onclick: () => togglePane('tree-collapsed', 'treeCollapsed') }, icon('panelLeft')),
      h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' },
        trail.map((a) => [h('a', { href: `#/note/${a.id}` }, a.title), h('span', { class: 'sep' }, '/')]),
        h('span', { class: 'here' }, view.title),
      ),
      h('span', { class: 'spacer' }),
      note.lesson && h('a', { class: 'btn ghost', href: `#/learn/${note.id}`, title: 'Open as an interactive lesson' }, icon('learn'), h('span', {}, 'Lesson')),
      h('a', { class: 'btn ghost', href: `#/graph/${note.id}`, title: 'Show in graph' }, icon('graph'), h('span', {}, 'Graph')),
      h('button', { class: 'btn ghost', type: 'button', title: 'Copy link', onclick: () => navigator.clipboard?.writeText(location.href).then(() => toast('Link copied', 'success')) }, icon('link'), h('span', {}, 'Copy link')),
      isLocalOnly(note.id) && h('button', { class: 'icon-btn danger', type: 'button', title: 'Remove this local note from the vault', 'aria-label': 'Remove local note', onclick: async () => {
        if (!confirm(`Remove “${note.title}” from the vault in this browser? Its draft in the Architect is kept.`)) return;
        removeLocalNote(note.id);
        setUi({ lastNote: null });
        await loadVault();
        location.hash = '#/note';
        toast('Local note removed');
      } }, icon('trash')),
      h('button', { class: 'btn', type: 'button', onclick: () => (location.hash = `#/architect/${draftFromNote(note.id)}`) }, icon('sparkles'), h('span', {}, 'Refine in Architect')),
      h('button', { class: 'icon-btn pane-toggle', type: 'button', title: 'Show or hide the side panel', 'aria-label': 'Show or hide the side panel', onclick: () => togglePane('ctx-collapsed', 'ctxCollapsed') }, icon('panel')),
    ),
    h('header', { class: 'article-head' },
      h('div', { class: 'meta-row' },
        h('span', { class: 'badge', style: { '--c': color } }, h('span', { class: 'dot', style: { background: color } }), TYPE_LABEL[note.type]),
        note.placeholder && h('span', { class: 'badge subtle' }, 'Placeholder'),
        isLocalOnly(note.id) && h('span', { class: 'badge subtle', title: 'Saved in this browser only — not yet in GitHub' }, 'Local only'),
        note.updated && h('span', { class: 'meta' }, icon('clock'), `Updated ${note.updated}`),
      ),
      h('h1', {}, view.title),
      view.description && h('p', { class: 'lead' }, view.description),
      note.tags.length > 0 && h('div', { class: 'tags' }, note.tags.map((t) => h('span', { class: 'tag' }, `#${t}`))),
    ),
    h('div', { class: 'prose', html: html || '<p class="muted">This note has no content yet.</p>' }),
    kids.length > 0 && h('section', { class: 'child-grid' },
      h('h2', {}, note.type === 'hub' ? 'Categories' : note.type === 'category' ? 'Topics in this category' : 'Subtopics'),
      h('div', { class: 'cards' }, kids.map((k) => h('a', { class: 'card', href: `#/note/${k.id}`, style: { '--c': colorOf(k) } },
        h('span', { class: 'card-title' }, h('span', { class: 'dot', style: { background: colorOf(k) } }), k.title),
        h('span', { class: 'card-desc' }, k.description || 'No description yet'),
        vault.children.get(k.id).length > 0 && h('span', { class: 'card-meta' }, `${vault.children.get(k.id).length} inside`)))),
    ),
    (prev || next) && h('nav', { class: 'pager' },
      prev ? h('a', { class: 'pager-link', href: `#/note/${prev.id}` }, h('span', { class: 'pager-dir' }, '← Previous'), h('span', {}, prev.title)) : h('span', {}),
      next ? h('a', { class: 'pager-link next', href: `#/note/${next.id}` }, h('span', { class: 'pager-dir' }, 'Next →'), h('span', {}, next.title)) : h('span', {}),
    ),
  );
  article.lang = htmlLang(view.lang || 'en');
  const prose = article.querySelector('.prose');
  if (prose && !note.placeholder) termifyProse(prose);
  for (const block of kept) {
    const slot = [...article.querySelectorAll(`.kv-block[data-kv="${block.dataset.kv}"]:not([data-mounted])`)][0];
    if (slot) slot.replaceWith(block);
    else block.__kvCleanup?.(); // the new version has no such block
  }
  const fresh = hydrate(article);
  unhydrate = () => {
    fresh();
    kept.forEach((b) => b.isConnected && b.__kvCleanup?.());
  };
}

// ---------- Context panel ----------

function renderContext(note) {
  const pane = $('#doc-context', root);
  const back = backlinks(note).sort((a, b) => byTitle(a.note, b.note));
  const rel = related(note);
  const headings = (note._headings || []).filter((x) => x.level <= 3);
  const canvas = h('canvas', { 'aria-label': 'Local graph' });

  const noteLink = (n, sub) => h('a', { class: 'ctx-link', href: `#/note/${n.id}` },
    h('span', { class: 'dot', style: { background: colorOf(n) } }),
    h('span', { class: 'ctx-text' }, h('span', { class: 'ctx-title' }, n.title), sub && h('span', { class: 'ctx-sub' }, sub)));

  fill(pane, 
    h('section', { class: 'ctx-block' },
      h('h3', {}, 'Local graph', h('a', { class: 'ctx-action', href: `#/graph/${note.id}` }, 'Expand')),
      h('div', { class: 'mini-graph' }, canvas),
    ),
    headings.length > 1 && h('section', { class: 'ctx-block' },
      h('h3', {}, 'On this page'),
      h('nav', { class: 'outline' }, headings.map((hd) => h('button', { type: 'button', class: `l${hd.level}`, onclick: () => document.getElementById(hd.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, hd.text))),
    ),
    h('section', { class: 'ctx-block' },
      h('h3', {}, 'Backlinks', h('span', { class: 'count' }, back.length)),
      back.length ? back.map((b) => noteLink(b.note, b.snippet.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, a) => a || t))) : h('p', { class: 'ctx-empty' }, 'No other notes link here yet.'),
    ),
    h('section', { class: 'ctx-block' },
      h('h3', {}, 'Related topics'),
      rel.length ? rel.map((n) => noteLink(n, n.category)) : h('p', { class: 'ctx-empty' }, 'Related notes appear as the vault grows.'),
    ),
  );

  // Local graph: this note and everything one link away.
  mini?.destroy();
  const ids = new Set([note.id, ...(vault.out.get(note.id) || []), ...(vault.back.get(note.id) || [])]);
  const nodes = [...ids].map((id) => vault.byId.get(id)).map((n) => ({ id: n.id, title: n.title, type: n.type, category: n.category, color: colorOf(n) }));
  mini = new ForceGraph(canvas, {
    mini: true,
    presettle: true,
    onSelect: (n) => n && n.id !== note.id && (location.hash = `#/note/${n.id}`),
    onOpen: (n) => (location.hash = `#/note/${n.id}`),
  });
  mini.setData(nodes, vault.links.filter((l) => ids.has(l.source) && ids.has(l.target)));
  mini.select(note.id);
  mini.start();
}
