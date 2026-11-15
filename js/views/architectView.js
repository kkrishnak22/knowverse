// AI Knowledge Architect: a conversation on the left shapes the draft on the right.
// Every note moves through Draft → In review → Approved → Published, and nothing
// reaches the vault (or GitHub) without the owner approving it.

import { vault, setUniverse, currentUniverse, getDrafts, saveDrafts, getSettings, githubReady, parseFrontmatter, serializeNote, noteIdFor, saveLocalNote, resolve, colorOf, WIKILINK } from '../store.js';
import { renderMarkdown } from '../markdown.js';
import { streamArchitect, offlineArchitect, buildSystemPrompt, toApiMessages, splitReply, modelLabel } from '../ai.js';
import { publishFile } from '../github.js';
import { $, h, fill, icon, toast, timeAgo, downloadText, debounce, openModal } from '../ui.js';
import { openSettings } from '../app.js';

const STAGES = [
  { id: 'draft', label: 'Draft' },
  { id: 'review', label: 'In review' },
  { id: 'approved', label: 'Approved' },
  { id: 'published', label: 'Published' },
];
const FIELDS = ['title', 'type', 'category', 'parent', 'description', 'tags', 'body'];
const SUGGESTIONS = [
  ['Structure my raw notes', 'Here are my raw notes on this topic. Organise them into a clear, well-structured note:\n\n'],
  ['Propose an outline', 'Propose an outline for this note before we write it. The note is about: '],
  ['Tighten the writing', 'Tighten the writing in the current draft without changing its meaning or dropping any detail.'],
  ['Suggest links', 'Which existing notes in the vault should this draft link to? Add the links where they fit naturally.'],
];

let root = null;
let drafts = [];
let currentId = null;
let tab = 'preview';
let streaming = null; // { text, controller }
let streamRaf = 0;

const uid = () => Math.random().toString(36).slice(2, 10);
const current = () => drafts.find((d) => d.id === currentId) || null;
const universeOf = (d) => d.universe || 'servicenow';
/** Drafts belonging to the universe being viewed. */
const mine = () => drafts.filter((d) => universeOf(d) === vault.universe);
const persist = () => saveDrafts(drafts);
const persistSoon = debounce(persist, 400);
const draftMarkdown = (d) => serializeNote({ ...d, status: d.status === 'published' ? 'published' : 'draft' });

function createDraft(seed = {}) {
  const d = {
    id: uid(), title: 'Untitled note', type: 'topic', category: '', parent: '', description: '', tags: [], body: '',
    universe: vault.universe, status: 'draft', messages: [], history: [], created: Date.now(), updated: Date.now(), noteId: null, ...seed,
  };
  drafts.unshift(d);
  persist();
  return d;
}

/** Open an existing vault note for revision. Returns the draft id. */
export function draftFromNote(noteId) {
  drafts = getDrafts();
  const note = vault.byId.get(noteId);
  if (!note) return 'new';
  let d = drafts.find((x) => x.noteId === noteId);
  if (!d) {
    d = createDraft({ noteId, universe: note.universe, title: note.title, type: note.type, category: note.category, parent: note.parent, description: note.description, tags: note.tags.filter((t) => t !== 'placeholder'), body: note.body, status: 'draft' });
  }
  return d.id;
}

// ---------- Mount ----------

export function mount(el, param) {
  root = el;
  el.className = 'architect-view';
  drafts = getDrafts();
  el.append(
    h('aside', { class: 'drafts-pane' },
      h('div', { class: 'pane-head' }, h('h2', {}, 'Drafts'), h('button', { class: 'btn primary small', type: 'button', onclick: () => (location.hash = '#/architect/new') }, icon('plus'), 'New')),
      h('div', { class: 'draft-list', id: 'draft-list' }),
      h('div', { class: 'drafts-foot', id: 'drafts-foot' }),
    ),
    h('section', { class: 'chat-pane', id: 'chat-pane' }),
    h('section', { class: 'doc-pane', id: 'doc-pane' }),
  );
  const onSettings = () => renderAll();
  window.addEventListener('snu:settings', onSettings);
  update(param);
  return () => {
    window.removeEventListener('snu:settings', onSettings);
    streaming?.controller.abort();
    persist();
  };
}

