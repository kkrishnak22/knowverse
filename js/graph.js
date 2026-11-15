// Canvas force-directed graph: zoom, pan, drag nodes, hover-highlight, focus animations.
// No dependencies — the simulation is a small custom one tuned for clustered knowledge maps.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

const RADIUS = { universe: 30, hub: 15, category: 9.5, topic: 5.5, subtopic: 3.8 };
const MASS = { universe: 6, hub: 9, category: 2.2, topic: 1.2, subtopic: 0.6 };
const LABEL_ZOOM = { universe: -1, hub: -1, category: -1, topic: 0.72, subtopic: 1.2 };
const LABEL_FONT = { universe: '700 14.5px', hub: '600 14px', category: '600 12.5px', topic: '500 11.5px', subtopic: '400 10.5px' };

const glowCache = new Map();
function glowSprite(color) {
  if (glowCache.has(color)) return glowCache.get(color);
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  grad.addColorStop(0, color + 'aa');
  grad.addColorStop(0.25, color + '44');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  glowCache.set(color, c);
  return c;
}

const pulseCache = new Map();
/** A small bright dot with a soft halo, used for the pulses that travel along links. */
function pulseSprite() {
  if (pulseCache.has('p')) return pulseCache.get('p');
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.3, 'rgba(220,230,255,0.35)');
  grad.addColorStop(1, 'rgba(200,215,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 48, 48);
  pulseCache.set('p', c);
  return c;
}

/**
 * A sprite may be one canvas or a mip chain (largest first, each half the size of the last).
 * Pick the smallest copy that is still at least as big as it will appear on screen: shrinking a
 * huge image every frame is slow and makes fine detail shimmer.
 */
function spriteLevel(sprite, screenPx) {
  if (!Array.isArray(sprite)) return sprite;
  for (let i = sprite.length - 1; i >= 0; i--) if (sprite[i].width >= screenPx) return sprite[i];
  return sprite[0];
}

