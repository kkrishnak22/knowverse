// App shell: routing, navigation rail, command palette and settings.

import { loadVault, vault, on, getSettings, saveSettings, githubReady, search, colorOf, getUi, setUniverse, universeOfId, currentUniverse } from './store.js';
import { $, h, fill, icon, hydrateIcons, toast, openModal } from './ui.js';
import { MODELS } from './ai.js';
import { testConnection } from './github.js';
import * as multiverseView from './views/multiverseView.js';
import * as graphView from './views/graphView.js';
import * as docsView from './views/docsView.js';
import * as architectView from './views/architectView.js';

const ROUTES = {
  '': { view: multiverseView, name: 'Multiverse', nav: 'home' },
  u: { view: graphView, name: 'Graph', nav: 'graph' },
  graph: { view: graphView, name: 'Graph', nav: 'graph' },
  note: { view: docsView, name: 'Documentation', nav: 'note' },
  architect: { view: architectView, name: 'Knowledge Architect', nav: 'architect' },
};

export const go = (hash) => {
  if (location.hash === hash) route();
  else location.hash = hash;
};

let mounted = null; // { view, cleanup }

function route() {
  const segs = location.hash.replace(/^#\/?/, '').split('/');
  const def = ROUTES[segs[0]] || ROUTES[''];
  let param = '';
  try {
    param = segs.slice(1).map(decodeURIComponent).join('/');
  } catch {
    param = segs.slice(1).join('/');
  }
  // A universe is entered with #/u/<id>; note and graph links carry their universe in the note id.
  if (segs[0] === 'u') {
    if (!setUniverse(param)) return go('#/');
    param = '';
  } else if ((segs[0] === 'graph' || segs[0] === 'note') && universeOfId(param)) {
    setUniverse(universeOfId(param));
  }
  const home = def.view === multiverseView;
  const el = $('#view');
  if (mounted?.view === def.view && def.view.update) {
    def.view.update(param);
  } else {
    mounted?.cleanup?.();
    fill(el, );
    el.className = '';
    mounted = { view: def.view, cleanup: def.view.mount(el, param) };
  }
  if (def.view !== docsView) document.title = `${home ? def.name : `${currentUniverse().name} ${def.name}`} · ${vault.name}`;
  $('#topbar-view').textContent = home ? def.name : `${currentUniverse().name} Universe  /  ${def.name}`;
  renderStatus();
  for (const b of document.querySelectorAll('.rail-btn[data-nav]')) b.classList.toggle('active', b.dataset.nav === def.nav);
}

// ---------- Rail + top bar ----------

function buildChrome() {
  const btn = (name, label, attrs) => h('button', { class: 'rail-btn', type: 'button', title: label, 'aria-label': label, ...attrs }, icon(name), h('span', { class: 'rail-tip' }, label));
  $('#rail-nav').append(
    btn('orbit', 'Multiverse', { 'data-nav': 'home', onclick: () => go('#/') }),
    btn('graph', 'Knowledge graph', { 'data-nav': 'graph', onclick: () => go('#/graph') }),
    btn('book', 'Documentation', { 'data-nav': 'note', onclick: () => go('#/note') }),
    btn('sparkles', 'AI Knowledge Architect', { 'data-nav': 'architect', onclick: () => go('#/architect') }),
    btn('search', 'Search (Ctrl K)', { onclick: openPalette }),
  );
  $('#rail-foot').append(btn('settings', 'Settings', { onclick: () => openSettings() }));
  $('#search-trigger').addEventListener('click', openPalette);
  hydrateIcons();
  renderStatus();
}

const onHome = () => !location.hash.replace(/^#\/?/, '');

function renderStatus() {
  const s = getSettings();
  const gh = githubReady(s);
  fill($('#topbar-status'), 
    h('span', { class: 'stat' }, onHome() ? `${vault.universes.length} universes` : `${vault.notes.length} notes`),
    h('span', { class: 'stat' }, onHome() ? `${vault.all.length} notes` : `${vault.links.length} links`),
    h('button', { class: `pill ${gh ? 'ok' : ''}`, type: 'button', title: gh ? 'Approved notes are committed to this repository' : 'GitHub is not connected — notes publish to this browser only', onclick: () => openSettings('github') },
      icon('github'), h('span', {}, gh ? `${s.ghOwner}/${s.ghRepo}` : 'Local vault')),
  );
}

// ---------- Command palette ----------

let paletteOpen = false;

export function openPalette() {
  if (paletteOpen) return;
  paletteOpen = true;
  let items = [];
  let index = 0;

  const input = h('input', { class: 'palette-input', type: 'text', placeholder: 'Search notes, or type a command…', spellcheck: 'false', 'aria-label': 'Search' });
  const list = h('div', { class: 'palette-list', role: 'listbox' });
  const box = h('div', { class: 'palette', role: 'dialog', 'aria-label': 'Search' },
    h('div', { class: 'palette-head' }, icon('search'), input, h('kbd', {}, 'Esc')),
    list,
    h('div', { class: 'palette-foot' }, h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' navigate'), h('span', {}, h('kbd', {}, '↵'), ' open'), h('span', {}, h('kbd', {}, 'Shift'), h('kbd', {}, '↵'), ' show in graph')),
  );
  const backdrop = h('div', { class: 'backdrop top', onmousedown: (e) => e.target === backdrop && close() }, box);

  const close = () => {
    paletteOpen = false;
    backdrop.classList.remove('in');
    setTimeout(() => backdrop.remove(), 160);
  };

  const commands = [
    { label: 'Open multiverse', hint: 'Go to', ico: 'orbit', run: () => go('#/') },
    { label: 'Open knowledge graph', hint: 'Go to', ico: 'graph', run: () => go('#/graph') },
    { label: 'Open documentation', hint: 'Go to', ico: 'book', run: () => go('#/note') },
    { label: 'Open AI Knowledge Architect', hint: 'Go to', ico: 'sparkles', run: () => go('#/architect') },
    { label: 'New draft note', hint: 'Create', ico: 'plus', run: () => go('#/architect/new') },
    { label: 'Settings', hint: 'Configure', ico: 'settings', run: () => openSettings() },
    ...vault.universes.map((u) => ({ label: `${u.name} Universe`, hint: 'Enter universe', ico: u.icon, run: () => go(`#/u/${u.id}`) })),
  ];

  const noteItem = (note, snippet) => ({
    label: note.title,
    sub: snippet || note.description,
    hint: note.category || note.type,
    color: colorOf(note),
    run: () => go(`#/note/${note.id}`),
    alt: () => go(`#/graph/${note.id}`),
  });

  function refresh() {
    const q = input.value.trim();
    if (q) {
      items = search(q, 20).map((r) => noteItem(r.note, r.snippet));
      items.push(...commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())));
    } else {
      const recent = (getUi().recent || []).map((id) => vault.byId.get(id)).filter(Boolean).slice(0, 5);
      items = [...recent.map((n) => noteItem(n)), ...commands];
    }
    index = 0;
    draw();
  }

  function draw() {
    fill(list, 
      ...(items.length
        ? items.map((it, i) =>
            h('button', { class: `palette-item ${i === index ? 'active' : ''}`, type: 'button', role: 'option', onmousemove: () => i !== index && ((index = i), draw()), onclick: (e) => choose(it, e.shiftKey) },
              it.color ? h('span', { class: 'dot', style: { background: it.color } }) : icon(it.ico || 'file'),
              h('span', { class: 'palette-text' }, h('span', { class: 'palette-label' }, it.label), it.sub && h('span', { class: 'palette-sub' }, it.sub)),
              h('span', { class: 'palette-hint' }, it.hint)))
        : [h('div', { class: 'palette-empty' }, 'No matching notes')]),
    );
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }

  function choose(it, alt) {
    close();
    (alt && it.alt ? it.alt : it.run)();
  }

  input.addEventListener('input', refresh);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      index = (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length);
      draw();
    } else if (e.key === 'Enter' && items[index]) {
      e.preventDefault();
      choose(items[index], e.shiftKey);
    }
  });

  $('#overlays').append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('in'));
  refresh();
  input.focus();
}

