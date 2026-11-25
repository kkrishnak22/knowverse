// A tiny "director" for animated how-to-play demos: a ghost cursor that moves, clicks and drags
// copies of real controls over the game, while the game itself does the real work.
//
// The explanation rides next to the cursor (say()), with a spotlight ring on the active control,
// a reading-time progress bar, and Pause / Next / Speed controls so humans can read at their own
// pace. Motion runs on the shared frame loop and uses transform/opacity only. Every step can be
// cancelled (the player presses Skip or Esc): the pending step rejects with Cancelled.

import { frameLoop, ACTIVE, IDLE } from '../../engine/loop.js';

export class Cancelled extends Error {}
export class StepRewind extends Error {}
export class StepAdvance extends Error {}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const POINTER = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M5 2.5l13.5 11.2-6.3.6 3.6 6.9-2.6 1.3-3.6-6.9-4.6 4.4z" fill="#ffffff" stroke="#10131c" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const GAP = 20; // distance between the cursor tip and its caption
const EDGE = 8; // keep the caption this far inside the game
const SPOT_PAD = 6; // breathing room around the spotlighted element

/** @param {HTMLElement} root A positioned element the cursor moves over. */
export function createDirector(root) {
  const dim = document.createElement('div');
  dim.className = 'kvx-dim';
  const spotlightEl = document.createElement('div');
  spotlightEl.className = 'kvx-spotlight';
  const cursor = document.createElement('div');
  cursor.className = 'kvx-cursor';
  cursor.innerHTML = `${POINTER}<i></i>`;
  const tip = document.createElement('div');
  tip.className = 'kvx-tip';
  tip.setAttribute('role', 'status');

  const tipHead = document.createElement('div');
  tipHead.className = 'kvx-tip-head';
  const tipStep = document.createElement('span');
  tipStep.className = 'kvx-tip-step';
  const tipKey = document.createElement('kbd');
  tipKey.className = 'kvx-tip-key';
  tipHead.append(tipStep, tipKey);

  const tipBody = document.createElement('div');
  tipBody.className = 'kvx-tip-body';
  const tipHint = document.createElement('div');
  tipHint.className = 'kvx-tip-hint';
  const tipTrack = document.createElement('div');
  tipTrack.className = 'kvx-tip-track';
  const tipBar = document.createElement('i');
  tipBar.className = 'kvx-tip-bar';
  tipTrack.append(tipBar);
  tip.append(tipHead, tipBody, tipHint, tipTrack);

  // Overlays sit on top of the game (the audit skips elements marked data-overlay).
  dim.dataset.overlay = spotlightEl.dataset.overlay = cursor.dataset.overlay = tip.dataset.overlay = '';
  root.append(dim, spotlightEl, cursor, tip);

  let token = { cancelled: true };
  let stepToken = { rewound: false, advanced: false };
  let pos = { x: 0, y: 0 };
  let ghost = null;
  let box = { w: 0, h: 0 }; // the root's size
  let tipSize = { w: 0, h: 0 };
  let side = { left: false, up: false }; // which side of the cursor the caption sits on
  let paused = false;
  let mode = 'normal'; // 'slow' | 'normal' | 'step'
  let hints = { paused: 'Paused · Space to resume · → Next', step: 'Step mode · Space or → Next' };
  let onState = null;
  const waiters = new Set(); // active sleep/step waiters: { skip(), cancel() }

  const place = (el, p) => (el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`);
  const setBar = (ratio) => (tipBar.style.transform = `scaleX(${clamp(ratio, 0, 1).toFixed(3)})`);
  const check = () => {
    if (token.cancelled) throw new Cancelled();
    if (stepToken.rewound) throw new StepRewind();
    if (stepToken.advanced) throw new StepAdvance();
  };

  function emitState() {
    tip.classList.toggle('paused', paused);
    tip.classList.toggle('step-wait', mode === 'step' && !paused);
    tipHint.textContent = paused ? hints.paused : mode === 'step' ? hints.step : '';
    onState?.({ paused, mode });
  }

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

  /** Highlight a target element with a soft spotlight ring (or hide the ring for raw points). */
  function spotlight(target) {
    if (!(target instanceof Element)) {
      spotlightEl.classList.remove('show');
      return;
    }
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = target.getBoundingClientRect();
    const o = root.getBoundingClientRect();
    const x = clamp(r.left - o.left - SPOT_PAD, 2, Math.max(2, root.clientWidth - 20));
    const y = clamp(r.top - o.top - SPOT_PAD, 2, Math.max(2, root.clientHeight - 20));
    spotlightEl.style.width = `${Math.max(24, r.width + SPOT_PAD * 2).toFixed(1)}px`;
    spotlightEl.style.height = `${Math.max(24, r.height + SPOT_PAD * 2).toFixed(1)}px`;
    place(spotlightEl, { x, y });
    spotlightEl.classList.add('show');
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
    const s0 = stepToken;
    const dur = mode === 'slow' ? ms / 0.6 : ms;
    return new Promise((resolve, reject) => {
      let t = 0;
      const ticker = frameLoop.add((dt) => {
        if (t0.cancelled) {
          ticker.remove();
          reject(new Cancelled());
          return IDLE;
        }
        if (s0.rewound) {
          ticker.remove();
          reject(new StepRewind());
          return IDLE;
        }
        if (s0.advanced) {
          ticker.remove();
          reject(new StepAdvance());
          return IDLE;
        }
        if (paused) return ACTIVE;
        t = Math.min(1, t + dt / dur);
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
    start(opts = {}) {
      token.cancelled = true;
      token = { cancelled: false };
      stepToken = { rewound: false, advanced: false };
      paused = false;
      if (opts.hints) hints = { ...hints, ...opts.hints };
      if (opts.onState) onState = opts.onState;
      box = { w: root.clientWidth, h: root.clientHeight };
      pos = { x: box.w * 0.5, y: box.h * 0.55 };
      setBar(0);
      follow();
      dim.classList.add('show');
      cursor.classList.add('show');
      emitState();
    },

    get running() {
      return !token.cancelled;
    },

    get paused() {
      return paused;
    },

    get mode() {
      return mode;
    },

    setMode(nextMode) {
      mode = nextMode;
      emitState();
    },

    setHints(nextHints) {
      hints = { ...hints, ...nextHints };
      emitState();
    },

    pause() {
      if (token.cancelled || paused) return;
      paused = true;
      emitState();
    },

    resume() {
      if (token.cancelled || !paused) return;
      paused = false;
      emitState();
    },

    togglePause() {
      if (paused) this.resume();
      else this.pause();
    },

    /** Immediately interrupt the current beat and advance to the next beat. */
    next() {
      if (token.cancelled) return;
      paused = false;
      stepToken.advanced = true;
      ghost?.remove();
      ghost = null;
      emitState();
      [...waiters].forEach((w) => w.advance());
    },

    /** Interrupt the current beat so the runner can rewind to the previous beat. */
    prev() {
      if (token.cancelled) return;
      paused = false;
      stepToken.rewound = true;
      ghost?.remove();
      ghost = null;
      emitState();
      [...waiters].forEach((w) => w.rewind());
    },

    /** Clear step jump flags before entering a beat. */
    resetStep() {
      stepToken = { rewound: false, advanced: false };
    },

    sleep(ms, { holdInStep = false } = {}) {
      const t0 = token;
      const s0 = stepToken;
      const dur = mode === 'slow' ? ms / 0.58 : ms;
      return new Promise((resolve, reject) => {
        let elapsed = 0;
        let settled = false;
        const done = (outcome) => {
          if (settled) return;
          settled = true;
          waiters.delete(waiter);
          ticker.remove();
          setBar(0);
          if (outcome === 'ok') resolve();
          else if (outcome === 'advance') reject(new StepAdvance());
          else if (outcome === 'rewind') reject(new StepRewind());
          else reject(new Cancelled());
        };
        const waiter = {
          advance: () => done('advance'),
          rewind: () => done('rewind'),
          cancel: () => done('cancel'),
        };
        waiters.add(waiter);
        const ticker = frameLoop.add((dt) => {
          if (t0.cancelled) {
            done('cancel');
            return IDLE;
          }
          if (s0.rewound) {
            done('rewind');
            return IDLE;
          }
          if (s0.advanced) {
            done('advance');
            return IDLE;
          }
          if (paused) return ACTIVE;
          if (mode === 'step' && holdInStep) {
            setBar(1);
            return ACTIVE;
          }
          elapsed += dt;
          const ratio = clamp(1 - elapsed / dur, 0, 1);
          setBar(ratio);
          if (elapsed < dur) return ACTIVE;
          done('ok');
          return IDLE;
        });
      });
    },

    /** Show an explanation right next to the cursor. It follows the cursor until the next one. */
    say(text, { badge = 'DEMO', key = '' } = {}) {
      check();
      tipStep.textContent = badge;
      tipKey.textContent = key;
      tipKey.hidden = !key;
      tipBody.textContent = text;
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
    async moveTo(target, ms = 900) {
      check();
      spotlight(target);
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
      await this.sleep(260);
    },

    /** Move to a control and click it. The caller performs the real action afterwards. */
    async click(target, ms = 900) {
      await this.moveTo(target, ms);
      await this.press();
    },

    /** Drag a copy of `chip` to `target`; the caller performs the real drop afterwards. */
    async drag(chip, target, ms = 1100) {
      await this.click(chip, 800);
      spotlight(target);
      ghost = chip.cloneNode(true);
      ghost.classList.add('kvx-ghost');
      ghost.dataset.overlay = '';
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
      paused = false;
      [...waiters].forEach((w) => w.cancel());
      waiters.clear();
      ghost?.remove();
      ghost = null;
      dim.classList.remove('show');
      spotlightEl.classList.remove('show');
      cursor.classList.remove('show', 'press');
      tip.classList.remove('show', 'fresh', 'paused', 'step-wait');
      setBar(0);
      // Park both at the origin: hidden elements left near an edge would still widen the layout.
      pos = { x: 0, y: 0 };
      place(cursor, pos);
      place(tip, pos);
      place(spotlightEl, pos);
    },
  };
}