export class ForceGraph {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = { mini: false, onSelect() {}, onOpen() {}, ...opts };
    this.nodes = [];
    this.links = [];
    this.byId = new Map();
    this.adj = new Map();
    this.t = { x: 0, y: 0, k: 1 };
    this.target = null;
    this.alpha = 0;
    this.hover = null;
    this.selected = null;
    this.hiddenCats = new Set();
    this.matches = null;
    this.showLabels = true;
    this.insetRight = 0;
    this.autoFit = false;
    this.follow = null;
    this.pointers = new Map();
    this.running = false;
    this.w = this.h = 0;
    this.stars = Array.from({ length: this.opts.mini ? 0 : 150 }, () => ({
      x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8,
      r: Math.random() < 0.12 ? 1.6 : 1, a: 0.15 + Math.random() * 0.5,
      tw: 0.4 + Math.random() * 1.6, p: Math.random() * TAU,
    }));
    this._frame = this._frame.bind(this);
    this._bind();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement);
    this.resize();
  }

  // ---------- data ----------

  setData(nodes, links) {
    const prev = this.byId;
    this.nodes = nodes.map((n) => ({ ...n }));
    this.byId = new Map(this.nodes.map((n) => [n.id, n]));
    this.links = links
      .filter((l) => this.byId.has(l.source) && this.byId.has(l.target))
      .map((l) => ({
        kind: l.kind,
        bend: l.bend || 0, // perpendicular offset of the curve's control point; 0 draws a straight line
        s: this.byId.get(l.source),
        t: this.byId.get(l.target),
        phase: Math.random(),
        speeds: [0, 1, 2].map(() => 0.25 + Math.random() * 0.35), // for opts.pulses
      }));
    this.adj = new Map(this.nodes.map((n) => [n.id, new Set()]));
    for (const l of this.links) {
      this.adj.get(l.s.id).add(l.t.id);
      this.adj.get(l.t.id).add(l.s.id);
    }
    const scale = this.opts.mini ? 0.8 : 1;
    for (const n of this.nodes) {
      n.degree = this.adj.get(n.id).size;
      n.r = n.size ?? (RADIUS[n.type] + (n.type === 'topic' ? Math.min(n.degree, 8) * 0.35 : 0)) * scale;
      n.o = 1;
      n.vx = n.vy = 0;
    }
    const fresh = this._seedPositions(prev);
    this.alpha = fresh ? 1 : Math.max(this.alpha, 0.5);
    this.autoFit = true;
    if (this.selected && !this.byId.has(this.selected)) this.selected = null;
    this.hover = null;
  }

  /** Lay nodes out radially by hierarchy so clusters start untangled. Returns true if this is a first layout. */
  _seedPositions(prev) {
    const kids = new Map(this.nodes.map((n) => [n.id, []]));
    const hasParent = new Set();
    for (const l of this.links) {
      if (l.kind !== 'tree') continue;
      kids.get(l.s.id).push(l.t);
      hasParent.add(l.t.id);
    }
    const roots = this.nodes.filter((n) => !hasParent.has(n.id));
    const compress = this.opts.anchored ? 0.6 : this.opts.mini ? 0.5 : 0.3; // start tight, then expand outward
    let reused = 0;
    const place = (n, x, y, angle, spread, depth) => {
      const old = prev.get(n.id);
      if (old) {
        n.x = old.x;
        n.y = old.y;
        reused++;
      } else {
        n.x = x * compress + (Math.random() - 0.5) * 4;
        n.y = y * compress + (Math.random() - 0.5) * 4;
      }
      const ch = kids.get(n.id);
      const dist = [230, 120, 60, 40][Math.min(depth, 3)];
      ch.forEach((c, i) => {
        const a = depth === 0 ? (i / ch.length) * TAU : angle + (ch.length === 1 ? 0 : (i / (ch.length - 1) - 0.5) * spread);
        place(c, x + Math.cos(a) * dist, y + Math.sin(a) * dist, a, Math.min(spread, 2.2) * 0.75, depth + 1);
      });
    };
    roots.forEach((r, i) => {
      const primary = r.type === 'hub' || roots.length === 1;
      const a = (i / Math.max(1, roots.length)) * TAU;
      if (r.x0 != null) place(r, r.x0, r.y0, a, 2.4, 1);
      else place(r, primary ? 0 : Math.cos(a) * 420, primary ? 0 : Math.sin(a) * 420, a, 2.4, primary ? 0 : 1);
    });
    return reused < this.nodes.length / 2;
  }

  // ---------- simulation ----------

  _tick() {
    const a = this.alpha;
    if (a < 0.004) return;
    const nodes = this.nodes;
    const K = this.opts.mini ? 700 : 900;
    for (let i = 0; i < (this.opts.anchored ? 0 : nodes.length); i++) {
      const p = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const q = nodes[j];
        let dx = q.x - p.x;
        let dy = q.y - p.y;
        let d2 = dx * dx + dy * dy;
        if (d2 > 490000) continue;
        if (d2 < 1) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d2 = 1;
        }
        const d = Math.sqrt(d2);
        const f = (a * K * MASS[p.type] * MASS[q.type]) / d2;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        p.vx -= fx; p.vy -= fy;
        q.vx += fx; q.vy += fy;
      }
    }
    for (const l of this.links) {
      const dx = l.t.x - l.s.x;
      const dy = l.t.y - l.s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      let len = 150;
      let str = 0.006;
      if (l.kind === 'tree') {
        const deep = l.t.type === 'subtopic' || l.s.type === 'subtopic';
        const top = l.s.type === 'hub' || l.t.type === 'hub';
        len = top ? 190 : deep ? 48 : 105;
        str = top ? 0.16 : 0.14;
      } else if (l.kind === 'web') {
        str = 0; // decorative strands: they do not pull nodes together
      } else if (l.kind === 'bridge') {
        len = 300;
        str = 0.03;
      }
      if (this.opts.mini) len *= 0.75;
      const f = ((d - len) / d) * str * a;
      l.s.vx += dx * f; l.s.vy += dy * f;
      l.t.vx -= dx * f; l.t.vy -= dy * f;
    }
    for (const n of nodes) {
      if (this.opts.anchored && n.x0 != null) {
        // Anchored layouts (the multiverse map) hold each node near its own home position.
        // Not scaled by alpha, so every node reaches its spot before the simulation cools.
        n.vx += (n.x0 - n.x) * 0.05;
        n.vy += (n.y0 - n.y) * 0.05;
      } else {
        const pull = n.type === 'hub' ? 0.08 : 0.004;
        n.vx -= n.x * pull * a;
        n.vy -= n.y * pull * a;
      }
      if (n.fixed) {
        n.vx = n.vy = 0;
        continue;
      }
      n.vx *= 0.8;
      n.vy *= 0.8;
      const sp = Math.hypot(n.vx, n.vy);
      if (sp > 30) {
        n.vx *= 30 / sp;
        n.vy *= 30 / sp;
      }
      n.x += n.vx;
      n.y += n.vy;
    }
    this.alpha *= 0.986;
  }

  reheat(v = 0.35) {
    this.alpha = Math.max(this.alpha, v);
  }

  // ---------- camera ----------

  _visible(n) {
    return !this.hiddenCats.has(n.category || '');
  }

  _fitTransform() {
    const ns = this.nodes.filter((n) => this._visible(n));
    if (!ns.length) return { x: this.w / 2, y: this.h / 2, k: 1 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of ns) {
      x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x);
      y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y);
    }
    const pad = this.opts.mini ? 36 : Math.max(90, ...ns.map((n) => (n.sprite ? n.r * 3.8 : 0)));
    const availW = Math.max(120, this.w - this.insetRight);
    const k = clamp(Math.min(availW / (x1 - x0 + pad * 2), this.h / (y1 - y0 + pad * 2)), 0.15, this.opts.mini ? 1.5 : 1.35);
    return { k, x: availW / 2 - ((x0 + x1) / 2) * k, y: this.h / 2 - ((y0 + y1) / 2) * k };
  }

  fit() {
    this.touched = false;
    this.autoFit = false;
    this.follow = null;
    this.target = this._fitTransform();
  }

  zoomBy(factor) {
    this.touched = true;
    this.autoFit = false;
    this.follow = null;
    const cx = (this.w - this.insetRight) / 2;
    const cy = this.h / 2;
    const k = clamp((this.target?.k || this.t.k) * factor, 0.15, this.opts.maxZoom || 4);
    const base = this.target || this.t;
    const r = k / base.k;
    this.target = { k, x: cx - (cx - base.x) * r, y: cy - (cy - base.y) * r };
    this.opts.onZoom?.(k);
  }

  /** The visible node closest to the middle of the view, if one is within maxPx of it. */
  nearestToCenter(maxPx = 220) {
    const cx = ((this.w - this.insetRight) / 2 - this.t.x) / this.t.k;
    const cy = (this.h / 2 - this.t.y) / this.t.k;
    let best = null;
    let bestD = maxPx / this.t.k;
    for (const n of this.nodes) {
      if (!this._visible(n)) continue;
      const d = Math.hypot(n.x - cx, n.y - cy);
      if (d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  /** Glide the camera to a node, tracking it while the layout is still settling. */
  focusNode(id, zoom = 1.35) {
    if (!this.byId.has(id)) return;
    this.touched = true;
    this.autoFit = false;
    this.follow = { id, k: Math.max(this.t.k, zoom) };
    this._followTarget();
  }

  _followTarget() {
    const n = this.byId.get(this.follow.id);
    if (!n) {
      this.follow = null;
      return;
    }
    const k = this.follow.k;
    this.target = { k, x: (this.w - this.insetRight) / 2 - n.x * k, y: this.h / 2 - n.y * k };
    if (this.alpha < 0.02) this.follow = null;
  }

  setInset(right) {
    this.insetRight = right;
  }

  select(id) {
    this.selected = id && this.byId.has(id) ? id : null;
  }

  setHidden(set) {
    this.hiddenCats = set;
  }

  setMatches(set) {
    this.matches = set;
  }

  // ---------- rendering ----------

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const first = !this.w;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = box.width;
    this.h = box.height;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    if (first) this.t = { x: this.w / 2, y: this.h / 2, k: this.opts.mini ? 1 : 0.9 };
    else if (!this.touched && !this.follow) this.target = this._fitTransform();
    if (!this.running) this._draw(performance.now());
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._raf = requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  destroy() {
    this.stop();
    this._ro.disconnect();
    this._unbind?.();
  }

  _frame(ts) {
    if (!this.running) return;
    this._tick();
    if (this.autoFit) {
      this.target = this._fitTransform();
      if (this.alpha < 0.03) this.autoFit = false;
    }
    if (this.follow) this._followTarget();
    if (this.target) {
      const t = this.t;
      const g = this.target;
      t.x = lerp(t.x, g.x, 0.14);
      t.y = lerp(t.y, g.y, 0.14);
      t.k = lerp(t.k, g.k, 0.14);
      if (!this.autoFit && Math.abs(t.x - g.x) < 0.3 && Math.abs(t.y - g.y) < 0.3 && Math.abs(t.k - g.k) < 0.002) this.target = null;
    }
    this._draw(ts);
    this._raf = requestAnimationFrame(this._frame);
  }

  _draw(ts) {
    const { ctx, w, h, t } = this;
    if (!w) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Starfield with a little parallax.
    for (const s of this.stars) {
      const x = (((s.x * w + t.x * s.z * 0.12) % w) + w) % w;
      const y = (((s.y * h + t.y * s.z * 0.12) % h) + h) % h;
      ctx.globalAlpha = s.a * (0.55 + 0.45 * Math.sin(ts * 0.001 * s.tw + s.p));
      ctx.fillStyle = '#cdd6ff';
      ctx.fillRect(x, y, s.r, s.r);
    }

    const active = this.byId.get(this.hover) || this.byId.get(this.selected) || null;
    const near = active ? this.adj.get(active.id) : null;
    const isFocus = (n) => n === active || (near && near.has(n.id));

    // Ease each node's opacity toward its target for smooth highlight transitions.
    for (const n of this.nodes) {
      let goal = 1;
      if (!this._visible(n)) goal = 0;
      else if (this.matches && !this.matches.has(n.id)) goal = 0.1;
      else if (active && !isFocus(n)) goal = 0.16;
      n.o = Math.abs(n.o - goal) < 0.01 ? goal : lerp(n.o, goal, 0.16);
    }

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    // Links
    const px = 1 / t.k;
    for (const l of this.links) {
      const o = Math.min(l.s.o, l.t.o);
      if (o < 0.02) continue;
      const hot = active && (l.s === active || l.t === active);
      ctx.beginPath();
      ctx.moveTo(l.s.x, l.s.y);
      if (l.bend) {
        const c = this._control(l);
        ctx.quadraticCurveTo(c.x, c.y, l.t.x, l.t.y);
      } else {
        ctx.lineTo(l.t.x, l.t.y);
      }
      if (hot) {
        ctx.strokeStyle = active.color;
        ctx.globalAlpha = 0.85 * o;
        ctx.lineWidth = 1.6 * px;
      } else if (l.kind === 'web') {
        // Filament tinted from one end's colour to the other's.
        const g = ctx.createLinearGradient(l.s.x, l.s.y, l.t.x, l.t.y);
        g.addColorStop(0, l.s.color);
        g.addColorStop(1, l.t.color);
        ctx.strokeStyle = g;
        ctx.globalAlpha = 0.34 * o;
        ctx.lineWidth = 1.1 * px;
      } else {
        ctx.strokeStyle = l.kind === 'tree' ? '#8ea0d8' : '#6b7bb0';
        ctx.globalAlpha = (l.kind === 'tree' ? 0.3 : l.kind === 'web' ? 0.3 : 0.16) * o;
        ctx.lineWidth = (l.kind === 'tree' ? 1 : 0.8) * px;
      }
      ctx.stroke();
      if (this.opts.pulses) this._pulses(l, ts, o, px);
      else if (hot) {
        // A particle travelling along each highlighted link.
        const from = l.s === active ? l.s : l.t;
        const to = l.s === active ? l.t : l.s;
        const p = (ts * 0.00045 + l.phase) % 1;
        ctx.globalAlpha = Math.sin(p * Math.PI) * o;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(lerp(from.x, to.x, p), lerp(from.y, to.y, p), 1.8 * px, 0, TAU);
        ctx.fill();
      }
    }

    // Nodes
    for (const n of this.nodes) {
      if (n.o < 0.02) continue;
      const focus = isFocus(n);
      const pulse = n.type === 'hub' ? 1 + 0.06 * Math.sin(ts * 0.0016) : 1;
      const r = n.r * (n.id === this.hover ? (n.sprite ? 1.1 : 1.25) : 1) * pulse;
      const glow = r * (n.type === 'hub' ? 5.5 : focus && active ? 5 : 3.6);
      if (!n.sprite) {
        ctx.globalAlpha = n.o * (focus && active ? 0.95 : 0.6);
        ctx.drawImage(glowSprite(n.color), n.x - glow, n.y - glow, glow * 2, glow * 2);
      }
      if (n.sprite) {
        const s = r * 3.4;
        ctx.globalAlpha = n.o;
        ctx.save();
        ctx.translate(n.x, n.y + Math.sin(ts * 0.0007 + n.x0 * 0.01) * 3);
        ctx.rotate(n.tilt || 0);
        ctx.scale(1, 0.62);
        ctx.rotate(ts * 0.00016 * (n.spin || 1));
        ctx.globalCompositeOperation = 'lighter'; // overlapping galaxies add up, like light
        ctx.drawImage(spriteLevel(n.sprite, s * 2 * t.k * this.dpr), -s, -s, s * 2, s * 2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
        if (n.id === this.selected) {
          ctx.strokeStyle = n.color;
          ctx.globalAlpha = n.o * 0.5;
          ctx.lineWidth = 1.2 * px;
          ctx.beginPath();
          ctx.ellipse(n.x, n.y, s * 0.92, s * 0.6, n.tilt || 0, 0, TAU);
          ctx.stroke();
        }
        continue;
      }
      ctx.globalAlpha = n.o;
      ctx.fillStyle = n.color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, TAU);
      ctx.fill();
      if (n.type === 'hub' || n.type === 'category') {
        ctx.strokeStyle = n.color;
        ctx.globalAlpha = n.o * 0.35;
        ctx.lineWidth = 1 * px;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + (n.type === 'hub' ? 7 : 4), 0, TAU);
        ctx.stroke();
      }
      if (n.id === this.selected) {
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = n.o;
        ctx.lineWidth = 1.6 * px;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 3.5 * px, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Labels in screen space so text stays crisp at any zoom.
    if (this.showLabels) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      for (const n of this.nodes) {
        if (n.o < 0.05) continue;
        const focus = active && isFocus(n);
        const zoomAlpha = this.opts.mini || focus ? 1 : clamp((t.k - LABEL_ZOOM[n.type]) / 0.22, 0, 1);
        const a = zoomAlpha * (focus ? 1 : n.o);
        if (a < 0.03) continue;
        const sx = n.x * t.k + t.x;
        // Galaxy labels sit just under the bright core, inside their own galaxy, so they never
        // land on a neighbour drawn below it.
        const sy = n.y * t.k + t.y + n.r * (n.sprite ? 1.05 : 1) * t.k + 5;
        if (sx < -80 || sx > w + 80 || sy < -20 || sy > h + 20) continue;
        ctx.font = `${this.opts.mini ? '500 10.5px' : LABEL_FONT[n.type]} Inter, system-ui, sans-serif`;
        ctx.globalAlpha = a;
        ctx.strokeStyle = 'rgba(7, 9, 15, 0.85)';
        ctx.lineWidth = 3.5;
        ctx.strokeText(n.title, sx, sy);
        ctx.fillStyle = focus || n.type === 'hub' ? '#ffffff' : n.type === 'category' ? '#e6ebff' : '#b9c3e0';
        ctx.fillText(n.title, sx, sy);
        if (n.sub) {
          ctx.font = '500 11px Inter, system-ui, sans-serif';
          ctx.strokeText(n.sub, sx, sy + 18);
          ctx.fillStyle = '#8f9abd';
          ctx.fillText(n.sub, sx, sy + 18);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Control point of a curved link: the midpoint pushed sideways by l.bend. */
  _control(l) {
    const dx = l.t.x - l.s.x;
    const dy = l.t.y - l.s.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: (l.s.x + l.t.x) / 2 - (dy / d) * l.bend, y: (l.s.y + l.t.y) / 2 + (dx / d) * l.bend };
  }

  /** Point at t (0..1) along a link, following its curve. */
  _at(l, t, c = l.bend ? this._control(l) : null) {
    if (!c) return { x: lerp(l.s.x, l.t.x, t), y: lerp(l.s.y, l.t.y, t) };
    const u = 1 - t;
    return { x: u * u * l.s.x + 2 * u * t * c.x + t * t * l.t.x, y: u * u * l.s.y + 2 * u * t * c.y + t * t * l.t.y };
  }

  /** Glowing pulses shooting along a link, each with a short fading tail. */
  _pulses(l, ts, o, px) {
    const { ctx } = this;
    const c = l.bend ? this._control(l) : null;
    const dot = pulseSprite();
    const TAIL = [0.018, 0.036, 0.056, 0.08]; // tail dots, trailing the head along the curve
    // Pulses shrink with the map when zoomed out, so they never outweigh the galaxies.
    const size = px * Math.max(0.45, Math.min(1, this.t.k));
    for (let i = 0; i < l.speeds.length; i++) {
      const head = (ts * 0.001 * l.speeds[i] + l.phase + i / l.speeds.length) % 1;
      const fade = o * Math.min(1, head * 8, (1 - head) * 8); // fade in and out at the ends
      if (fade < 0.02) continue;
      for (let k = TAIL.length - 1; k >= 0; k--) {
        const q = this._at(l, Math.max(0, head - TAIL[k]), c);
        const r = (7 - k * 1.3) * size;
        ctx.globalAlpha = fade * (0.55 - k * 0.12);
        ctx.drawImage(dot, q.x - r, q.y - r, r * 2, r * 2);
      }
      const p = this._at(l, head, c);
      const r = 11 * size;
      ctx.globalAlpha = fade;
      ctx.drawImage(dot, p.x - r, p.y - r, r * 2, r * 2);
    }
  }

  // ---------- interaction ----------

  _nodeAt(px, py) {
    const { t } = this;
    const x = (px - t.x) / t.k;
    const y = (py - t.y) / t.k;
    let best = null;
    let bestD = Infinity;
    for (const n of this.nodes) {
      if (!this._visible(n)) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      const reach = Math.max(n.r * (n.sprite ? 2.2 : 1) + 3, 9 / t.k);
      if (d < reach && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  _bind() {
    const c = this.canvas;
    const pos = (e) => {
      const b = c.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top];
    };
    let drag = null; // { node | null, sx, sy, moved }
    let pinch = null;
    let lastClick = { id: null, time: 0 };

    const down = (e) => {
      if (e.button > 0) return;
      c.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      this.pointers.set(e.pointerId, [x, y]);
      this.touched = true;
      this.autoFit = false;
      this.follow = null;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: this.t.k };
        drag = null;
        return;
      }
      drag = { node: this._nodeAt(x, y), sx: x, sy: y, lx: x, ly: y, moved: false };
    };

    const move = (e) => {
      const [x, y] = pos(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, [x, y]);
      if (pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const k = clamp((pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1])) / pinch.d, 0.15, this.opts.maxZoom || 4);
        const r = k / this.t.k;
        this.target = null;
        this.t = { k, x: mx - (mx - this.t.x) * r, y: my - (my - this.t.y) * r };
        this.opts.onZoom?.(k);
        return;
      }
      if (drag) {
        if (!drag.moved && Math.hypot(x - drag.sx, y - drag.sy) > 4) drag.moved = true;
        if (drag.moved) {
          this.target = null;
          if (drag.node) {
            drag.node.fixed = true;
            drag.node.x = (x - this.t.x) / this.t.k;
            drag.node.y = (y - this.t.y) / this.t.k;
            if (this.opts.anchored) {
              drag.node.x0 = drag.node.x; // a dragged node stays where it is dropped
              drag.node.y0 = drag.node.y;
            }
            this.reheat(0.3);
          } else {
            this.t.x += x - drag.lx;
            this.t.y += y - drag.ly;
          }
          c.style.cursor = 'grabbing';
        }
        drag.lx = x;
        drag.ly = y;
        return;
      }
      const n = this._nodeAt(x, y);
      this.hover = n ? n.id : null;
      c.style.cursor = n ? 'pointer' : 'grab';
    };

    const up = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) pinch = null;
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.node) d.node.fixed = false;
      c.style.cursor = d.node ? 'pointer' : 'grab';
      if (d.moved) return;
      const id = d.node ? d.node.id : null;
      const now = performance.now();
      if (id && lastClick.id === id && now - lastClick.time < 350) {
        this.opts.onOpen(d.node);
        lastClick = { id: null, time: 0 };
        return;
      }
      lastClick = { id, time: now };
      this.selected = id;
      this.opts.onSelect(d.node || null);
    };

    const wheel = (e) => {
      e.preventDefault();
      const [x, y] = pos(e);
      this.touched = true;
      this.autoFit = false;
      this.follow = null;
      this.target = null;
      const k = clamp(this.t.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), 0.15, this.opts.maxZoom || 4);
      const r = k / this.t.k;
      this.t = { k, x: x - (x - this.t.x) * r, y: y - (y - this.t.y) * r };
      this.opts.onZoom?.(k);
    };

    const leave = () => {
      if (!drag) this.hover = null;
    };

    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', leave);
    c.addEventListener('wheel', wheel, { passive: false });
    c.style.cursor = 'grab';
    c.style.touchAction = 'none';
    this._unbind = () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('pointerleave', leave);
      c.removeEventListener('wheel', wheel);
    };
  }
}

/** Convert vault notes + links into graph data. */
export function graphData(notes, links, colorOf) {
  return {
    nodes: notes.map((n) => ({ id: n.id, title: n.title, type: n.type, category: n.category, color: colorOf(n) })),
    links,
  };
}