export function update(param) {
  if (param === 'new') {
    const d = createDraft();
    history.replaceState(null, '', `#/architect/${d.id}`);
    currentId = d.id;
  } else if (param && drafts.some((d) => d.id === param)) {
    currentId = param;
  } else if (!current() || universeOf(current()) !== vault.universe) {
    currentId = mine()[0]?.id || null;
  }
  if (current()) setUniverse(universeOf(current()));
  tab = 'preview';
  renderAll();
}

function renderAll() {
  renderList();
  renderChat();
  renderDoc();
}

// ---------- Draft list ----------

function renderList() {
  const s = getSettings();
  fill($('#draft-list', root), 
    ...(mine().length
      ? mine().map((d) =>
          h('a', { class: `draft-item ${d.id === currentId ? 'active' : ''}`, href: `#/architect/${d.id}` },
            h('span', { class: 'draft-title' }, d.title || 'Untitled note'),
            h('span', { class: 'draft-meta' }, h('span', { class: `status s-${d.status}` }, STAGES.find((x) => x.id === d.status).label), h('span', {}, timeAgo(d.updated)))))
      : [h('p', { class: 'pane-empty' }, `No drafts in the ${currentUniverse().name} universe yet. Start one and build it up through conversation.`)]),
  );
  fill($('#drafts-foot', root), 
    h('button', { class: 'mode-card', type: 'button', onclick: () => openSettings('ai') },
      h('span', { class: `mode-dot ${s.aiKey ? 'on' : ''}` }),
      h('span', { class: 'mode-text' }, h('strong', {}, s.aiKey ? modelLabel(s.aiModel) : 'Offline demo mode'), h('span', {}, s.aiKey ? 'AI connected' : 'Add an API key to enable AI'))),
    h('button', { class: 'mode-card', type: 'button', onclick: () => openSettings('github') },
      h('span', { class: `mode-dot ${githubReady(s) ? 'on' : ''}` }),
      h('span', { class: 'mode-text' }, h('strong', {}, githubReady(s) ? `${s.ghOwner}/${s.ghRepo}` : 'GitHub not connected'), h('span', {}, githubReady(s) ? 'Publishes as commits' : 'Publishing stays in this browser'))),
  );
}

// ---------- Chat ----------

function renderChat() {
  const pane = $('#chat-pane', root);
  const d = current();
  if (!d) {
    fill(pane, 
      h('div', { class: 'empty-state' },
        h('div', { class: 'orbit' }),
        h('h2', {}, `AI Knowledge Architect · ${currentUniverse().name}`),
        h('p', {}, 'Tell the Architect what you know. It organises, writes and refines the note with you — and nothing is published until you approve it.'),
        h('ol', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Converse'), ' — paste raw notes, answer questions, ask for rewrites.'),
          h('li', {}, h('strong', {}, 'Review'), ' — read the draft, edit it by hand, run the checks.'),
          h('li', {}, h('strong', {}, 'Approve & publish'), ' — the note joins the graph and, once connected, your GitHub repository.')),
        h('a', { class: 'btn primary', href: '#/architect/new' }, icon('plus'), 'Start a new note')),
    );
    return;
  }

  const input = h('textarea', { class: 'composer-input', rows: 1, placeholder: 'Share what you know, paste raw notes, or ask for changes…', 'aria-label': 'Message the Architect',
    oninput: (e) => autosize(e.target),
    onkeydown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit();
      }
    } });
  const submit = () => {
    if (streaming) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    autosize(input);
    send(text);
  };

  fill(pane, 
    h('header', { class: 'chat-head' },
      h('div', { class: 'chat-title' }, icon('sparkles'), h('span', {}, 'Knowledge Architect')),
      h('span', { class: 'chat-sub' }, `${currentUniverse().name} Universe · ${getSettings().aiKey ? modelLabel(getSettings().aiModel) : 'Offline demo mode'}`),
    ),
    h('div', { class: 'messages', id: 'messages' }),
    h('div', { class: 'composer' },
      h('div', { class: 'composer-box' }, input,
        h('button', { class: 'send-btn', id: 'send-btn', type: 'button', title: 'Send', 'aria-label': 'Send', onclick: () => (streaming ? streaming.controller.abort() : submit()) }, icon('send'))),
      h('p', { class: 'composer-hint' }, 'Enter to send · Shift + Enter for a new line · You approve everything before it is published'),
    ),
  );
  renderMessages();
  if (window.innerWidth > 900) input.focus();
}

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 220) + 'px';
}

