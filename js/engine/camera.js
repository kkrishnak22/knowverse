// Camera maths shared by every pannable, zoomable surface (multiverse map, universe graphs).
// A camera is { x, y, k }: screen = world * k + (x, y).
//
// Everything here is a pure function or a small state holder with no DOM access, so it is
// unit-tested (tests/camera.test.js) and all motion is expressed in real time (milliseconds),
// never "per frame" — the feel is identical on 60 Hz and 120 Hz screens.

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Fraction of the remaining distance to cover in `dt` ms, for a time constant of `tau` ms. */
export const easeFactor = (dt, tau) => 1 - Math.exp(-dt / tau);

/** Zoom to scale `k` while keeping the screen point (px, py) over the same world point. */
export function zoomAt(cam, px, py, k) {
  const r = k / cam.k;
  return { k, x: px - (px - cam.x) * r, y: py - (py - cam.y) * r };
}

/** World coordinates under a screen point. */
export const toWorld = (cam, px, py) => ({ x: (px - cam.x) / cam.k, y: (py - cam.y) / cam.k });

/**
 * Move `cam` toward `target` (mutates cam). Returns true once it has arrived.
 * Position is eased in screen space and scale in log space, which is what makes
 * a combined pan-and-zoom look like one straight glide instead of a curve.
 */
export function approach(cam, target, dt, tau = 110) {
  const f = easeFactor(dt, tau);
  cam.x += (target.x - cam.x) * f;
  cam.y += (target.y - cam.y) * f;
  cam.k = Math.exp(Math.log(cam.k) + (Math.log(target.k) - Math.log(cam.k)) * f);
  const done = Math.abs(target.x - cam.x) < 0.25 && Math.abs(target.y - cam.y) < 0.25 && Math.abs(target.k / cam.k - 1) < 0.001;
  if (done) Object.assign(cam, target);
  return done;
}

/** The camera that frames a world-space box inside a viewport. */
export function fitBounds({ x0, y0, x1, y1 }, { width, height }, { pad = 0, minK = 0.15, maxK = 4 } = {}) {
  const k = clamp(Math.min(width / (x1 - x0 + pad * 2), height / (y1 - y0 + pad * 2)), minK, maxK);
  return { k, x: width / 2 - ((x0 + x1) / 2) * k, y: height / 2 - ((y0 + y1) / 2) * k };
}

/**
 * Drag inertia: feed it pointer positions while dragging, then call release() and
 * step() each frame; the camera keeps gliding and slows down like a flicked map.
 */
export class Inertia {
  constructor({ friction = 240, minSpeed = 0.02, sample = 90 } = {}) {
    this.friction = friction; // ms time constant of the slow-down
    this.minSpeed = minSpeed; // px/ms below which the glide stops
    this.sample = sample; // ms of recent movement used to measure the flick
    this.points = [];
    this.vx = this.vy = 0;
  }

  /** Record a pointer position (screen px) at time `t` (ms). */
  track(x, y, t) {
    this.points.push({ x, y, t });
    while (this.points.length > 2 && t - this.points[0].t > this.sample) this.points.shift();
  }

  /** The pointer was lifted at time `t`: work out the flick velocity. */
  release(t) {
    const pts = this.points;
    this.points = [];
    const first = pts[0];
    const last = pts.at(-1);
    // No glide if the pointer was held still before release, or barely moved.
    if (!first || !last || last === first || t - last.t > 60) return this.stop();
    const span = Math.max(1, last.t - first.t);
    this.vx = (last.x - first.x) / span;
    this.vy = (last.y - first.y) / span;
    if (Math.hypot(this.vx, this.vy) < 0.1) this.stop();
    return this.active;
  }

  stop() {
    this.vx = this.vy = 0;
    this.points = [];
    return false;
  }

  get active() {
    return this.vx !== 0 || this.vy !== 0;
  }

  /** Advance by `dt` ms. Returns the pan offset { dx, dy } to apply this frame. */
  step(dt) {
    if (!this.active) return { dx: 0, dy: 0 };
    // Exact integral of an exponentially decaying velocity over dt.
    const decay = Math.exp(-dt / this.friction);
    const dx = this.vx * this.friction * (1 - decay);
    const dy = this.vy * this.friction * (1 - decay);
    this.vx *= decay;
    this.vy *= decay;
    if (Math.hypot(this.vx, this.vy) < this.minSpeed) this.stop();
    return { dx, dy };
  }
}
