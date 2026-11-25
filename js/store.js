// The vault: every note, plus the link graph derived from them.
// Notes come from two places:
//   1. Markdown files listed in content/index.json (the GitHub-backed source of truth)
//   2. Notes approved in the Architect but saved only in this browser (localStorage)
//
// A note can have a Telugish version next to it: <name>.te.md (frontmatter: title, description;
// then the body). It is attached to the English note as note.te and is never a note of its own.
// inLang(note) gives the note in the current language.

import { getLang } from './i18n.js';

const KEYS = {
  local: 'snu.localNotes',
  drafts: 'snu.drafts',
  settings: 'snu.settings',
  ui: 'snu.ui',
};

export function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
export function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the app still works for this session */
  }
}

// ---------- Settings ----------

export const DEFAULT_SETTINGS = {
  aiKey: '',
  aiModel: 'claude-opus-5-5',
  aiEffort: 'medium',
  ghOwner: '',
  ghRepo: '',
  ghBranch: 'main',
  ghToken: '',
  ghDir: 'content',
};
export const getSettings = () => ({ ...DEFAULT_SETTINGS, ...lsGet(KEYS.settings, {}) });
export const saveSettings = (s) => lsSet(KEYS.settings, s);
export const githubReady = (s = getSettings()) => Boolean(s.ghOwner && s.ghRepo && s.ghToken);

export const getUi = () => lsGet(KEYS.ui, {});
export const setUi = (patch) => lsSet(KEYS.ui, { ...getUi(), ...patch });

// ---------- Tiny event bus ----------

const listeners = new Map();
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}
export function emit(event, payload) {
  for (const fn of listeners.get(event) || []) fn(payload);
}

// ---------- Frontmatter ----------

export const slugify = (s) =>
  String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';

function parseValue(v) {
  v = v.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map((x) => unquote(x.trim())).filter(Boolean);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  return unquote(v);
}
function unquote(v) {
  if (v.length >= 2 && v[0] === '"' && v.at(-1) === '"') {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.length >= 2 && v[0] === "'" && v.at(-1) === "'") return v.slice(1, -1);
  return v;
}

/** Split a Markdown file into { data, body }. Supports a flat YAML subset. */
export function parseFrontmatter(raw) {
  raw = String(raw || '').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---[ \t]*\n?/);
  if (!m) return { data: {}, body: raw.trim() };
  const data = {};
  let listKey = null;
  for (const line of m[1].split('\n')) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      data[listKey].push(unquote(item[1].trim()));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    if (kv[2] === '') {
      data[kv[1]] = [];
      listKey = kv[1];
    } else {
      data[kv[1]] = parseValue(kv[2]);
      listKey = null;
    }
  }
  for (const [k, v] of Object.entries(data)) if (Array.isArray(v) && !v.length && k !== 'tags') data[k] = '';
  return { data, body: raw.slice(m[0].length).trim() };
}