function bubble(m) {
  if (m.role === 'user') return h('div', { class: 'msg user' }, h('div', { class: 'msg-body' }, m.content));
  const { chat, note, complete } = splitReply(m.content);
  return h('div', { class: `msg assistant ${m.error ? 'error' : ''}` },
    h('div', { class: 'avatar' }, icon(m.error ? 'info' : 'sparkles')),
    h('div', { class: 'msg-body' },
      chat && h('div', { class: 'prose compact', html: renderMarkdown(chat).html }),
      note != null && h('div', { class: `draft-chip ${m.streaming && !complete ? 'writing' : ''}` }, icon(m.streaming && !complete ? 'edit' : 'check'), m.streaming && !complete ? 'Writing the draft…' : 'Draft updated — review it on the right'),
      m.streaming && !chat && note == null && h('div', { class: 'typing' }, h('i'), h('i'), h('i')),
      m.truncated && h('p', { class: 'muted small' }, 'The reply hit the length limit, so the draft was not replaced. Ask the Architect to continue or to split the note.'),
    ));
}

function renderMessages() {
  const box = $('#messages', root);
  const d = current();
  if (!box || !d) return;
  const pinned = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const items = d.messages.map(bubble);
  if (streaming) items.push(bubble({ role: 'assistant', content: streaming.text, streaming: true }));
  if (!items.length) {
    const fill = (text) => {
      const input = $('.composer-input', root);
      input.value = text;
      autosize(input);
      input.focus();
      input.setSelectionRange(text.length, text.length);
    };
    items.push(h('div', { class: 'chat-welcome' },
      h('div', { class: 'orbit small' }),
      h('h3', {}, 'What should this note capture?'),
      h('p', {}, 'Give me whatever you have — rough bullets, a pasted explanation, a half-formed idea. I’ll help you organise it into a structured note you can review and approve.'),
      h('div', { class: 'suggestions' }, SUGGESTIONS.map(([label, text]) => h('button', { class: 'chip', type: 'button', onclick: () => fill(text) }, label)))));
  }
  fill(box, ...items);
  if (pinned || streaming) box.scrollTop = box.scrollHeight;
  const btn = $('#send-btn', root);
  if (btn) {
    fill(btn, icon(streaming ? 'stop' : 'send'));
    btn.classList.toggle('stop', Boolean(streaming));
    btn.title = streaming ? 'Stop' : 'Send';
  }
}

