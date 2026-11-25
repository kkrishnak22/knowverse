// A tiny "director" for animated how-to-play demos: a ghost cursor that moves, clicks and drags
// copies of real controls over the game, while the game itself does the real work.
//
// The explanation rides next to the cursor (say()), so the player's eyes stay in one place.
// Motion runs on the shared frame loop and uses transform/opacity only. Every step can be
// cancelled (the player presses Skip or Esc): the pending step rejects with Cancelled.

import { frameLoop, ACTIVE, IDLE } from '../../engine/loop.js';

export class Cancelled extends Error {}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const POINTER = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M5 2.5l13.5 11.2-6.3.6 3.6 6.9-2.6 1.3-3.6-6.9-4.6 4.4z" fill="#ffffff" stroke="#10131c" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const GAP = 20; // distance between the cursor tip and its caption
const EDGE = 8; // keep the caption this far inside the game

/** @param {HTMLElement} root A positioned element the cursor moves over. */
export function createDirector(root) {
  const cursor = document.createElement('div');
  cursor.className = 'kvx-cursor';
  cursor.innerHTML = `${POINTER}<i></i>`;
  const tip = document.createElement('div');
  tip.className = 'kvx-tip';
  tip.setAttribute('role', 'status');
  root.append(cursor, tip);

  let token = { cancelled: true };
  let pos = { x: 0, y: 0 };
  let ghost = null;
  let box = { w: 0, h: 0 }; // the root's size
  let tipSize = { w: 0, h: 0 };
  let side = { left: false, up: false }; // which side of the cursor the caption sits on
  const timers = new Set();

  const place = (el, p) => (el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`);
  const check = () => {
    if (token.cancelled) throw new Cancelled();
  };

  /** Choose the caption's side once per move (from where the cursor is heading), so it never flips mid-glide. */
  function chooseSide(p) {
    side = { left: p.x + GAP + tipSize.w > box.w - EDGE, up: p.y + GAP + tipSize.h > box.h - EDGE };
  }

  /** Put the cursor, any dragged copy and the caption where they belong for the current position. */
  function follow() {
    place(cursor, pos);
    if (ghost) place(ghost, { x: pos.x - ghost.offsetWidth / 2, y: pos.y - ghost.offsetHeight / 2 });
    if (!tip.classList.contains('show')) return;
    const x = side.left ? pos.x - GAP - tipSize.w : pos.x + GAP;
    const y = side.up ? pos.y - GAP - tipSize.h : pos.y + GAP;
    place(tip, { x: clamp(x, EDGE, box.w - tipSize.w - EDGE), y: clamp(y, EDGE, box.h - tipSize.h - EDGE) });
  }

  /** Centre of an element (or a point), in the root's coordinates. The element is scrolled into view first. */
  function at(target) {
    if (!(target instanceof Element)) return target;
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = target.getBoundingClientRect();
    const o = root.getBoundingClientRect();
    return { x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2 };
  }

  function tween(ms, fn) {
    const t0 = token;
    return new Promise((resolve, reject) => {
      let t = 0;
      const ticker = frameLoop.add((dt) => {
        if (t0.cancelled) {
          ticker.remove();
          reject(new Cancelled());
          return IDLE;
        }
        t = Math.min(1, t + dt / ms);
        fn(ease(t));
        if (t < 1) return ACTIVE;
        ticker.remove();
        resolve();
        return IDLE;
      });
    });
  }

  return {
    /** Begin a new demo; any earlier one is cancelled. */
    start() {
      token.cancelled = true;
      token = { cancelled: false };
      box = { w: root.clientWidth, h: root.clientHeight };
      pos = { x: box.w * 0.5, y: box.h * 0.55 };
      follow();
      cursor.classList.add('show');
    },

    get running() {
      return !token.cancelled;
    },

    sleep(ms) {
      const t0 = token;
      return new Promise((resolve, reject) => {
        const id = setTimeout(() => {
          timers.delete(id);
          if (t0.cancelled) reject(new Cancelled());
          else resolve();
        }, ms);
        timers.add(id);
      });
    },

    /** Show an explanation right next to the cursor. It follows the cursor until the next one. */
    say(text) {
      check();
      tip.textContent = text;
      tip.classList.remove('show', 'fresh');
      box = { w: root.clientWidth, h: root.clientHeight };
      tipSize = { w: tip.offsetWidth, h: tip.offsetHeight };
      chooseSide(pos);
      tip.classList.add('show');
      void tip.offsetWidth;
      tip.classList.add('fresh');
      follow();
    },

    /** Glide the cursor to an element or point (in the root's coordinates). */
    async moveTo(target, ms = 700) {
      check();
      const from = { ...pos };
      const to = at(target);
      chooseSide(to);
      await tween(ms, (e) => {
        pos = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
        follow();
      });
    },

    /** A click: the cursor dips and a ring ripples out. */
    async press() {
      check();
      cursor.classList.remove('press');
      void cursor.offsetWidth;
      cursor.classList.add('press');
      await this.sleep(220);
    },

    /** Move to a control and click it. The caller performs the real action afterwards. */
    async click(target, ms = 700) {
      await this.moveTo(target, ms);
      await this.press();
    },

    /** Drag a copy of `chip` to `target`; the caller performs the real drop afterwards. */
    async drag(chip, target, ms = 900) {
      await this.click(chip, 650);
      ghost = chip.cloneNode(true);
      ghost.classList.add('kvx-ghost');
      ghost.removeAttribute('title');
      root.append(ghost);
      follow();
      try {
        await this.moveTo(target, ms);
      } finally {
        ghost?.remove();
        ghost = null;
      }
    },

    /** Stop the demo and tidy up. Safe to call more than once. */
    cancel() {
      token.cancelled = true;
      timers.forEach(clearTimeout);
      timers.clear();
      ghost?.remove();
      ghost = null;
      cursor.classList.remove('show', 'press');
      tip.classList.remove('show', 'fresh');
      // Park both at the origin: hidden elements left near an edge would still widen the layout.
      pos = { x: 0, y: 0 };
      place(cursor, pos);
      place(tip, pos);
    },
  };
}
