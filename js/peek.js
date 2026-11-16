// Quick look: click any linked word ([[wikilink]]) to open a small side panel that says what it
// means, with a button to open the full topic. Words whose topic doesn't exist yet say so.
// Installed once (app.js); works in every view because it listens on the document.

import { vault } from './store.js';
import { h, icon } from './ui.js';

const TYPE_LABEL = { hub: 'Universe', category: 'Course / category', topic: 'Topic', subtopic: 'Topic' };
let panel = null;

/** First plain sentence or two of a note body, for when it has no description. */
function summary(note) {
  if (note.description) return note.description;
  for (const line of String(note.body || '').split('\n')) {
    const t = line.trim();
    if (!t || /^(#|```|>|[-*+]\s|\||---)/.test(t)) continue;
    return t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a).replace(/[*_`=]/g, '').slice(0, 260);
  }
  return '';
}

export function closePeek() {
  if (!panel) return;
  const el = panel;
  panel = null;
  el.classList.remove('in');
  setTimeout(() => el.remove(), 250);
}

export function openPeek({ noteId, term }) {
  closePeek();
  const note = noteId && vault.byId.get(noteId);
  const kids = note ? (vault.children.get(note.id) || []).length : 0;
  const href = note ? (note.lesson && !note.placeholder ? `#/learn/${note.id}` : `#/note/${note.id}`) : null;
  const text = note && summary(note);

  panel = h('aside', { class: 'peek', role: 'dialog', 'aria-label': `About ${note?.title || term}` },
    h('div', { class: 'peek-head' },
      h('span', { class: 'kicker' }, icon('info'), 'Quick look'),
      h('button', { class: 'icon-btn', type: 'button', title: 'Close (Esc)', 'aria-label': 'Close', onclick: closePeek }, icon('x'))),
    h('h2', {}, note?.title || term),
    note
      ? [
          h('span', { class: 'peek-type' }, note.lesson ? 'Lesson' : TYPE_LABEL[note.type] || 'Topic', kids ? ` · ${kids} inside` : ''),
          h('p', { class: 'peek-text' }, note.placeholder ? 'This topic is still being written.' : text || 'No short description yet.'),
          h('a', { class: 'btn primary', href, onclick: closePeek }, note.lesson && !note.placeholder ? icon('learn') : icon('book'), note.lesson && !note.placeholder ? 'Open the lesson' : 'Open the full topic', icon('arrowRight')),
        ]
      : [
          h('span', { class: 'peek-type off' }, icon('lock'), 'Currently unavailable'),
          h('p', { class: 'peek-text' }, `There is no topic for “${term}” yet. It will be linked here when it is added.`),
        ],
  );
  document.body.append(panel);
  requestAnimationFrame(() => panel?.classList.add('in'));
}

export function installPeek() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('.wikilink');
    if (link) {
      e.preventDefault();
      openPeek({ noteId: link.dataset.note, term: link.dataset.term || link.textContent });
      return;
    }
    if (panel && !e.target.closest('.peek')) closePeek();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closePeek());
  window.addEventListener('hashchange', closePeek);
}