async function send(text) {
  const d = current();
  if (!d || streaming) return;
  d.messages.push({ role: 'user', content: text });
  d.updated = Date.now();
  persist();
  const settings = getSettings();

  if (!settings.aiKey) {
    const { reply, fields } = offlineArchitect(d, text);
    applyFields(d, fields);
    d.messages.push({ role: 'assistant', content: reply, offline: true });
    persist();
    renderAll();
    return;
  }

  streaming = { text: '', controller: new AbortController(), draftId: d.id };
  renderMessages();
  try {
    const { text: full, truncated } = await streamArchitect({
      settings,
      system: buildSystemPrompt(d, draftMarkdown(d)),
      messages: toApiMessages(d.messages),
      signal: streaming.controller.signal,
      onText: (delta) => {
        if (!streaming) return;
        streaming.text += delta;
        if (!streamRaf) streamRaf = requestAnimationFrame(streamTick);
      },
    });
    const { note, complete } = splitReply(full);
    if (note && complete && !truncated) applyNote(d, note);
    d.messages.push({ role: 'assistant', content: full, truncated: truncated && note != null });
  } catch (err) {
    const partial = streaming?.text.trim();
    if (err.aborted) {
      if (partial) d.messages.push({ role: 'assistant', content: splitReply(partial).chat || '_Stopped before finishing._', error: false });
    } else {
      d.messages.push({ role: 'assistant', content: err.message || 'Something went wrong.', error: true });
    }
  }
  streaming = null;
  d.updated = Date.now();
  persist();
  if (currentId === d.id) renderAll();
  else renderList();
}

function streamTick() {
  streamRaf = 0;
  if (!streaming || streaming.draftId !== currentId) return;
  renderMessages();
  // Show the note taking shape live in the preview.
  const { note } = splitReply(streaming.text);
  if (note && tab === 'preview') {
    const closed = /^---\n[\s\S]*?\n---/.test(note);
    if (closed || !note.startsWith('---')) {
      const { data, body } = parseFrontmatter(note);
      renderPreviewInto($('#doc-body', root), { ...current(), ...pickFields(data), body }, true);
    }
  }
}

// ---------- Applying changes ----------

function pickFields(data) {
  const out = {};
  for (const k of ['title', 'category', 'parent', 'description']) if (typeof data[k] === 'string' && data[k]) out[k] = data[k];
  if (['category', 'topic', 'subtopic', 'hub'].includes(data.type)) out.type = data.type;
  if (Array.isArray(data.tags)) out.tags = data.tags.map(String);
  return out;
}

function snapshot(d) {
  d.history.push(Object.fromEntries(FIELDS.map((k) => [k, Array.isArray(d[k]) ? [...d[k]] : d[k]])));
  if (d.history.length > 25) d.history.shift();
}

/** Any content change sends an already-reviewed draft back to Draft: approval covers exact content. */
function touch(d, quiet = false) {
  d.updated = Date.now();
  if (d.status !== 'draft') {
    const was = d.status;
    d.status = 'draft';
    if (!quiet) toast(was === 'published' ? 'Editing a published note — it is a draft again until you re-approve it.' : 'The draft changed, so it needs review again.');
    return true;
  }
  return false;
}

function applyFields(d, fields) {
  snapshot(d);
  Object.assign(d, fields);
  touch(d);
}

function applyNote(d, raw) {
  const { data, body } = parseFrontmatter(raw);
  applyFields(d, { ...pickFields(data), body });
}

function undo() {
  const d = current();
  const prev = d?.history.pop();
  if (!prev) return;
  Object.assign(d, prev);
  touch(d, true);
  persist();
  renderAll();
  toast('Reverted the last change');
}

// ---------- Document panel ----------