// ---------- Settings ----------

export function openSettings(focus) {
  const s = getSettings();
  const field = (label, control, help) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, help && h('span', { class: 'field-help' }, help));
  const text = (key, attrs = {}) => h('input', { class: 'input', type: 'text', value: s[key], spellcheck: 'false', autocomplete: 'off', oninput: (e) => (s[key] = e.target.value.trim()), ...attrs });
  const select = (key, options) => h('select', { class: 'input', onchange: (e) => (s[key] = e.target.value) }, options.map(([v, l]) => h('option', { value: v, selected: s[key] === v }, l)));

  const testOut = h('span', { class: 'field-help' });
  const testBtn = h('button', { class: 'btn', type: 'button', onclick: async () => {
    if (!s.ghOwner || !s.ghRepo || !s.ghToken) {
      testOut.textContent = 'Fill in owner, repository and token first.';
      testOut.className = 'field-help warn';
      return;
    }
    testBtn.disabled = true;
    testOut.className = 'field-help';
    testOut.textContent = 'Testing…';
    try {
      const r = await testConnection(s);
      testOut.textContent = r.canPush ? `Connected to ${r.name} (${r.private ? 'private' : 'public'}) with write access.` : `Connected to ${r.name}, but this token cannot write to it.`;
      testOut.className = `field-help ${r.canPush ? 'ok' : 'warn'}`;
    } catch (err) {
      testOut.textContent = err.message;
      testOut.className = 'field-help warn';
    }
    testBtn.disabled = false;
  } }, 'Test connection');

  const body = h('div', { class: 'settings' },
    h('section', { id: 'settings-ai' },
      h('h3', {}, icon('sparkles'), 'AI Knowledge Architect'),
      h('p', { class: 'muted' }, 'The Architect talks to Claude directly from this browser using your own Anthropic API key. Without a key it runs in an offline demo mode that only files your text into a skeleton.'),
      field('Anthropic API key', text('aiKey', { type: 'password', placeholder: 'sk-ant-…' })),
      h('div', { class: 'field-row' },
        field('Model', select('aiModel', MODELS.map((m) => [m.id, `${m.label} — ${m.note}`]))),
        field('Effort', select('aiEffort', [['low', 'Low — quickest'], ['medium', 'Medium'], ['high', 'High — most thorough']])),
      ),
    ),
    h('section', { id: 'settings-github' },
      h('h3', {}, icon('github'), 'GitHub publishing'),
      h('p', { class: 'muted' }, 'When connected, approving and publishing a note commits it as a Markdown file to your repository. Until then, published notes are kept in this browser only.'),
      h('div', { class: 'field-row' }, field('Owner', text('ghOwner', { placeholder: 'your-username' })), field('Repository', text('ghRepo', { placeholder: 'sn-universe' }))),
      h('div', { class: 'field-row' }, field('Branch', text('ghBranch', { placeholder: 'main' })), field('Content folder', text('ghDir', { placeholder: 'content' }))),
      field('Personal access token', text('ghToken', { type: 'password', placeholder: 'github_pat_…' }), 'A fine-grained token limited to this one repository with “Contents: Read and write”.'),
      h('div', { class: 'field-inline' }, testBtn, testOut),
    ),
    h('p', { class: 'muted small' }, icon('info'), 'Both keys are stored only in this browser (localStorage) and are sent only to api.anthropic.com and api.github.com. Don’t save them on a shared computer.'),
  );

  const modal = openModal({
    title: 'Settings',
    body,
    footer: [
      h('button', { class: 'btn', type: 'button', onclick: () => modal.close() }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => {
        saveSettings({ ...s, ghBranch: s.ghBranch || 'main', ghDir: (s.ghDir || 'content').replace(/^\/+|\/+$/g, '') });
        renderStatus();
        modal.close();
        toast('Settings saved', 'success');
        window.dispatchEvent(new Event('snu:settings'));
      } }, 'Save settings'),
    ],
  });
  if (focus) $(`#settings-${focus}`, modal.el)?.scrollIntoView({ block: 'start' });
}

// ---------- Boot ----------

async function boot() {
  buildChrome();
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    }
  });
  on('vault', renderStatus);
  $('#view').append(h('div', { class: 'loading' }, h('div', { class: 'orbit' }), h('p', {}, 'Mapping the universe…')));
  await loadVault();
  document.querySelector('.topbar-name').textContent = vault.name;
  if (vault.error && !vault.notes.length) toast(`Could not load notes: ${vault.error}`, 'error', 7000);
  window.addEventListener('hashchange', route);
  route();
}

boot();
