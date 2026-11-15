// Home: the interactive knowledge graph with a preview drawer.

import { vault, on, colorOf, backlinks, ancestors, isLocalOnly, currentUniverse } from '../store.js';
import { ForceGraph, graphData } from '../graph.js';
import { renderMarkdown } from '../markdown.js';
import { $, h, fill, icon } from '../ui.js';
import { draftFromNote } from './architectView.js';

let graph = null;
let root = null;
let selectedId = null;
const hidden = new Set();

const TYPE_LABEL = { hub: 'Hub', category: 'Category', topic: 'Topic', subtopic: 'Subtopic' };

export function mount(el, param) {
  root = el;
  el.className = 'graph-view';
  selectedId = null;

  const canvas = h('canvas', { 'aria-label': 'Knowledge graph' });
  const filter = h('input', { class: 'hud-filter', type: 'text', placeholder: 'Highlight nodes…', spellcheck: 'false', 'aria-label': 'Highlight nodes', oninput: applyFilter, onkeydown: (e) => {
    if (e.key === 'Enter' && graph.matches?.size) select([...graph.matches][0]);
    if (e.key === 'Escape') {
      e.target.value = '';
      applyFilter();
    }
  } });

  el.append(
    h('div', { class: 'graph-canvas' }, canvas),
    h('div', { class: 'hud hud-tl' },
      h('a', { class: 'hud-back', href: '#/' }, '← Multiverse'),
      h('h1', { id: 'graph-title' }, ''),
      h('p', { class: 'hud-stats', id: 'graph-stats' }),
      h('div', { class: 'hud-filter-wrap' }, icon('search'), filter),
    ),
    h('div', { class: 'hud legend', id: 'graph-legend' }),
    h('div', { class: 'hud controls' },
      h('button', { class: 'icon-btn', title: 'Zoom in', 'aria-label': 'Zoom in', onclick: () => graph.zoomBy(1.4) }, icon('plus')),
      h('button', { class: 'icon-btn', title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => graph.zoomBy(1 / 1.4) }, icon('minus')),
      h('button', { class: 'icon-btn', title: 'Fit to screen', 'aria-label': 'Fit to screen', onclick: () => graph.fit() }, icon('fit')),
      h('button', { class: 'icon-btn active', id: 'label-toggle', title: 'Toggle labels', 'aria-label': 'Toggle labels', onclick: (e) => {
        graph.showLabels = !graph.showLabels;
        e.currentTarget.classList.toggle('active', graph.showLabels);
      } }, icon('tag')),
    ),
    h('div', { class: 'hud hint' }, 'Scroll to zoom · drag to pan · click a node to preview · double-click to open'),
    h('aside', { class: 'preview', id: 'graph-preview', 'aria-label': 'Note preview' }),
  );

  graph = new ForceGraph(canvas, {
    onSelect: (n) => select(n?.id || null, false),
    onOpen: (n) => (location.hash = `#/note/${n.id}`),
  });
  graph.setHidden(hidden);
  load();
  graph.start();
  const off = on('vault', load);
  if (param) select(param);

  return () => {
    off();
    graph.destroy();
    graph = null;
  };
}

export function update(param) {
  if (param) select(param);
  else if (selectedId && !vault.byId.has(selectedId)) select(null);
}

function load() {
  const { nodes, links } = graphData(vault.notes, vault.links, colorOf);
  graph.setData(nodes, links);
  $('#graph-title', root).textContent = `${currentUniverse().name} Universe`;
  if (selectedId && !vault.byId.has(selectedId)) select(null);
  $('#graph-stats', root).textContent = vault.notes.length
    ? `${vault.notes.length} notes · ${vault.links.length} links · ${vault.categories.length} categories`
    : 'No notes yet';
  renderLegend();
  root.querySelector('.graph-empty')?.remove();
  if (!vault.notes.length) {
    root.append(h('div', { class: 'graph-empty' },
      h('div', { class: 'orbit' }),
      h('h2', {}, 'This universe is empty'),
      h('p', {}, vault.error ? `Notes could not be loaded (${vault.error}).` : `The ${currentUniverse().name} universe has no notes yet. Create the first one with the AI Knowledge Architect.`),
      h('a', { class: 'btn primary', href: '#/architect/new' }, icon('sparkles'), 'Open the Architect'),
    ));
  }
}