function renderDoc() {
  const pane = $('#doc-pane', root);
  const d = current();
  if (!d) {
    fill(pane, h('div', { class: 'doc-placeholder' }, icon('file'), h('p', {}, 'The note you are drafting appears here.')));
    return;
  }
  const tabBtn = (id, label, ico) => h('button', { class: `tab ${tab === id ? 'active' : ''}`, type: 'button', role: 'tab', 'aria-selected': tab === id, onclick: () => {
    tab = id;
    renderDoc();
  } }, icon(ico), label);

  fill(pane, 
    h('div', { class: 'stepper', id: 'doc-stepper' }),
    h('div', { class: 'tabs', role: 'tablist' },
      tabBtn('preview', 'Preview', 'eye'), tabBtn('markdown', 'Markdown', 'code'), tabBtn('properties', 'Properties', 'sliders'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'icon-btn', type: 'button', title: 'Undo last change', 'aria-label': 'Undo last change', disabled: !d.history.length, onclick: undo }, icon('undo')),
      h('button', { class: 'icon-btn', type: 'button', title: 'Download .md', 'aria-label': 'Download Markdown', onclick: () => downloadText(`${noteIdFor(d).split('/').pop()}.md`, draftMarkdown(d)) }, icon('download')),
      h('button', { class: 'icon-btn danger', type: 'button', title: 'Delete draft', 'aria-label': 'Delete draft', onclick: () => confirmDelete(d) }, icon('trash')),
    ),
    h('div', { class: 'doc-body', id: 'doc-body' }),
    h('div', { class: 'doc-actions', id: 'doc-actions' }),
  );
  renderStatus();
  const body = $('#doc-body', pane);
  if (tab === 'preview') renderPreviewInto(body, d);
  else if (tab === 'markdown') renderEditor(body, d);
  else renderProperties(body, d);
}

function renderPreviewInto(body, d, live = false) {
  if (!body) return;
  const color = colorOf({ type: d.type, category: d.category });
  const stick = live && body.scrollHeight - body.scrollTop - body.clientHeight < 120;
  body.className = `doc-body preview-tab ${live ? 'live' : ''}`;
  fill(body, 
    h('div', { class: 'meta-row' },
      h('span', { class: 'badge', style: { '--c': color } }, h('span', { class: 'dot', style: { background: color } }), d.type),
      d.category && h('span', { class: 'badge subtle' }, d.category),
      d.parent && h('span', { class: `badge subtle ${resolve(d.parent) ? '' : 'warn'}`, title: resolve(d.parent) ? 'Parent note' : 'This parent note does not exist yet' }, `↑ ${d.parent}`),
    ),
    h('h1', { class: 'doc-title' }, d.title || 'Untitled note'),
    d.description && h('p', { class: 'lead' }, d.description),
    d.tags?.length > 0 && h('div', { class: 'tags' }, d.tags.map((t) => h('span', { class: 'tag' }, `#${t}`))),
    d.body.trim()
      ? h('div', { class: 'prose', html: renderMarkdown(d.body).html })
      : h('div', { class: 'doc-blank' }, icon('sparkles'), h('p', {}, 'The note takes shape here as you talk with the Architect. You can also write it by hand in the Markdown tab.')),
  );
  if (stick) body.scrollTop = body.scrollHeight;
  for (const a of body.querySelectorAll('a.wikilink')) a.target = '_blank';
}

function renderEditor(body, d) {
  body.className = 'doc-body editor-tab';
  fill(body, 
    h('textarea', { class: 'md-editor', spellcheck: 'true', placeholder: '## Section\n\nWrite Markdown here. Link notes with [[Note Title]].', 'aria-label': 'Markdown source', value: d.body,
      oninput: (e) => {
        if (!d._typing) {
          snapshot(d);
          d._typing = true;
          setTimeout(() => delete d._typing, 4000);
        }
        d.body = e.target.value;
        if (touch(d)) renderList();
        renderStatus();
        persistSoon();
      } }),
  );
  body.firstChild.value = d.body;
}

