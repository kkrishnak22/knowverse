// Home: the multiverse. Every universe is a galaxy node on the same canvas graph engine
// that draws each universe's own knowledge graph (js/graph.js), so panning, zooming,
// dragging and focus animations behave identically at both levels.

import { vault, universeStats } from '../store.js';
import { ForceGraph } from '../graph.js';
import { $, h, fill, icon } from '../ui.js';

const ZOOM_OPENS_PANEL = 1.7; // zooming in past this opens the nearest universe's panel
const ZOOM_CLOSES_PANEL = 1.15; // zooming back out past this closes a panel opened that way

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/**
 * Pre-render a spiral galaxy in the universe's colours. It is drawn once at high resolution and
 * then halved repeatedly into a mip chain; the graph engine draws whichever copy matches the
 * on-screen size, so galaxies stay smooth and cheap at every zoom level.
 */
function galaxySprite(u) {
  const size = 1024;
  const R = size / 2 - 24;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.translate(size / 2, size / 2);
  g.globalCompositeOperation = 'lighter'; // stars add up where they overlap, like real light
  const core = rgb(u.core);
  const accent = rgb(u.accent);
  const dust = rgb(u.secondary);
  const dot = (x, y, radius, [cr, cg, cb], alpha) => {
    g.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.fill();
  };
  const armPoint = (spreadScale) => {
    const r = Math.pow(Math.random(), 2) * R;
    const arm = Math.random() < 0.5 ? 0 : Math.PI;
    const angle = arm + (r / R) * 4.6;
    const spread = () => (Math.random() - 0.5) * 2 * Math.pow(Math.random(), 2.2) * spreadScale * (r + 20);
    return { x: Math.cos(angle) * r + spread(), y: Math.sin(angle) * r + spread(), r };
  };

  // Soft haze under everything
  const haze = g.createRadialGradient(0, 0, 0, 0, 0, R);
  // Baked-in halo: the soft colour glow around each galaxy (drawn here once, not every frame).
  haze.addColorStop(0, `rgba(${accent.join(',')},0.42)`);
  haze.addColorStop(0.3, `rgba(${accent.join(',')},0.2)`);
  haze.addColorStop(0.65, `rgba(${accent.join(',')},0.06)`);
  haze.addColorStop(1, `rgba(${accent.join(',')},0)`);
  g.fillStyle = haze;
  g.fillRect(-size / 2, -size / 2, size, size);

  // Nebula: many faint, wider specks that blend into glowing arms when shrunk
  for (let i = 0; i < 5000; i++) {
    const p = armPoint(0.5);
    dot(p.x, p.y, 3 + Math.random() * 5, mix(accent, dust, Math.random()), 0.035);
  }
  // Stars: small and crisp, warm-white near the core, the universe's colour further out
  for (let i = 0; i < 6000; i++) {
    const p = armPoint(0.38);
    const color = mix(core, i % 3 === 0 ? dust : accent, Math.min(1, p.r / R + 0.1));
    dot(p.x, p.y, 0.7 + Math.pow(Math.random(), 4) * 2.4, color, 0.5 + Math.random() * 0.5);
  }
  // A few bright foreground stars with small halos
  for (let i = 0; i < 70; i++) {
    const r = Math.sqrt(Math.random()) * R * 0.95;
    const a = Math.random() * Math.PI * 2;
    dot(Math.cos(a) * r, Math.sin(a) * r, 6, [255, 255, 255], 0.06);
    dot(Math.cos(a) * r, Math.sin(a) * r, 1.6 + Math.random() * 1.4, [255, 255, 255], 0.95);
  }
  // Bright core
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.5);
  glow.addColorStop(0, 'rgba(255,253,247,1)');
  glow.addColorStop(0.15, `rgba(${core.join(',')},0.75)`);
  glow.addColorStop(0.45, `rgba(${accent.join(',')},0.25)`);
  glow.addColorStop(1, `rgba(${accent.join(',')},0)`);
  g.fillStyle = glow;
  g.beginPath();
  g.arc(0, 0, R * 0.5, 0, Math.PI * 2);
  g.fill();

  // Mip chain: halve step by step (each step averages neighbouring pixels) down to 64px.
  const levels = [c];
  while (levels.at(-1).width > 64) {
    const prev = levels.at(-1);
    const next = document.createElement('canvas');
    next.width = next.height = prev.width / 2;
    const ng = next.getContext('2d');
    ng.imageSmoothingQuality = 'high';
    ng.drawImage(prev, 0, 0, next.width, next.height);
    levels.push(next);
  }
  return levels;
}

