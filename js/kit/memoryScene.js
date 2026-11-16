// Memory scene: a small 3D world that shows what Python's memory looks like at one step.
// Left platform: NAMES (one row of name tags per frame — global, then each function call).
// Right platform: OBJECTS (every value in memory, coloured by type).
// Glowing arrows show which object each name refers to. Calling show(step) animates from
// whatever is on screen now to the new step: objects pop in, tags slide, unused objects fade away.
//
// Reused by every lesson that runs code (Live Lab, watch scenes, predict reveals).

import * as THREE from '../../vendor/three.js';

export const KIND_COLORS = {
  int: '#5eead4',
  float: '#38bdf8',
  str: '#fbbf24',
  bool: '#a78bfa',
  none: '#8b93a7',
  list: '#f472b6',
  tuple: '#fb923c',
  dict: '#4ade80',
  set: '#f87171',
  function: '#7c9cff',
  object: '#e879f9',
};
export const KIND_LABEL = { int: 'int', float: 'float', str: 'str', bool: 'bool', none: 'None', list: 'list', tuple: 'tuple', dict: 'dict', set: 'set', function: 'function', object: 'object' };

const KIND_HELP = {
  int: 'a whole number', float: 'a number with a decimal point', str: 'text', bool: 'True or False', none: 'means "no value"',
  list: 'an ordered group of values you can change', tuple: 'an ordered group of values you cannot change', dict: 'pairs of key and value',
  set: 'a group of unique values', function: 'a reusable block of code', object: 'a value',
};
const CONTAINERS = new Set(['list', 'tuple', 'dict', 'set']);
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---------- Text textures ----------