function renderProperties(body, d) {
  body.className = 'doc-body props-tab';
  const set = (key, value) => {
    snapshot(d);
    d[key] = value;
    touch(d);
    persist();
    renderList();
    renderStatus();
  };
  const field = (label, control, help) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, help && h('span', { class: 'field-help' }, help));
  const text = (key, attrs = {}) => h('input', { class: 'input', type: 'text', value: d[key] || '', onchange: (e) => set(key, e.target.value.trim()), ...attrs });
  const cats = vault.categories.map((c) => c.name);
  const parents = vault.notes.filter((n) => (d.type === 'subtopic' ? n.type === 'topic' : d.type === 'topic' ? n.type === 'category' : n.type === 'hub')).map((n) => n.title);

  fill(body, 
    field('Title', text('title'), 'Other notes link to this one by its title.'),
    h('div', { class: 'field-row' },
      field('Type', h('select', { class: 'input', onchange: (e) => {
        set('type', e.target.value);
        renderDoc();
      } }, ['category', 'topic', 'subtopic'].map((t) => h('option', { value: t, selected: d.type === t }, t[0].toUpperCase() + t.slice(1))))),
      field('Category', [text('category', { list: 'cat-options', placeholder: 'Choose or type a new one' }), h('datalist', { id: 'cat-options' }, cats.map((c) => h('option', { value: c })))]),
    ),
    field('Parent note', [text('parent', { list: 'parent-options', placeholder: 'The note directly above this one' }), h('datalist', { id: 'parent-options' }, parents.map((p) => h('option', { value: p })))], 'Sets where the note sits in the hierarchy and draws its link in the graph.'),
    field('Description', h('textarea', { class: 'input', rows: 2, onchange: (e) => set('description', e.target.value.trim()) }, d.description || ''), 'One sentence. Shown under the title, in search and in previews.'),
    field('Tags', h('input', { class: 'input', type: 'text', value: (d.tags || []).join(', '), placeholder: 'comma, separated', onchange: (e) => set('tags', e.target.value.split(',').map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean)) })),
    h('div', { class: 'path-preview' }, icon('file'), h('code', {}, `${getSettings().ghDir || 'content'}/${d.noteId || noteIdFor(d)}.md`)),
  );
}

// ---------- Review workflow ----------

function checks(d) {
  const unresolved = [...new Set([...d.body.matchAll(WIKILINK)].map((m) => m[1].trim()).filter((t) => !resolve(t)))];
  const clash = !d.noteId && vault.byId.get(noteIdFor(d));
  return [
    { ok: Boolean(d.title && d.title !== 'Untitled note'), required: true, label: 'Has a title' },
    { ok: d.body.trim().length >= 40, required: true, label: 'Has written content' },
    { ok: Boolean(d.category) || d.type === 'category', label: 'Belongs to a category' },
    { ok: Boolean(d.description), label: 'Has a one-line description' },
    { ok: !d.parent || Boolean(resolve(d.parent)), label: d.parent && !resolve(d.parent) ? `Parent “${d.parent}” does not exist yet` : 'Parent note resolves' },
    { ok: !unresolved.length, label: unresolved.length ? `${unresolved.length} link${unresolved.length > 1 ? 's' : ''} to notes that don’t exist yet: ${unresolved.slice(0, 3).join(', ')}${unresolved.length > 3 ? '…' : ''}` : 'All links resolve' },
    { ok: !clash, label: clash ? `Publishing will replace the existing note “${clash.title}”` : 'Does not overwrite another note' },
  ];
}

function setStatus(d, status) {
  d.status = status;
  d.updated = Date.now();
  persist();
  renderList();
  renderStatus();
}