const yamlStr = (s) => (/^[\w][\w .,()/&+'-]*$/.test(s) && !/^(true|false|null|~)$/i.test(s) ? s : JSON.stringify(s));

/** Build the Markdown file for a note from its fields. */
export function serializeNote(f) {
  const lines = ['---', `title: ${yamlStr(f.title || 'Untitled')}`, `type: ${f.type || 'topic'}`];
  if (f.category) lines.push(`category: ${yamlStr(f.category)}`);
  if (f.parent) lines.push(`parent: ${yamlStr(f.parent)}`);
  if (f.description) lines.push(`description: ${yamlStr(f.description)}`);
  if (f.tags?.length) lines.push(`tags: [${f.tags.map(yamlStr).join(', ')}]`);
  lines.push(`status: ${f.status || 'published'}`);
  lines.push(`updated: ${f.updated || new Date().toISOString().slice(0, 10)}`);
  lines.push('---', '', (f.body || '').trim(), '');
  return lines.join('\n');
}

/** Path (without .md) a note with these fields should live at. */
export const noteIdFor = (f) =>
  [f.universe || vault.universe, f.type !== 'hub' && f.category && slugify(f.category), slugify(f.title)].filter(Boolean).join('/');

/** A note's Telugish version: only the words change; the note's place in the vault does not. */
function makeTranslation(raw) {
  const { data, body } = parseFrontmatter(raw);
  return { title: data.title ? String(data.title) : '', description: data.description ? String(data.description) : '', body };
}

/** The note's title, description and body in a language (English when there is no translation). */
export function inLang(note, lang = getLang()) {
  if (!note || lang !== 'te' || !note.te) return note;
  return { ...note, title: note.te.title || note.title, description: note.te.description || note.description, body: note.te.body || note.body, lang };
}

function makeNote(id, raw, source) {
  const { data, body } = parseFrontmatter(raw);
  const tags = Array.isArray(data.tags) ? data.tags : data.tags ? String(data.tags).split(',').map((t) => t.trim()).filter(Boolean) : [];
  const head = id.split('/')[0];
  return {
    id,
    universe: id.includes('/') && vault.universes.some((u) => u.id === head) ? head : DEFAULT_UNIVERSE,
    raw,
    body,
    source, // 'repo' | 'local'
    title: String(data.title || id.split('/').pop().replace(/-/g, ' ')),
    type: ['hub', 'category', 'topic', 'subtopic'].includes(data.type) ? data.type : 'topic',
    category: String(data.category || ''),
    parent: String(data.parent || ''),
    description: String(data.description || ''),
    status: String(data.status || ''),
    updated: String(data.updated || ''),
    placeholder: data.placeholder === true,
    // Learn mode: lesson notes carry `lesson: true` and an `order` within their course.
    lesson: data.lesson === true,
    order: Number(data.order) || 0,
    level: String(data.level || ''),
    tags,
  };
}

// ---------- Vault ----------

export const PALETTE = ['#7c9cff', '#5eead4', '#f472b6', '#fbbf24', '#a78bfa', '#fb923c', '#4ade80', '#38bdf8', '#f87171', '#e879f9'];
const HUB_COLOR = '#eef2ff';
const NEUTRAL = '#8b93a7';

const DEFAULT_UNIVERSE = 'servicenow';

export const vault = {
  name: 'Knowverse',
  tagline: 'The Knowledge Multiverse',
  universes: [], // every universe in the multiverse (content/multiverse.json)
  edges: [], // links drawn between universes on the home page
  universe: DEFAULT_UNIVERSE, // the universe the graph, docs and Architect are showing
  all: [], // every note in every universe
  notes: [], // notes of the current universe
  byId: new Map(),
  links: [], // { source, target, kind: 'tree' | 'ref' }
  out: new Map(), // id → Set(ids this note points to)
  back: new Map(), // id → Set(ids pointing to this note)
  children: new Map(), // id → [child notes]
  parentOf: new Map(), // id → parent note
  categories: [], // [{ name, color, count }]
  error: null,
};

const titleIndex = new Map();
const key = (s) => String(s).trim().toLowerCase();

/** Resolve a wikilink target (title, id or file slug) to a note. */
export function resolve(target) {
  const k = key(target);
  return titleIndex.get(k) || vault.byId.get(k) || titleIndex.get(k.replace(/-/g, ' ')) || null;
}

export const WIKILINK = /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g;

export function colorOf(note) {
  if (!note) return NEUTRAL;
  if (note.type === 'hub') return HUB_COLOR;
  return vault.categories.find((c) => c.name === note.category)?.color || NEUTRAL;
}

function rebuild() {
  const v = vault;
  v.all.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  v.notes = v.all.filter((n) => n.universe === v.universe);
  v.byId = new Map(v.notes.map((n) => [n.id, n]));
  titleIndex.clear();
  for (const n of v.notes) {
    titleIndex.set(key(n.title), n);
    titleIndex.set(key(n.id.split('/').pop()), n);
  }

  // Categories, in a stable order, each with a colour.
  const names = [...new Set(v.notes.map((n) => n.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  v.categories = names.map((name, i) => ({ name, color: PALETTE[i % PALETTE.length], count: v.notes.filter((n) => n.category === name).length }));

  v.links = [];
  v.out = new Map(v.notes.map((n) => [n.id, new Set()]));
  v.back = new Map(v.notes.map((n) => [n.id, new Set()]));
  v.children = new Map(v.notes.map((n) => [n.id, []]));
  v.parentOf = new Map();
  const seen = new Set();
  const addEdge = (a, b, kind) => {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(k)) return;
    seen.add(k);
    v.links.push({ source: a, target: b, kind });
  };

  for (const n of v.notes) {
    const parent = n.parent && resolve(n.parent);
    if (parent && parent !== n) {
      v.parentOf.set(n.id, parent);
      v.children.get(parent.id).push(n);
      addEdge(parent.id, n.id, 'tree');
      v.out.get(n.id).add(parent.id);
      v.back.get(parent.id).add(n.id);
    }
  }
  for (const n of v.notes) {
    for (const m of n.body.matchAll(WIKILINK)) {
      const t = resolve(m[1]);
      if (!t || t === n) continue;
      v.out.get(n.id).add(t.id);
      v.back.get(t.id).add(n.id);
      addEdge(n.id, t.id, 'ref');
    }
  }
  emit('vault', v);
}

/** Every note's text as { path: text }: one bundled request, or one request per note as a fallback. */
async function fetchNoteTexts() {
  try {
    const res = await fetch('content/bundle.json');
    if (res.ok) return (await res.json()).notes;
  } catch {
    /* no bundle (plain static server): fall through to the per-note path */
  }
  const res = await fetch('content/index.json');
  if (!res.ok) throw new Error(`content/index.json → HTTP ${res.status}`);
  const paths = (await res.json()).notes || [];
  const texts = await Promise.all(paths.map((p) => fetch(`content/${p.split('/').map(encodeURIComponent).join('/')}`).then((r) => (r.ok ? r.text() : null), () => null)));
  return Object.fromEntries(paths.map((p, i) => [p, texts[i]]).filter(([, t]) => t != null));
}

export async function loadVault() {
  const notes = [];
  vault.error = null;
  // Start the notes download now; it runs alongside the universe list instead of after it.
  const noteTexts = fetchNoteTexts();
  noteTexts.catch(() => {}); // handled below
  try {
    const mv = await (await fetch('content/multiverse.json')).json();
    vault.name = mv.name || vault.name;
    vault.tagline = mv.tagline || vault.tagline;
    vault.universes = mv.universes || [];
    vault.edges = mv.edges || [];
  } catch {
    vault.universes = [{ id: DEFAULT_UNIVERSE, name: 'ServiceNow', icon: 'layers', accent: '#3b82f6', secondary: '#60a5fa', core: '#eff6ff', x: 0, y: 0, z: 0, scale: 1.4, tilt: [0.75, 0.35, -0.15], speed: 0.4, description: '' }];
  }
  const saved = getUi().universe;
  vault.universe = vault.universes.some((u) => u.id === saved) ? saved : vault.universes[0]?.id || DEFAULT_UNIVERSE;
  try {
    const translations = {};
    for (const [path, text] of Object.entries(await noteTexts)) {
      const id = path.replace(/\.md$/i, '');
      if (id.endsWith('.te')) translations[id.slice(0, -3)] = text;
      else notes.push(makeNote(id, text, 'repo'));
    }
    for (const note of notes) if (translations[note.id]) note.te = makeTranslation(translations[note.id]);
  } catch (err) {
    vault.error = err.message;
  }

  // Browser-only notes; a repo note with the same id wins and retires the local copy.
  const local = lsGet(KEYS.local, {});
  const repoIds = new Set(notes.map((n) => n.id));
  let pruned = false;
  for (const [id, entry] of Object.entries(local)) {
    if (repoIds.has(id) && entry.pushed) {
      delete local[id];
      pruned = true;
    } else {
      const i = notes.findIndex((n) => n.id === id);
      const note = makeNote(id, entry.raw, 'local');
      if (i >= 0) notes[i] = note;
      else notes.push(note);
    }
  }
  if (pruned) lsSet(KEYS.local, local);

  vault.all = notes;
  rebuild();
  return vault;
}

/** Add or replace a note in this browser's vault. `pushed` = also committed to GitHub. */
export function saveLocalNote(id, raw, pushed = false) {
  const local = lsGet(KEYS.local, {});
  local[id] = { raw, pushed, saved: Date.now() };
  lsSet(KEYS.local, local);
  const note = makeNote(id, raw, 'local');
  const i = vault.all.findIndex((n) => n.id === id);
  if (i >= 0) vault.all[i] = note;
  else vault.all.push(note);
  rebuild();
  return note;
}

export function removeLocalNote(id) {
  const local = lsGet(KEYS.local, {});
  if (!(id in local)) return false;
  delete local[id];
  lsSet(KEYS.local, local);
  return true;
}

export const isLocalOnly = (id) => {
  const e = lsGet(KEYS.local, {})[id];
  return Boolean(e && !e.pushed);
};

// ---------- Universes ----------

export const universeById = (id) => vault.universes.find((u) => u.id === id) || null;
export const currentUniverse = () => universeById(vault.universe) || vault.universes[0] || { id: DEFAULT_UNIVERSE, name: 'ServiceNow', accent: '#3b82f6' };

/** Switch which universe the graph, docs and Architect show. Returns false for an unknown id. */
export function setUniverse(id) {
  if (!universeById(id)) return false;
  if (id !== vault.universe) {
    vault.universe = id;
    setUi({ universe: id, lastNote: null });
    rebuild();
  }
  return true;
}

/** The universe a note id belongs to (its first path segment), or null. */
export const universeOfId = (noteId) => {
  const head = String(noteId || '').split('/')[0];
  return universeById(head) ? head : null;
};

export function universeStats(id) {
  const notes = vault.all.filter((n) => n.universe === id);
  const by = (t) => notes.filter((n) => n.type === t);
  return { notes: notes.length, categories: by('category'), topics: by('topic').length + by('subtopic').length };
}

// ---------- Queries ----------

export function ancestors(note) {
  const chain = [];
  let cur = vault.parentOf.get(note.id);
  while (cur && !chain.includes(cur)) {
    chain.unshift(cur);
    cur = vault.parentOf.get(cur.id);
  }
  return chain;
}

export function backlinks(note) {
  return [...(vault.back.get(note.id) || [])].map((id) => {
    const src = vault.byId.get(id);
    let snippet = '';
    for (const line of src.body.split('\n')) {
      if ([...line.matchAll(WIKILINK)].some((m) => resolve(m[1]) === note)) {
        snippet = line.replace(/^[\s>*+-]+/, '').trim();
        break;
      }
    }
    return { note: src, snippet: snippet || (vault.parentOf.get(src.id) === note ? 'Child of this note' : '') };
  });
}

export function related(note, limit = 6) {
  const linked = new Set([...(vault.out.get(note.id) || []), ...(vault.back.get(note.id) || [])]);
  const parent = vault.parentOf.get(note.id);
  const scored = [];
  for (const n of vault.notes) {
    if (n === note || n.type === 'hub' || linked.has(n.id)) continue;
    let score = 0;
    if (parent && vault.parentOf.get(n.id) === parent) score += 3;
    score += n.tags.filter((t) => t !== 'placeholder' && note.tags.includes(t)).length;
    // Two-hop neighbours: notes that share a link target with this one.
    for (const id of vault.out.get(n.id) || []) if (linked.has(id)) score += 1;
    if (score > 0) scored.push({ note: n, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title, undefined, { numeric: true })).slice(0, limit).map((s) => s.note);
}

export function search(query, limit = 30) {
  const terms = key(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const results = [];
  for (const n of vault.notes) {
    const title = n.title.toLowerCase();
    const meta = `${n.category} ${n.tags.join(' ')} ${n.description}`.toLowerCase();
    const body = n.body.toLowerCase();
    let score = 0;
    let ok = true;
    for (const t of terms) {
      const s = (title.startsWith(t) ? 12 : title.includes(t) ? 8 : 0) + (meta.includes(t) ? 3 : 0) + (body.includes(t) ? 1 : 0);
      if (!s) {
        ok = false;
        break;
      }
      score += s;
    }
    if (!ok) continue;
    if (terms.length > 1 && title.includes(terms.join(' '))) score += 25;
    let snippet = n.description;
    const at = body.indexOf(terms[0]);
    if (at >= 0 && !title.includes(terms[0])) {
      const start = Math.max(0, at - 40);
      snippet = (start ? '…' : '') + n.body.slice(start, at + 90).replace(/\s+/g, ' ').replace(/[#>*`[\]]/g, '') + '…';
    }
    results.push({ note: n, score, snippet });
  }
  return results.sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title, undefined, { numeric: true })).slice(0, limit);
}

// ---------- Drafts (Architect workspace) ----------

export const getDrafts = () => lsGet(KEYS.drafts, []);
export const saveDrafts = (drafts) => lsSet(KEYS.drafts, drafts);
