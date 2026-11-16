// One frame loop for the whole app.
//
// Anything that animates registers a ticker here instead of calling requestAnimationFrame
// itself. The loop then makes three guarantees no single component could make alone:
//
//   1. Nothing runs while the tab is hidden.
//   2. Nothing runs when no ticker has work to do (an idle screen costs zero CPU).
//   3. Purely decorative motion is capped at AMBIENT_FPS, leaving the full frame rate
//      for the moments the user is actually interacting.
//
// A ticker is `(dt, now) => state`, where dt is the real time since its last call in ms
// (clamped, so a stalled tab never produces a huge jump) and state is one of:
//   ACTIVE  — still animating; call me again next frame
//   AMBIENT — only decorative motion left; a reduced frame rate is fine
//   IDLE    — nothing to do until someone calls wake()
// Returning true / false is accepted as ACTIVE / IDLE.

export const IDLE = 0;
export const AMBIENT = 1;
export const ACTIVE = 2;

const AMBIENT_FPS = 30;
const MAX_DT = 50;

export function createLoop({ raf = (fn) => requestAnimationFrame(fn), caf = (id) => cancelAnimationFrame(id), doc = globalThis.document } = {}) {
  const tickers = new Set();
  let handle = 0;
  let level = IDLE; // the busiest state any ticker reported last frame
  let last = 0;
  let lastRun = 0;

  const reducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  function frame(now) {
    handle = 0;
    if (doc?.hidden) return; // resumed by the visibilitychange listener
    // When only ambient motion is left, skip frames to hold AMBIENT_FPS.
    if (level === AMBIENT && now - lastRun < 1000 / AMBIENT_FPS - 1) return schedule();
    const dt = Math.min(MAX_DT, last ? now - last : 16.7);
    last = lastRun = now;
    let next = IDLE;
    for (const t of tickers) {
      if (t.state === IDLE && !t.woken) continue;
      t.woken = false;
      const s = t.fn(dt, now);
      t.state = s === true ? ACTIVE : s || IDLE;
      if (t.state === AMBIENT && reducedMotion()) t.state = IDLE;
      next = Math.max(next, t.state);
    }
    level = next;
    if (level !== IDLE) schedule();
    else last = 0; // the next wake starts a fresh dt
  }

  function schedule() {
    if (!handle && !doc?.hidden) handle = raf(frame);
  }

  doc?.addEventListener?.('visibilitychange', () => {
    last = 0;
    if (!doc.hidden && [...tickers].some((t) => t.state !== IDLE || t.woken)) schedule();
  });

  return {
    /** Register a ticker. Returns { wake, remove }. */
    add(fn) {
      const t = { fn, state: ACTIVE, woken: true };
      tickers.add(t);
      schedule();
      return {
        /** Something changed: run this ticker on the next frame. */
        wake() {
          t.woken = true;
          if (level !== ACTIVE) level = ACTIVE; // leave the ambient frame cap immediately
          schedule();
        },
        remove() {
          tickers.delete(t);
          if (!tickers.size && handle) {
            caf(handle);
            handle = 0;
            level = IDLE;
            last = 0;
          }
        },
      };
    },
    get size() {
      return tickers.size;
    },
  };
}

/** The app-wide loop. */
export const frameLoop = createLoop();