function renderLegend() {
  const el = $('#graph-legend', root);
  fill(el, 
    ...vault.categories.map((c) =>
      h('button', { class: `legend-chip ${hidden.has(c.name) ? 'off' : ''}`, type: 'button', title: hidden.has(c.name) ? 'Show this cluster' : 'Hide this cluster', onclick: () => {
        hidden.has(c.name) ? hidden.delete(c.name) : hidden.add(c.name);
        renderLegend();
      } }, h('span', { class: 'dot', style: { background: c.color } }), c.name, h('span', { class: 'count' }, c.count))),
    hidden.size > 0 && h('button', { class: 'legend-chip reset', type: 'button', onclick: () => {
      hidden.clear();
      renderLegend();
    } }, 'Show all'),
  );
}

function applyFilter() {
  const q = $('.hud-filter', root).value.trim().toLowerCase();
  graph.setMatches(q ? new Set(vault.notes.filter((n) => n.title.toLowerCase().includes(q) || n.tags.some((t) => t.includes(q))).map((n) => n.id)) : null);
}

function select(id, focus = true) {
  const note = id && vault.byId.get(id);
  selectedId = note ? note.id : null;
  graph.select(selectedId);
  const drawer = $('#graph-preview', root);
  if (!note) {
    drawer.classList.remove('open');
    graph.setInset(0);
    return;
  }
  renderPreview(drawer, note);
  drawer.classList.add('open');
  graph.setInset(window.innerWidth > 900 ? 420 : 0);
  if (focus || window.innerWidth > 900) graph.focusNode(note.id, focus ? 1.35 : graph.t.k);
}

function renderPreview(drawer, note) {
  const color = colorOf(note);
  const back = backlinks(note);
  const out = [...(vault.out.get(note.id) || [])].map((id) => vault.byId.get(id));
  const trail = ancestors(note);
  const content = h('div', { class: 'prose compact', html: renderMarkdown(note.body).html });
  content.addEventListener('click', (e) => {
    const a = e.target.closest('a.wikilink[data-note]');
    if (a) {
      e.preventDefault();
      select(a.dataset.note);
    }
  });

  fill(drawer, 
    h('header', { class: 'preview-head' },
      h('span', { class: 'badge', style: { '--c': color } }, h('span', { class: 'dot', style: { background: color } }), TYPE_LABEL[note.type]),
      isLocalOnly(note.id) && h('span', { class: 'badge subtle', title: 'Saved in this browser only' }, 'Local'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'icon-btn', title: 'Close preview', 'aria-label': 'Close preview', onclick: () => select(null) }, icon('x')),
    ),
    h('div', { class: 'preview-scroll' },
      trail.length > 0 && h('div', { class: 'crumbs' }, trail.map((a, i) => [i > 0 && h('span', { class: 'sep' }, '/'), h('button', { type: 'button', onclick: () => select(a.id) }, a.title)])),
      h('h2', {}, note.title),
      note.description && h('p', { class: 'lead' }, note.description),
      h('div', { class: 'preview-meta' },
        h('span', {}, icon('link'), `${out.length} outgoing`),
        h('span', {}, icon('arrowRight'), `${back.length} backlinks`),
      ),
      h('div', { class: 'preview-actions' },
        h('a', { class: 'btn primary', href: `#/note/${note.id}` }, 'Open note', icon('arrowRight')),
        h('button', { class: 'btn', type: 'button', onclick: () => (location.hash = `#/architect/${draftFromNote(note.id)}`) }, icon('sparkles'), 'Refine'),
      ),
      content,
      (out.length > 0 || back.length > 0) && h('div', { class: 'preview-links' },
        h('h3', {}, 'Connected notes'),
        h('div', { class: 'chips' }, [...new Set([...out, ...back.map((b) => b.note)])].map((n) =>
          h('button', { class: 'chip', type: 'button', onclick: () => select(n.id) }, h('span', { class: 'dot', style: { background: colorOf(n) } }), n.title))),
      ),
    ),
  );
  $('.preview-scroll', drawer).scrollTop = 0;
}