function textCanvas(lines, { w = 256, h = 128, bg = null, fg = '#0b0e17', font = 'JetBrains Mono', sizes = [44, 22], weights = [600, 500], colors = [] } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const total = lines.reduce((s, _, i) => s + (sizes[i] || sizes.at(-1)) * 1.15, 0);
  let y = h / 2 - total / 2;
  lines.forEach((line, i) => {
    const size = sizes[i] || sizes.at(-1);
    let px = size;
    g.font = `${weights[i] || 500} ${px}px "${font}", ui-monospace, monospace`;
    while (g.measureText(line).width > w - 20 && px > 10) g.font = `${weights[i] || 500} ${(px -= 2)}px "${font}", ui-monospace, monospace`;
    g.fillStyle = colors[i] || fg;
    y += (size * 1.15) / 2;
    g.fillText(line, w / 2, y);
    y += (size * 1.15) / 2;
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function roundedBox(w, h, d, r = 0.08) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2); // extrude upward (+y), shape lies in x/z
  geo.translate(0, 0, 0);
  return geo;
}

/** A top label plane that sits just above a block. */
function topLabel(tex, w, d, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}

function floorText(text, size, color = '#6c7491') {
  const tex = textCanvas([text], { w: 512, h: 96, fg: color, sizes: [size], weights: [700], font: 'Inter' });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ---------- Animated actors ----------

class Actor {
  constructor(group) {
    this.group = group;
    this.target = new THREE.Vector3();
    this.scale = 0;
    this.targetScale = 1;
    this.alive = true;
    this.pulse = 0;
  }
}

export class MemoryScene {
  constructor(container, { interactive = true } = {}) {
    this.el = container;
    this.names = new Map(); // key frameIndex:name → Actor
    this.objects = new Map(); // objId → Actor
    this.arrows = [];
    this.slots = new Map(); // objId → slot index (stable placement within one run)
    this.frameLabels = [];
    this.disposed = false;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.view = { yaw: 0.42, pitch: 0.8, zoom: 1 };
    this.zoomTarget = 1;

    this.scene.add(new THREE.HemisphereLight('#cfd8ff', '#0b0e17', 1.4));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(-6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#7c9cff', 0.9);
    rim.position.set(8, 4, -6);
    this.scene.add(rim);

    this.buildWorld();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.tipEl = document.createElement('div');
    this.tipEl.className = 'kv-tip';
    container.append(this.tipEl);
    this.raycaster = new THREE.Raycaster();
    this.namesPlat.userData.tip = 'Names: the words your code uses to find its values.';
    this.objPlat.userData.tip = 'Memory: where Python keeps every value.';
    if (interactive) this.bindControls();
    this.timer = new THREE.Timer();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  buildWorld() {
    // Platforms are unit-sized and scaled to fit whatever is on them (see fitToContent).
    const plat = (color) => {
      const m = new THREE.Mesh(roundedBox(1, 0.18, 1, 0.06), new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }));
      m.receiveShadow = true;
      m.position.y = -0.18;
      m.userData.target = { x: 0, z: 0, w: 3, d: 3 };
      return m;
    };
    this.namesPlat = plat('#151b2c');
    this.objPlat = plat('#121827');
    this.scene.add(this.namesPlat, this.objPlat);
    this.focus = { x: 0, z: 0, span: 7, tx: 0, tz: 0, tspan: 7 };

    const grid = new THREE.GridHelper(30, 60, '#1c2236', '#121624');
    grid.position.y = -0.2;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    this.scene.add(grid);

    this.namesLabel = floorText('NAMES', 54);
    this.objLabel = floorText('OBJECTS IN MEMORY', 54);
    this.scene.add(this.namesLabel, this.objLabel);
    this.fitToContent();
    this.snapWorld();
  }

  bindControls() {
    const el = this.renderer.domElement;
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, yaw: this.view.yaw, pitch: this.view.pitch };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointerleave', () => this.tipEl.classList.remove('show'));
    el.addEventListener('pointermove', (e) => {
      if (!drag) return this.hover(e);
      this.tipEl.classList.remove('show');
      this.view.yaw = drag.yaw - (e.clientX - drag.x) * 0.006;
      this.view.pitch = Math.min(1.25, Math.max(0.25, drag.pitch + (e.clientY - drag.y) * 0.004));
    });
    const end = () => (drag = null);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomTarget = Math.min(2.2, Math.max(0.55, this.zoomTarget * (e.deltaY > 0 ? 0.9 : 1.1)));
    }, { passive: false });
  }

  /** Show a small label for whatever is under the mouse. */
  hover(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = [...[...this.names.values(), ...this.objects.values()].filter((a) => a.alive).map((a) => a.group), this.namesPlat, this.objPlat];
    let o = this.raycaster.intersectObjects(targets, true)[0]?.object;
    while (o && !o.userData.tip) o = o.parent;
    if (!o) return this.tipEl.classList.remove('show');
    this.tipEl.textContent = o.userData.tip;
    this.tipEl.style.left = `${Math.min(r.width - 230, Math.max(8, e.clientX - r.left + 14))}px`;
    this.tipEl.style.top = `${e.clientY - r.top + 16}px`;
    this.tipEl.classList.add('show');
  }

  resetView() {
    this.view.yaw = 0.42;
    this.view.pitch = 0.8;
    this.zoomTarget = 1;
  }

  zoomBy(f) {
    this.zoomTarget = Math.min(2.2, Math.max(0.55, this.zoomTarget * f));
  }

  resize() {
    const w = this.el.clientWidth || 600;
    const h = this.el.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    this.updateCamera();
  }

  updateCamera() {
    const span = this.focus.span / this.view.zoom;
    const a = this.aspect || 1.5;
    const halfH = a > 1.6 ? span / 2 : span / 2 * (1.6 / a);
    Object.assign(this.camera, { left: -halfH * a, right: halfH * a, top: halfH, bottom: -halfH });
    this.camera.updateProjectionMatrix();
    const r = 20;
    const { yaw, pitch } = this.view;
    const { x, z } = this.focus;
    this.camera.position.set(x + Math.sin(yaw) * Math.cos(pitch) * r, Math.sin(pitch) * r, z + Math.cos(yaw) * Math.cos(pitch) * r);
    this.camera.lookAt(x, 0, z);
  }

  // ---------- Building actors ----------

  makeTag(name, frameName) {
    const g = new THREE.Group();
    const w = 1.7;
    const body = new THREE.Mesh(roundedBox(w, 0.16, 0.62, 0.12), new THREE.MeshStandardMaterial({ color: frameName === 'global' ? '#e7eaf3' : '#c7d2fe', roughness: 0.5 }));
    body.castShadow = true;
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 16), new THREE.MeshStandardMaterial({ color: '#0b0e17' }));
    hole.position.set(-w / 2 + 0.18, 0.1, 0);
    const label = topLabel(textCanvas([name], { w: 320, h: 112, sizes: [56], weights: [600] }), w - 0.4, 0.56, 0.2);
    label.position.x = 0.12;
    g.add(body, hole, label);
    g.userData = { width: w };
    return g;
  }

  makeObject(obj, heap) {
    const g = new THREE.Group();
    const color = new THREE.Color(KIND_COLORS[obj.kind] || KIND_COLORS.object);
    if (CONTAINERS.has(obj.kind)) {
      const items = obj.items || [];
      const n = Math.max(1, Math.min(items.length, 8));
      const cell = 0.78;
      const w = n * cell + 0.3;
      const tray = new THREE.Mesh(roundedBox(w, 0.22, 1.0, 0.12), new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1 }));
      tray.castShadow = true;
      g.add(tray);
      items.slice(0, 8).forEach((it, i) => {
        const id = Array.isArray(it) ? it[1] : it;
        const child = heap[id];
        const chip = new THREE.Mesh(roundedBox(cell - 0.12, 0.16, 0.66, 0.08), new THREE.MeshStandardMaterial({ color: KIND_COLORS[child?.kind] || '#8b93a7', roughness: 0.4 }));
        chip.position.set(-w / 2 + 0.15 + cell * i + cell / 2, 0.24, 0.05);
        chip.castShadow = true;
        const keyText = Array.isArray(it) ? `${heap[it[0]]?.repr ?? '?'}:` : `[${i}]`;
        chip.add(topLabel(textCanvas([child?.repr ?? '?', keyText], { w: 160, h: 128, sizes: [44, 22] }), cell - 0.18, 0.6, 0.215));
        g.add(chip);
      });
      if (!items.length) g.add(topLabel(textCanvas(['empty'], { w: 200, h: 100, sizes: [30] }), 0.7, 0.4, 0.26));
      const tag = topLabel(textCanvas([KIND_LABEL[obj.kind]], { w: 200, h: 64, sizes: [34], weights: [700], fg: '#a4acc4' }), 0.9, 0.28, 0.07);
      tag.position.set(-w / 2 + 0.5, 0.07, 0.72);
      g.add(tag);
      g.userData = { width: w, depth: 1.0, height: 0.5 };
    } else {
      const text = obj.repr;
      const w = Math.min(2.6, Math.max(1.25, 0.55 + text.length * 0.17));
      const isStr = obj.kind === 'str';
      const body = new THREE.Mesh(
        isStr ? roundedBox(w, 0.5, 0.9, 0.35) : obj.kind === 'function' ? roundedBox(w, 0.42, 0.9, 0.06) : roundedBox(w, 0.5, 0.9, 0.12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.08, emissive: color, emissiveIntensity: 0.08 }),
      );
      body.castShadow = true;
      g.add(body);
      const aspect = (w - 0.14) / 0.82;
      g.add(topLabel(textCanvas([text, KIND_LABEL[obj.kind]], { w: Math.round(150 * aspect), h: 150, sizes: [70, 26], colors: ['#0b0e17', 'rgba(11,14,23,.6)'] }), w - 0.14, 0.82, 0.56));
      g.userData = { width: w, depth: 0.9, height: 0.5 };
    }
    return g;
  }

  // ---------- Showing a step ----------

  /** Animate to a tracer step. `opts.instant` skips the animation. */
  show(step, opts = {}) {
    if (!step) return;
    const instant = opts.instant || reduceMotion();
    const heap = step.heap || {};
    const frames = step.frames || [];
    this.lastKinds = new Map(Object.entries(heap).map(([id, o]) => [id, o.kind]));

    // Objects referenced directly by a name, plus containers' children that are themselves referenced
    // or are containers (shown as their own blocks with an arrow from the slot).
    const direct = new Set();
    for (const f of frames) for (const [, id] of f.vars) direct.add(id);
    const visible = new Set(direct);
    const childLinks = [];
    for (const id of direct) {
      const o = heap[id];
      if (!o || !CONTAINERS.has(o.kind)) continue;
      (o.items || []).slice(0, 8).forEach((it, i) => {
        const cid = Array.isArray(it) ? it[1] : it;
        if (direct.has(cid) || CONTAINERS.has(heap[cid]?.kind)) {
          visible.add(cid);
          childLinks.push({ from: id, slot: i, to: cid });
        }
      });
    }

    // --- Objects (rebuild a block when its value changed, e.g. a list was appended to) ---
    const order = [...visible];
    for (const id of order) if (!this.slots.has(id)) this.slots.set(id, this.nextSlot());
    for (const [id, actor] of this.objects) {
      if (!visible.has(id)) {
        actor.alive = false;
        actor.targetScale = 0;
        this.slots.delete(id);
      }
    }
    for (const id of order) {
      const obj = heap[id];
      const sig = JSON.stringify([obj.kind, obj.repr, (obj.items || []).map((x) => (Array.isArray(x) ? x.map((k) => heap[k]?.repr) : heap[x]?.repr))]);
      let actor = this.objects.get(id);
      if (actor && actor.sig !== sig) {
        const old = actor.group;
        actor.group = this.makeObject(obj, heap);
        actor.group.position.copy(old.position);
        actor.group.scale.copy(old.scale);
        this.scene.remove(old);
        this.disposeGroup(old);
        this.scene.add(actor.group);
        actor.pulse = 1;
      }
      if (!actor) {
        actor = new Actor(this.makeObject(obj, heap));
        this.scene.add(actor.group);
        this.objects.set(id, actor);
        actor.pulse = 1;
      }
      const pointing = frames.flatMap((f) => f.vars).filter(([, x]) => x === id).map(([n]) => n);
      actor.group.userData.tip = obj.kind === 'none' ? 'None means "no value".' + (pointing.length ? ` Named: ${pointing.join(', ')}.` : '') : `${obj.repr} is ${/^[aeio]/.test(KIND_LABEL[obj.kind]) ? 'an' : 'a'} ${KIND_LABEL[obj.kind]}: ${KIND_HELP[obj.kind]}.` + (pointing.length ? ` Named: ${pointing.join(', ')}.` : '');
      actor.sig = sig;
      actor.alive = true;
      actor.targetScale = 1;
      actor.target.copy(this.slotPosition(this.slots.get(id)));
      if (actor.scale === 0) {
        actor.group.position.copy(actor.target).add(new THREE.Vector3(0, 1.4, 0));
      }
    }

    // --- Name tags, one row per frame ---
    const seen = new Set();
    for (const l of this.frameLabels) {
      this.scene.remove(l);
      this.disposeGroup(l);
    }
    this.frameLabels = [];
    let row = 0;
    frames.forEach((f, fi) => {
      if (fi > 0 || frames.length > 1) {
        const lbl = floorText(f.name === 'global' ? 'global' : `${f.name}()  call`, 40, fi === 0 ? '#6c7491' : '#a5b4fc');
        lbl.scale.setScalar(0.62);
        lbl.position.set(-3.55, 0.06, -2.45 + row * 0.82 - 0.1);
        this.scene.add(lbl);
        this.frameLabels.push(lbl);
        row += 0.6;
      }
      for (const [name, id] of f.vars) {
        const key = `${fi}:${f.name}:${name}`;
        seen.add(key);
        let actor = this.names.get(key);
        if (!actor) {
          actor = new Actor(this.makeTag(name, f.name));
          this.scene.add(actor.group);
          this.names.set(key, actor);
          actor.pulse = 1;
        } else if (actor.ref !== id) {
          actor.pulse = 1;
        }
        actor.ref = id;
        actor.group.userData.tip = `The name ${name}. It points to ${heap[id]?.repr ?? '?'}.`;
        actor.alive = true;
        actor.targetScale = 1;
        actor.target.set(-3.55, 0, -2.45 + row * 0.82);
        if (actor.scale === 0) actor.group.position.copy(actor.target).add(new THREE.Vector3(-1.2, 0.6, 0));
        row++;
      }
      row += 0.25;
    });
    for (const [key, actor] of this.names) {
      if (!seen.has(key)) {
        actor.alive = false;
        actor.targetScale = 0;
      }
    }

    this.links = [
      ...[...this.names].filter(([k]) => seen.has(k)).map(([, a]) => ({ fromActor: a, to: a.ref, kind: 'name' })),
      ...childLinks.map((c) => ({ fromObj: c.from, slot: c.slot, to: c.to, kind: 'child' })),
    ];
    this.rebuildArrows();
    this.fitToContent();
    if (instant) {
      this.snap();
      this.snapWorld();
    }
  }

  /** Size the two platforms to what's on them, and aim the camera at everything. */
  fitToContent() {
    const box = (actors, fallback) => {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const a of actors) {
        if (!a.alive) continue;
        const w = (a.group.userData.width || 1.6) / 2;
        const d = (a.group.userData.depth || 0.62) / 2;
        minX = Math.min(minX, a.target.x - w);
        maxX = Math.max(maxX, a.target.x + w);
        minZ = Math.min(minZ, a.target.z - d);
        maxZ = Math.max(maxZ, a.target.z + d);
      }
      if (minX === Infinity) return fallback;
      return { minX, maxX, minZ, maxZ };
    };
    const nb = box(this.names.values(), { minX: -4.4, maxX: -2.7, minZ: -2.7, maxZ: -1.6 });
    const ob = box(this.objects.values(), { minX: -0.2, maxX: 1.7, minZ: -2.8, maxZ: -1.9 });
    const pad = 0.55;
    const setPlat = (m, b, minW, minD) => {
      const w = Math.max(minW, b.maxX - b.minX + pad * 2);
      const d = Math.max(minD, b.maxZ - b.minZ + pad * 2 + 0.5);
      m.userData.target = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 - 0.25, w, d };
    };
    const minD = Math.max(nb.maxZ - nb.minZ, ob.maxZ - ob.minZ) + pad * 2 + 0.5;
    setPlat(this.namesPlat, nb, 2.9, minD);
    setPlat(this.objPlat, ob, 3.2, minD);
    // Line both platforms up at the back so the labels sit on one row.
    const back = Math.min(nb.minZ, ob.minZ) - pad - 0.5;
    for (const m of [this.namesPlat, this.objPlat]) m.userData.target.z = back + m.userData.target.d / 2;
    this.labelZ = back + 0.32;
    const minX = this.namesPlat.userData.target.x - this.namesPlat.userData.target.w / 2;
    const maxX = this.objPlat.userData.target.x + this.objPlat.userData.target.w / 2;
    const maxZ = back + minD;
    this.focus.tx = (minX + maxX) / 2;
    this.focus.tz = (back + maxZ) / 2;
    this.focus.tspan = Math.min(15, Math.max(4.6, (maxX - minX) * 0.42 + (maxZ - back) * 0.5 + 0.4));
  }

  snapWorld() {
    Object.assign(this.focus, { x: this.focus.tx, z: this.focus.tz, span: this.focus.tspan });
    this.animateWorld(1);
  }

  animateWorld(k) {
    this.focus.x += (this.focus.tx - this.focus.x) * k;
    this.focus.z += (this.focus.tz - this.focus.z) * k;
    this.focus.span += (this.focus.tspan - this.focus.span) * k;
    for (const m of [this.namesPlat, this.objPlat]) {
      const t = m.userData.target;
      m.position.x += (t.x - m.position.x) * k;
      m.position.z += (t.z - m.position.z) * k;
      m.scale.x += (t.w - m.scale.x) * k;
      m.scale.z += (t.d - m.scale.z) * k;
    }
    this.namesLabel.position.set(this.namesPlat.position.x, 0.06, this.labelZ ?? -3);
    this.objLabel.position.set(this.objPlat.position.x, 0.06, this.labelZ ?? -3);
  }

  nextSlot() {
    const used = new Set(this.slots.values());
    let i = 0;
    while (used.has(i)) i++;
    return i;
  }

  slotPosition(i) {
    // One tidy column (so arrows run side by side), wrapping to a new column every 5 objects.
    const col = Math.floor(i / 5);
    const r = i % 5;
    return new THREE.Vector3(0.9 + col * 3.1, 0, -2.4 + r * 1.3);
  }

  /** Remove everything (used when a brand-new program runs). */
  clear() {
    for (const a of [...this.names.values(), ...this.objects.values()]) {
      this.scene.remove(a.group);
      this.disposeGroup(a.group);
    }
    this.names.clear();
    this.objects.clear();
    this.slots.clear();
    this.links = [];
    this.rebuildArrows();
    this.fitToContent();
  }

  snap() {
    for (const a of [...this.names.values(), ...this.objects.values()]) {
      a.scale = a.targetScale;
      a.group.position.copy(a.target);
      a.group.scale.setScalar(Math.max(0.0001, a.scale));
    }
  }

  // ---------- Arrows ----------

  rebuildArrows() {
    for (const a of this.arrows) {
      this.scene.remove(a.mesh, a.head);
      a.mesh.geometry.dispose();
    }
    this.arrows = (this.links || []).map((link) => {
      const color = new THREE.Color(KIND_COLORS[this.kindOf(link.to)] || '#7c9cff');
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3 });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 14), mat);
      this.scene.add(mesh, head);
      return { link, mesh, head };
    });
  }

  kindOf(id) {
    return this.lastKinds?.get(id) || 'object';
  }

  updateArrows() {
    for (const a of this.arrows) {
      const { link } = a;
      const target = this.objects.get(link.to);
      let start;
      if (link.kind === 'name') {
        const g = link.fromActor.group;
        start = g.position.clone().add(new THREE.Vector3(g.userData.width / 2 * g.scale.x, 0.12, 0));
      } else {
        const src = this.objects.get(link.fromObj);
        if (!src) continue;
        const w = src.group.userData.width;
        start = src.group.position.clone().add(new THREE.Vector3(-w / 2 + 0.15 + 0.78 * link.slot + 0.39, 0.4, 0.3));
      }
      if (!target) continue;
      const tg = target.group;
      const end = tg.position.clone().add(new THREE.Vector3(-(tg.userData.width / 2) * tg.scale.x - 0.12, 0.25, 0));
      if (link.kind === 'child') end.set(tg.position.x, 0.6, tg.position.z - 0.5 * tg.scale.z);
      const mid = start.clone().lerp(end, 0.5);
      mid.y += 0.9 + start.distanceTo(end) * 0.12;
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      a.mesh.geometry.dispose();
      a.mesh.geometry = new THREE.TubeGeometry(curve, 28, 0.035, 8, false);
      const vis = Math.min(link.kind === 'name' ? link.fromActor.scale : 1, target.scale);
      a.mesh.visible = a.head.visible = vis > 0.3;
      a.head.position.copy(end);
      const dir = curve.getTangent(1).normalize();
      a.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    }
  }

  // ---------- Frame loop ----------

  loop() {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    const k = 1 - Math.exp(-dt * 9);
    this.view.zoom += (this.zoomTarget - this.view.zoom) * k;
    this.animateWorld(k * 0.7);
    this.updateCamera();
    const t = this.timer.getElapsed();

    const step = (map) => {
      for (const [key, a] of map) {
        a.scale += (a.targetScale - a.scale) * k;
        a.group.position.lerp(a.target, k);
        a.pulse = Math.max(0, a.pulse - dt * 1.6);
        const bounce = a.pulse > 0 ? Math.sin(a.pulse * Math.PI) * 0.22 : 0;
        a.group.scale.setScalar(Math.max(0.0001, a.scale * (1 + bounce * 0.4)));
        a.group.position.y = a.target.y + bounce * 0.9 + (a.alive ? 0 : (1 - a.scale) * -0.4);
        if (!a.alive && a.scale < 0.02) {
          this.scene.remove(a.group);
          this.disposeGroup(a.group);
          map.delete(key);
        }
      }
    };
    step(this.names);
    step(this.objects);
    this.updateArrows();
    for (const a of this.arrows) a.mesh.material.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.25;
    this.renderer.render(this.scene, this.camera);
  }

  disposeGroup(g) {
    g.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.tipEl.remove();
  }
}
