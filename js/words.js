// Underlined words: any glossary word in a piece of text gets a dotted underline. Hovering shows
// its meaning (the app tooltip); clicking or tapping opens a small card right beside the word, so
// the reader's eyes stay where they were. The card can point at the thing on screen ("See it").
// Words the reader has opened are remembered on this device and get a tick in word lists.
//
// Installed once (app.js); works in every view because it listens on the document.

import { h, icon } from './ui.js';
import { BY_ID, findTerms, wordText } from './glossary.js';
import { getLang } from './i18n.js';

const KEY = 'knowverse.words.seen';
const GAP = 8;
let seen = load();
let card = null;
let anchor = null;

function load() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function remember(id) {
  if (seen.has(id)) return;
  seen.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    /* storage blocked: remember for this visit only */
  }
  document.querySelectorAll(`.kv-term[data-term="${id}"]`).forEach((el) => el.classList.add('seen'));
  document.dispatchEvent(new CustomEvent('kv-words-changed', { detail: { id } }));
}

export const isSeen = (id) => seen.has(id);

/** One underlined word. `label` is the text shown (defaults to the glossary heading). */
export function termButton(id, label) {
  const w = wordText(BY_ID.get(id), getLang());
  return h('button', { class: `kv-term ${seen.has(id) ? 'seen' : ''}`, type: 'button', 'data-term': id, title: w.short }, label ?? w.term);
}

/**
 * Text with its glossary words underlined. Pass the same `scope` set to several calls (a whole
 * log, say) to underline each word only the first time it appears.
 */
export function termify(text, scope = new Set()) {
  return findTerms(String(text), scope).map((s) => (s.id ? termButton(s.id, s.text) : s.text));
}

// Prose is underlined everywhere except code, links, headings, buttons and kit blocks.
const SKIP = 'pre, code, kbd, a, button, h1, h2, h3, h4, .wikilink, .kv-term, .kv-block, svg';

/**
 * Underline the glossary words in rendered prose (a lesson or a note), each once per `scope`.
 * Run it before kit blocks are hydrated.
 */
export function termifyProse(root, scope = new Set()) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parts = termify(node.nodeValue, scope);
    if (parts.some((p) => typeof p !== 'string')) node.replaceWith(...parts);
  }
  return scope;
}

/** The element "See it" should point at, if it is on screen right now. */
function spotFor(el, g) {
  if (!g.see) return null;
  const target = (el.closest('.kvx') || document).querySelector(g.see);
  return target && target.getClientRects().length ? target : null;
}

function spotlight(target) {
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  target.classList.remove('kv-spot');
  void target.offsetWidth;
  target.classList.add('kv-spot');
  setTimeout(() => target.classList.remove('kv-spot'), 1900);
}

/** Put the card just below the word (or above when there is no room), inside the window. */
function place() {
  if (!card || !anchor?.isConnected) return closeWordCard();
  const r = anchor.getBoundingClientRect();
  const w = card.offsetWidth;
  const ch = card.offsetHeight;
  const below = r.bottom + GAP + ch < window.innerHeight - 8 || r.top - GAP - ch < 8;
  const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const y = below ? Math.min(window.innerHeight - ch - 8, r.bottom + GAP) : r.top - GAP - ch;
  card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  card.classList.toggle('above', !below);
}

export function closeWordCard() {
  if (!card) return;
  const el = card;
  card = null;
  anchor = null;
  el.classList.remove('in');
  setTimeout(() => el.remove(), 200);
}

export function openWordCard(el) {
  const g = BY_ID.get(el.dataset.term);
  if (!g) return;
  closeWordCard();
  const w = wordText(g, getLang());
  const see = getLang() === 'te' ? 'Screen meeda choodu' : 'See it on screen';
  const target = spotFor(el, g);
  anchor = el;
  card = h('aside', { class: 'wordcard', role: 'dialog', 'aria-label': w.term },
    h('div', { class: 'wordcard-head' },
      h('span', { class: 'wordcard-kicker' }, icon('book'), 'Word'),
      h('button', { class: 'wordcard-x', type: 'button', title: 'Close (Esc)', 'aria-label': 'Close', onclick: closeWordCard }, icon('x'))),
    h('h3', {}, w.term),
    h('p', {}, w.short),
    w.more && h('p', { class: 'wordcard-more' }, w.more),
    g.example && h('code', { class: 'wordcard-ex' }, g.example),
    target && h('button', { class: 'wordcard-see', type: 'button', onclick: () => (closeWordCard(), spotlight(target)) }, icon('target'), see));
  // In full screen only the full-screen element is drawn, so the card goes inside it.
  (document.fullscreenElement || document.body).append(card);
  place();
  requestAnimationFrame(() => card?.classList.add('in'));
  remember(g.id);
}

export function installWordCards() {
  document.addEventListener('click', (e) => {
    const term = e.target.closest?.('.kv-term');
    if (term) {
      e.preventDefault();
      if (term === anchor) closeWordCard();
      else openWordCard(term);
      return;
    }
    if (card && !e.target.closest('.wordcard')) closeWordCard();
  });
  // Capture phase, so Esc closes the card without also leaving a game or closing a panel.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && card) {
      e.stopPropagation();
      closeWordCard();
    }
  }, true);
  document.addEventListener('scroll', (e) => card && !card.contains(e.target) && closeWordCard(), { capture: true, passive: true });
  window.addEventListener('resize', closeWordCard);
  window.addEventListener('hashchange', closeWordCard);
  document.addEventListener('kv-lang-changed', closeWordCard);
}