function renderStatus() {
  const d = current();
  const stepper = $('#doc-stepper', root);
  const actions = $('#doc-actions', root);
  if (!d || !stepper) return;
  const at = STAGES.findIndex((s) => s.id === d.status);
  fill(stepper, ...STAGES.map((s, i) => h('div', { class: `step ${i < at ? 'done' : i === at ? 'current' : ''}` }, h('span', { class: 'step-dot' }, i < at ? icon('check') : String(i + 1)), h('span', { class: 'step-label' }, s.label))));

  const s = getSettings();
  const gh = githubReady(s);
  const btn = (label, cls, onclick, ico, disabled) => h('button', { class: `btn ${cls}`, type: 'button', onclick, disabled }, ico && icon(ico), label);
  let content;

  if (d.status === 'draft') {
    content = [
      h('p', { class: 'action-note' }, 'Work on the draft with the Architect or by hand. When it reads right, send it for review.'),
      h('div', { class: 'row' }, btn('Send for review', 'primary', () => setStatus(d, 'review'), 'arrowRight', !d.body.trim())),
    ];
  } else if (d.status === 'review') {
    const list = checks(d);
    const blocked = list.some((c) => c.required && !c.ok);
    content = [
      h('ul', { class: 'checklist' }, list.map((c) => h('li', { class: c.ok ? 'ok' : c.required ? 'fail' : 'warn' }, icon(c.ok ? 'check' : 'info'), c.label))),
      h('div', { class: 'row' },
        btn('Back to draft', '', () => setStatus(d, 'draft')),
        btn('Approve', 'primary', () => {
          setStatus(d, 'approved');
          toast('Approved — ready to publish', 'success');
        }, 'check', blocked)),
    ];
  } else if (d.status === 'approved') {
    content = [
      h('p', { class: 'action-note' }, gh
        ? ['Approved. Publishing commits ', h('code', {}, `${s.ghDir}/${d.noteId || noteIdFor(d)}.md`), ` to ${s.ghOwner}/${s.ghRepo}.`]
        : ['Approved. GitHub is not connected, so publishing adds the note to the vault in this browser only. ', h('button', { class: 'link', type: 'button', onclick: () => openSettings('github') }, 'Connect GitHub')]),
      h('div', { class: 'row' },
        btn('Back to draft', '', () => setStatus(d, 'draft')),
        btn(gh ? 'Publish to GitHub' : 'Publish to local vault', 'primary', (e) => publish(d, e.currentTarget), gh ? 'github' : 'upload')),
    ];
  } else {
    content = [
      h('p', { class: 'action-note ok' }, icon('check'), d.publishedTo === 'github' ? 'Published to GitHub and live in the vault.' : 'Published to the vault in this browser.'),
      h('div', { class: 'row' },
        btn('Revise', '', () => setStatus(d, 'draft'), 'edit'),
        h('a', { class: 'btn', href: `#/graph/${d.noteId}` }, icon('graph'), 'Show in graph'),
        h('a', { class: 'btn primary', href: `#/note/${d.noteId}` }, 'Open note', icon('arrowRight'))),
    ];
  }
  fill(actions, ...content);
}

async function publish(d, button) {
  const s = getSettings();
  const id = d.noteId || noteIdFor(d);
  const raw = serializeNote({ ...d, status: 'published', updated: new Date().toISOString().slice(0, 10) });
  button.disabled = true;
  try {
    if (githubReady(s)) {
      button.lastChild.textContent = 'Publishing…';
      const existed = vault.byId.has(id);
      await publishFile(s, `${id}.md`, raw, `${existed ? 'Update' : 'Add'} note: ${d.title}`);
      saveLocalNote(id, raw, true);
      d.publishedTo = 'github';
    } else {
      saveLocalNote(id, raw, false);
      d.publishedTo = 'local';
    }
    d.noteId = id;
    d.status = 'published';
    d.updated = Date.now();
    persist();
    renderAll();
    toast(d.publishedTo === 'github' ? 'Committed to GitHub — the site updates after the next deploy' : 'Published to your local vault', 'success', 5000);
  } catch (err) {
    button.disabled = false;
    button.lastChild.textContent = 'Publish to GitHub';
    toast(err.message, 'error', 8000);
  }
}

function confirmDelete(d) {
  const modal = openModal({
    title: 'Delete this draft?',
    body: h('p', {}, `“${d.title}” and its conversation will be removed from this browser.`, d.status === 'published' ? ' The published note itself stays in the vault.' : ''),
    footer: [
      h('button', { class: 'btn', type: 'button', onclick: () => modal.close() }, 'Cancel'),
      h('button', { class: 'btn danger', type: 'button', onclick: () => {
        drafts = drafts.filter((x) => x.id !== d.id);
        persist();
        modal.close();
        currentId = null;
        location.hash = mine()[0] ? `#/architect/${mine()[0].id}` : '#/architect';
        if (!mine()[0]) update('');
      } }, 'Delete draft'),
    ],
  });
}