// The universes are laid out in 3D (x, y, z in multiverse.json) and seen through a fixed
// camera, as in the original prototype: nearer universes appear larger and lower, farther
// ones smaller and higher. Projecting once gives the 2D map its depth without a 3D engine.
const CAMERA = { yaw: 0.05, pitch: 0.22, distance: 28, fov: 48 };
const WORLD = { x: 18, y: 14, z: 1.5 };
const MAP_HALF_HEIGHT = 330; // map units for half the camera's view height
const MAP_STRETCH_X = 1.25; // a little wider than the camera saw, so neighbouring labels don't collide

function project(u) {
  const { yaw, pitch, distance, fov } = CAMERA;
  const cam = [distance * Math.cos(pitch) * Math.sin(yaw), distance * Math.sin(pitch), distance * Math.cos(pitch) * Math.cos(yaw)];
  const len = Math.hypot(...cam);
  const f = cam.map((c) => -c / len); // looking at the origin
  const right = [f[2], 0, -f[0]].map((c, _, r) => c / Math.hypot(...r)); // forward × up
  const up = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
  const v = [u.x * WORLD.x - cam[0], u.y * WORLD.y - cam[1], u.z * WORLD.z - cam[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const depth = dot(v, f);
  const k = MAP_HALF_HEIGHT / (depth * Math.tan(((fov / 2) * Math.PI) / 180));
  return {
    x: -dot(v, right) * k * MAP_STRETCH_X,
    y: dot(v, up) * k, // `right` and `up` both point the opposite way, which suits canvas y-down
    // The prototype's galaxies have a 3.6 × scale world radius; most stars sit in the inner 70%.
    size: (3.6 * (u.scale || 1) * k * 0.7) / 3.4,
    depth,
  };
}

/** Stable pseudo-random bend for a connection, so the curves don't change between visits. */
function bendFor(a, b) {
  let hsh = 0;
  for (const ch of a + b) hsh = (hsh * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(hsh) % 1000) / 1000 - 0.5) * 70;
}

export function mount(el) {
  el.className = 'graph-view mv-view';
  let selected = null;
  let openedByZoom = false;
  const stats = new Map(vault.universes.map((u) => [u.id, universeStats(u.id)]));
  const enter = (id) => (location.hash = `#/u/${id}`);

  const canvas = h('canvas', { 'aria-label': 'Multiverse map' });
  const drawer = h('aside', { class: 'preview mv-drawer', 'aria-label': 'Universe details' });
  el.append(
    h('div', { class: 'graph-canvas' }, canvas),
    h('div', { class: 'hud hud-tl' },
      h('span', { class: 'mv-eyebrow' }, vault.tagline),
      h('h1', {}, 'Explore knowledge across universes'),
      h('p', { class: 'hud-stats' }, `${vault.universes.length} universes · ${vault.all.length} notes`),
      h('div', { class: 'hud-filter-wrap' }, icon('search'), h('input', { class: 'hud-filter', type: 'text', placeholder: 'Highlight universes…', spellcheck: 'false', 'aria-label': 'Highlight universes',
        oninput: (e) => {
          const q = e.target.value.trim().toLowerCase();
          graph.setMatches(q ? new Set(vault.universes.filter((u) => u.name.toLowerCase().includes(q)).map((u) => u.id)) : null);
        },
        onkeydown: (e) => {
          if (e.key === 'Enter' && graph.matches?.size) select([...graph.matches][0]);
          if (e.key === 'Escape') {
            e.target.value = '';
            graph.setMatches(null);
          }
        } }))),
    h('div', { class: 'hud controls' },
      h('button', { class: 'icon-btn', title: 'Zoom in', 'aria-label': 'Zoom in', onclick: () => graph.zoomBy(1.4) }, icon('plus')),
      h('button', { class: 'icon-btn', title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => graph.zoomBy(1 / 1.4) }, icon('minus')),
      h('button', { class: 'icon-btn', title: 'Fit to screen', 'aria-label': 'Fit to screen', onclick: () => {
        select(null);
        graph.fit();
      } }, icon('fit'))),
    h('div', { class: 'hud hint' }, 'Scroll to zoom · drag to pan · drag a universe to move it · click to highlight · double-click to enter'),
    drawer,
  );

  const graph = new ForceGraph(canvas, {
    pulses: true,
    anchored: true,
    maxZoom: 2.4,
    onSelect: (n) => select(n?.id || null),
    onOpen: (n) => enter(n.id),
    onZoom: (k) => {
      if (k >= ZOOM_OPENS_PANEL) {
        const near = graph.nearestToCenter(Math.min(canvas.clientWidth, canvas.clientHeight) * 0.45);
        if (near && near.id !== selected) {
          select(near.id, false);
          openedByZoom = true;
        }
      } else if (k < ZOOM_CLOSES_PANEL && openedByZoom) {
        select(null, false);
      }
    },
  });
  const placed = vault.universes
    .map((u) => ({ u, p: project(u) }))
    .sort((a, b) => b.p.depth - a.p.depth); // far first, so nearer galaxies draw on top
  graph.setData(
    placed.map(({ u, p }) => ({
      id: u.id,
      title: u.name,
      sub: stats.get(u.id).notes ? `${stats.get(u.id).notes} notes` : 'Universe',
      type: 'universe',
      category: '',
      color: u.accent,
      sprite: galaxySprite(u),
      tilt: u.tilt?.[2] || 0,
      spin: (u.speed || 0.4) / 0.4,
      size: p.size,
      x0: p.x,
      y0: p.y,
    })),
    vault.edges.map(([source, target]) => ({ source, target, kind: 'web', bend: bendFor(source, target) })),
  );
  graph.start();

  /** Open (or close) a universe's panel. `glide` moves the camera to it, as a click does. */
  function select(id, glide = true) {
    const u = vault.universes.find((x) => x.id === id) || null;
    selected = u ? u.id : null;
    openedByZoom = false;
    graph.select(selected);
    drawer.classList.toggle('open', Boolean(u));
    graph.setInset(u && window.innerWidth > 900 ? 420 : 0);
    if (!u) return;
    if (glide) graph.focusNode(u.id, 1.5);

    const s = stats.get(u.id);
    drawer.style.setProperty('--c', u.accent);
    fill(drawer,
      h('header', { class: 'mv-drawer-head' },
        h('span', { class: 'mv-drawer-icon' }, icon(u.icon)),
        h('div', {}, h('span', { class: 'mv-eyebrow' }, 'Universe'), h('h2', {}, `${u.name} Universe`)),
        h('span', { class: 'spacer' }),
        h('button', { class: 'icon-btn', type: 'button', title: 'Close', 'aria-label': 'Close', onclick: () => select(null) }, icon('x'))),
      h('div', { class: 'mv-drawer-body' },
        u.description && h('p', { class: 'mv-desc' }, u.description),
        h('div', { class: 'mv-stats' },
          h('div', {}, h('strong', {}, s.notes), h('span', {}, 'Notes')),
          h('div', {}, h('strong', {}, s.categories.length), h('span', {}, 'Categories')),
          h('div', {}, h('strong', {}, s.topics), h('span', {}, 'Topics'))),
        s.notes
          ? [h('h3', {}, 'Categories'),
             h('div', { class: 'mv-list' }, s.categories.map((c) => h('a', { class: 'mv-row', href: `#/note/${c.id}` }, h('span', { class: 'dot', style: { background: u.accent } }), h('span', {}, c.title), icon('chevron'))))]
          : h('div', { class: 'mv-empty' }, icon('sparkles'), h('p', {}, 'This universe has no notes yet. Enter it and start the first one in the AI Knowledge Architect.'))),
      h('footer', { class: 'mv-drawer-foot' },
        h('button', { class: 'btn primary mv-enter', type: 'button', onclick: () => enter(u.id) }, `Enter ${u.name} Universe`, icon('arrowRight'))),
    );
    $('.mv-drawer-body', drawer).scrollTop = 0;
  }

  const onKey = (e) => {
    if (document.querySelector('.backdrop') || !selected) return;
    if (e.key === 'Escape') select(null);
    else if (e.key === 'Enter' && document.activeElement === document.body) enter(selected);
  };
  document.addEventListener('keydown', onKey);

  return () => {
    document.removeEventListener('keydown', onKey);
    graph.destroy();
  };
}
