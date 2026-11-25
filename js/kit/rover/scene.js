// The Mars scene for Mission Control: a lit, procedurally generated landscape with a detailed
// rover, rocks, a rock sample and a goal flag. Everything is generated in code (no image files),
// so the scene costs only the shared three.js bundle to load.
//
// Rendering follows docs/ENGINEERING.md: it is driven by the shared frame loop, draws at full
// rate only while something moves, drops to a low rate for ambient motion (dust, flag, crystals),
// and stops completely when off screen or when the tab is hidden.

import * as THREE from '../../../vendor/three.js';
import { frameLoop, ACTIVE, AMBIENT, IDLE } from '../../engine/loop.js';
import { easeFactor } from '../../engine/camera.js';
import { createNoise, rng, smoothstep } from './noise.js';

const TILE = 1.2; // world units per grid tile
const SUN = new THREE.Vector3(-0.55, 0.42, -0.72).normalize(); // low afternoon sun: long shadows
const COLORS = {
  horizon: new THREE.Color('#d8a46f'),
  zenith: new THREE.Color('#8a5a40'),
  halo: new THREE.Color('#e9dccb'),
  ground: new THREE.Color('#6a321d'),
  fog: new THREE.Color('#c99a6e'), // dusty haze, close to the sky at the horizon
};
const noise = createNoise(7);

// ---------------------------------------------------------------- textures

/** A seamless normal map built from a height function h(u, v) on [0, 1)². */
function normalTexture(size, height, strength) {
  const hts = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hts[y * size + x] = height(x / size, y / size);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => hts[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** A seamless greyscale texture (for albedo variation), values from f(u, v) in [0, 1]. */
function greyTexture(size, f) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.round(f(x / size, y / size) * 255);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function glowTexture(inner = 'rgba(255,255,255,1)') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

// ---------------------------------------------------------------- terrain

/** Terrain height at world (x, z). The mission grid stays nearly flat so the rover can drive. */
function makeHeight(n) {
  const half = (n * TILE) / 2 + TILE * 0.7;
  const craters = [
    [-14, -9, 4.5], [17, -6, 3.2], [-9, 15, 5.5], [24, 18, 7], [-26, -22, 9], [8, -24, 4], [30, -30, 6],
  ];
  return (x, z) => {
    const dx = Math.max(Math.abs(x) - half, 0);
    const dz = Math.max(Math.abs(z) - half, 0);
    const out = smoothstep(0, 7, Math.hypot(dx, dz));
    const micro = noise.fbm2(x * 0.55, z * 0.55, 3) * 0.035;
    let h = micro;
    if (out > 0) {
      let land = noise.fbm2(x * 0.045, z * 0.045, 5) * 2.2 + noise.fbm2(x * 0.18, z * 0.18, 3) * 0.35;
      for (const [cx, cz, r] of craters) {
        const d = Math.hypot(x - cx, z - cz) / r;
        if (d < 1.6) land += d < 1 ? (d * d - 1) * r * 0.22 : Math.exp(-((d - 1) * (d - 1)) * 9) * r * 0.12;
      }
      h += out * land;
    }
    const far = smoothstep(35, 95, Math.hypot(x, z));
    if (far > 0) h += far * (noise.ridged2(x * 0.012 + 3, z * 0.012 - 7, 5) * 15 - 2);
    return h;
  };
}

function buildTerrain(heightAt) {
  const size = 240;
  const segs = 256;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  // Mars is butterscotch dust over darker, greyer basalt, not one saturated orange.
  const dust = new THREE.Color('#c39066');
  const rust = new THREE.Color('#94573a');
  const basalt = new THREE.Color('#3f2e27');
  const pale = new THREE.Color('#d8b48e');
  const darkSand = new THREE.Color('#6b4331');
  const colors = new Float32Array(pos.count * 3);
  const nrm = geo.attributes.normal;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const slope = 1 - nrm.getY(i);
    const n1 = noise.fbm2(x * 0.08, z * 0.08, 4) * 0.5 + 0.5;
    const n2 = noise.fbm2(x * 0.6 + 40, z * 0.6, 3) * 0.5 + 0.5;
    c.copy(rust).lerp(dust, smoothstep(0.25, 0.75, n1));
    c.lerp(pale, smoothstep(0.62, 0.9, n2) * 0.35);
    const n3 = noise.fbm2(x * 0.03 + 17, z * 0.03 - 5, 3) * 0.5 + 0.5;
    c.lerp(darkSand, smoothstep(0.52, 0.78, n3) * 0.55); // wind-sorted dark sand
    c.lerp(basalt, smoothstep(0.08, 0.32, slope) * 0.85);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Sand ripples and grains, seamless so they can repeat across the whole landscape.
  const normalMap = normalTexture(512, (u, v) => {
    const warp = noise.tileFbm(u * 4, v * 4, 4, 3) * 3.4;
    const fadeRipple = 0.35 + noise.tileFbm(u * 3 + 9, v * 3, 3, 2) * 0.9;
    const ripple = Math.sin((u * 12 + v * 5 + warp) * Math.PI * 2) * 0.22 * fadeRipple;
    return ripple + noise.tileFbm(u * 32, v * 32, 32, 3) * 1.1;
  }, 1.9);
  const albedo = greyTexture(256, (u, v) => 0.78 + noise.tileFbm(u * 8, v * 8, 8, 4) * 0.36);
  // A coarser layer seen from the game camera: pebbles and hairline cracks in the crust.
  const pebbles = normalTexture(512, (u, v) => {
    const crack = 1 - Math.abs(noise.tileFbm(u * 5, v * 5, 5, 3));
    return Math.pow(crack, 6) * -0.9 + noise.tileFbm(u * 18, v * 18, 18, 2) * 0.55;
  }, 2.4);
  // The same cracks as a colour layer: dark lines and grit where the light does not reach.
  const crackAlbedo = greyTexture(512, (u, v) => {
    const crack = 1 - Math.abs(noise.tileFbm(u * 5, v * 5, 5, 3));
    return Math.min(1, 1 - Math.pow(crack, 6) * 0.55 + noise.tileFbm(u * 18, v * 18, 18, 2) * 0.12);
  });
  crackAlbedo.colorSpace = THREE.NoColorSpace;
  normalMap.repeat.set(46, 46);
  albedo.repeat.set(24, 24);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: albedo,
    normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.97,
    metalness: 0,
  });
  // Two extra texture reads in the ground shader: the pebble layer (at a quarter of the fine
  // ripples' scale) and the albedo again at a tenth, so broad light and dark patches break the
  // repetition. Cheap, and it is what makes the ground read as real at a distance.
  mat.userData.textures = [pebbles, crackAlbedo]; // released with the material (_disposeObject)
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.pebbleMap = { value: pebbles };
    shader.uniforms.crackMap = { value: crackAlbedo };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normalmap_pars_fragment>', '#include <normalmap_pars_fragment>\nuniform sampler2D pebbleMap;\nuniform sampler2D crackMap;')
      .replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale;\n\tvec3 pebN = texture2D( pebbleMap, vNormalMapUv * 0.26 ).xyz * 2.0 - 1.0;\n\tmapN.xy += pebN.xy * 0.95;')
      .replace('vec4 sampledDiffuseColor = texture2D( map, vMapUv );', 'vec4 sampledDiffuseColor = texture2D( map, vMapUv );\n\tsampledDiffuseColor.rgb *= mix( 0.8, 1.14, texture2D( map, vMapUv * 0.09 ).r );\n\tsampledDiffuseColor.rgb *= texture2D( crackMap, vMapUv * 0.5 ).r;');
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- sky

function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: SUN },
      horizon: { value: COLORS.horizon },
      zenith: { value: COLORS.zenith },
      halo: { value: COLORS.halo },
      ground: { value: COLORS.ground },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, horizon, zenith, halo, ground;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, 0.0, 1.0);
        vec3 sky = mix(horizon, zenith, pow(up, 0.55));
        float s = max(dot(d, sunDir), 0.0);
        // Dust scatters blue light forward: a pale, slightly blue halo hugs the sun.
        sky = mix(sky, halo, pow(s, 18.0) * 0.85);
        sky += vec3(0.30, 0.34, 0.40) * pow(s, 260.0) * 2.0;
        sky += vec3(1.0, 0.95, 0.88) * smoothstep(0.9993, 0.9997, s) * 6.0;
        vec3 col = d.y < 0.0 ? mix(horizon, ground, clamp(-d.y * 4.0, 0.0, 1.0)) : sky;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

// ---------------------------------------------------------------- props

/** Smooth shading for a non-indexed geometry: vertices at the same position share one normal. */
function smoothNormals(geo) {
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const sums = new Map();
  const key = (i) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const v = sums.get(k) || [0, 0, 0];
    v[0] += nrm.getX(i); v[1] += nrm.getY(i); v[2] += nrm.getZ(i);
    sums.set(k, v);
  }
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = sums.get(key(i));
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(i, x / l, y / l, z / l);
  }
  nrm.needsUpdate = true;
}

function rockGeometry(seed, detail = 3) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const r = rng(seed);
  const ox = r() * 100;
  const oz = r() * 100;
  const squash = 0.55 + r() * 0.25;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const big = noise.fbm3(v.x * 1.3 + ox, v.y * 1.3, v.z * 1.3 + oz, 3);
    const small = noise.fbm3(v.x * 5 + ox, v.y * 5, v.z * 5 + oz, 2);
    v.multiplyScalar(0.72 + big * 0.55 + small * 0.12);
    v.y *= squash;
    if (v.y < -0.15) v.y = -0.15 + (v.y + 0.15) * 0.3; // flat-ish base so it sits in the sand
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // Real rocks break along planes: shave the shape with a few random cuts for crisp facets.
  const cuts = Array.from({ length: 5 }, () => {
    const n = new THREE.Vector3(r() - 0.5, (r() - 0.2) * 0.9, r() - 0.5).normalize();
    return { n, d: 0.55 + r() * 0.3 };
  });
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    for (const { n, d } of cuts) {
      const over = v.dot(n) - d;
      if (over > 0) v.addScaledVector(n, -over);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  smoothNormals(geo);
  // Dust settles on upward-facing surfaces.
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const dark = new THREE.Color('#3b2a24');
  const dusty = new THREE.Color('#a8673f');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(dark).lerp(dusty, smoothstep(0.35, 0.95, nrm.getY(i)) * 0.85);
    c.multiplyScalar(0.55 + 0.45 * smoothstep(-0.15, 0.3, pos.getY(i))); // darker where it meets the ground
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function roundedSlab(w, l, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -l / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + l - r);
  s.quadraticCurveTo(x + w, y + l, x + w - r, y + l);
  s.lineTo(x + r, y + l);
  s.quadraticCurveTo(x, y + l, x, y + l - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -h / 2, 0);
  return geo;
}

/** A six-wheeled rover in the style of NASA's Mars rovers. Faces -Z. */
function buildRover(tex) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // bobs and tilts on the suspension
  root.add(body);
  const white = new THREE.MeshStandardMaterial({ color: '#e4ddd1', roughness: 0.5, metalness: 0.12 });
  const grey = new THREE.MeshStandardMaterial({ color: '#7a7d84', roughness: 0.38, metalness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: '#23262c', roughness: 0.55, metalness: 0.4 });
  const gold = new THREE.MeshStandardMaterial({ color: '#d6a64a', roughness: 0.28, metalness: 1, normalMap: tex.foil, normalScale: new THREE.Vector2(0.6, 0.6) });
  const glass = new THREE.MeshStandardMaterial({ color: '#0c1118', roughness: 0.08, metalness: 0.9 });
  const led = new THREE.MeshStandardMaterial({ color: '#ff7a3d', emissive: '#ff7a3d', emissiveIntensity: 2.2 });
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // Chassis, gold-foil deck and equipment
  add(body, roundedSlab(0.56, 0.74, 0.16, 0.06), white, 0, 0.36, 0);
  add(body, new THREE.BoxGeometry(0.5, 0.025, 0.6), gold, 0, 0.455, 0.02);
  add(body, new THREE.BoxGeometry(0.2, 0.08, 0.16), white, 0.12, 0.5, 0.12);
  add(body, new THREE.BoxGeometry(0.14, 0.05, 0.12), dark, -0.13, 0.49, 0.18);
  // Power unit (RTG) angled off the back, with cooling fins
  const rtg = new THREE.Group();
  rtg.position.set(0, 0.45, 0.43);
  rtg.rotation.x = -0.75;
  body.add(rtg);
  add(rtg, new THREE.CylinderGeometry(0.065, 0.065, 0.3, 20), dark);
  for (let i = 0; i < 6; i++) {
    const fin = add(rtg, new THREE.BoxGeometry(0.2, 0.26, 0.012), grey);
    fin.rotation.y = (i / 6) * Math.PI;
  }
  // Mast with camera head
  add(body, new THREE.CylinderGeometry(0.022, 0.026, 0.5, 14), white, 0.17, 0.7, -0.24);
  const head = new THREE.Group();
  head.position.set(0.17, 0.97, -0.24);
  body.add(head);
  add(head, roundedSlab(0.2, 0.09, 0.08, 0.02), white);
  for (const sx of [-0.045, 0.045]) {
    const lens = add(head, new THREE.CylinderGeometry(0.02, 0.022, 0.03, 18), glass, sx, 0, -0.055);
    lens.rotation.x = Math.PI / 2;
  }
  add(head, new THREE.BoxGeometry(0.03, 0.02, 0.02), led, -0.085, 0.03, -0.04);
  // High-gain antenna dish
  const dishGeo = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.06, 0.008), new THREE.Vector2(0.11, 0.03), new THREE.Vector2(0.115, 0.04)], 28);
  const dish = add(body, dishGeo, white, -0.14, 0.56, -0.08);
  dish.rotation.set(-0.9, 0, 0.35);
  add(body, new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), grey, -0.14, 0.5, -0.08);
  // Folded robotic arm at the front
  add(body, new THREE.BoxGeometry(0.34, 0.035, 0.035), grey, -0.02, 0.36, -0.43);
  add(body, new THREE.BoxGeometry(0.09, 0.08, 0.07), dark, 0.16, 0.36, -0.45);

  // Rocker-bogie suspension and six wheels
  const wheels = [];
  // Wheels with raised grousers (tread cleats), like the rovers' machined aluminium wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.112, 0.112, 0.11, 36, 1, false);
  {
    const wp = wheelGeo.attributes.position;
    for (let i = 0; i < wp.count; i++) {
      const x = wp.getX(i);
      const z = wp.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 0.1) continue; // cap centres
      const seg = Math.round(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 36);
      const k = (seg % 2 === 0 ? 0.122 : 0.112) / r;
      wp.setX(i, x * k);
      wp.setZ(i, z * k);
    }
    wheelGeo.computeVertexNormals();
  }
  wheelGeo.rotateZ(Math.PI / 2);
  const treadMat = new THREE.MeshStandardMaterial({ color: '#b9bcc1', roughness: 0.4, metalness: 0.85 });
  const hubMat = new THREE.MeshStandardMaterial({ color: '#b9bcc2', roughness: 0.35, metalness: 0.85 });
  for (const side of [-1, 1]) {
    const x = side * 0.36;
    const rocker = add(body, new THREE.BoxGeometry(0.035, 0.035, 0.62), grey, x, 0.26, -0.06);
    rocker.rotation.x = 0.12;
    add(body, new THREE.BoxGeometry(0.03, 0.03, 0.34), grey, x, 0.2, 0.22);
    for (const z of [-0.33, 0.02, 0.32]) {
      add(body, new THREE.BoxGeometry(0.025, 0.12, 0.025), grey, x, 0.17, z);
      const w = new THREE.Mesh(wheelGeo, [treadMat, hubMat, hubMat]);
      w.position.set(x + side * 0.02, 0.122, z);
      w.castShadow = true;
      root.add(w);
      wheels.push({ mesh: w, side });
    }
  }
  return { root, body, wheels, led };
}

function buildFlag() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.85, 10), new THREE.MeshStandardMaterial({ color: '#e6ebf5', roughness: 0.3, metalness: 0.8 }));
  pole.position.y = 0.425;
  pole.castShadow = true;
  g.add(pole);
  const clothGeo = new THREE.PlaneGeometry(0.36, 0.22, 12, 6);
  clothGeo.translate(0.18, 0, 0);
  const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ color: '#3ddc97', emissive: '#16a46a', emissiveIntensity: 0.35, roughness: 0.7, side: THREE.DoubleSide }));
  cloth.position.y = 0.72;
  cloth.castShadow = true;
  g.add(cloth);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 48), new THREE.MeshBasicMaterial({ color: '#3ddc97', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  return { group: g, cloth, ring, base: Float32Array.from(clothGeo.attributes.position.array) };
}

function buildSample(glowTex) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#7fd8ff', emissive: '#2aa7ff', emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.1 });
  const r = rng(11);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.07 + r() * 0.06, 0), mat);
    m.scale.y = 1.8 + r();
    m.position.set((r() - 0.5) * 0.2, 0.08 + r() * 0.04, (r() - 0.5) * 0.2);
    m.rotation.set((r() - 0.5) * 0.8, r() * 3, (r() - 0.5) * 0.8);
    m.castShadow = true;
    g.add(m);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#5cc8ff', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(0.9, 0.9, 1);
  glow.position.y = 0.15;
  g.add(glow);
  const light = new THREE.PointLight('#5cc8ff', 1.4, 2.2, 2);
  light.position.y = 0.25;
  g.add(light);
  return { group: g, glow, light };
}

// ---------------------------------------------------------------- particles

class Particles {
  constructor(capacity, blending, glowTex) {
    this.n = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.max = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.next = 0;
    this.alive = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.uniforms = { map: { value: glowTex }, scale: { value: 300 } };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending,
      vertexShader: /* glsl */ `
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float scale; varying float vA; varying vec3 vC;
        void main() {
          vA = alpha; vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying float vA; varying vec3 vC;
        void main() {
          float a = texture2D(map, gl_PointCoord).r * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC, a);
          #include <colorspace_fragment>
        }`,
    }));
    this.points.frustumCulled = false;
  }

  spawn(x, y, z, { vx = 0, vy = 0, vz = 0, life = 1, size = 0.2, grow = 0, color = '#ffffff', gravity = 0 } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    const c = new THREE.Color(color);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.life[i] = this.max[i] = life;
    this.size[i] = size;
    this.grow[i] = grow;
    this.gravity[i] = gravity;
    this.alpha[i] = 1;
  }

  update(dt) {
    const s = dt / 1000;
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      alive++;
      this.life[i] -= s;
      this.vel[i * 3 + 1] -= this.gravity[i] * s;
      this.vel[i * 3] *= 0.985;
      this.vel[i * 3 + 2] *= 0.985;
      this.pos[i * 3] += this.vel[i * 3] * s;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * s;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * s;
      this.size[i] += this.grow[i] * s;
      const t = Math.max(0, this.life[i] / this.max[i]);
      this.alpha[i] = t * t;
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = geo.attributes.size.needsUpdate = geo.attributes.alpha.needsUpdate = geo.attributes.color.needsUpdate = true;
    this.alive = alive;
    return alive;
  }
}

// ---------------------------------------------------------------- the scene

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class MarsScene {
  /**
   * @param {HTMLElement} host Element the canvas fills.
   * @param {{ onPick?: (tile: {x:number,y:number}) => void }} [opts]
   */
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts;
    this.anims = [];
    this.visible = true;
    this.view = 'mission';
    this.shake = 0;
    this.picking = false;
    this.listeners = new AbortController();

    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    // AgX keeps bright dust and the sun's halo natural instead of clipping them to flat orange.
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'kvx-canvas';
    host.append(renderer.domElement);

    const scene = (this.scene = new THREE.Scene());
    // Aerial perspective: Mars's dusty air fades distance into the colour of the horizon.
    scene.fog = new THREE.FogExp2(COLORS.fog, 0.0115);
    this.camera = new THREE.PerspectiveCamera(36, 1.4, 0.05, 900);
    this.cam = { az: 0.5, pol: 1.08, r: 14, tx: 0, tz: 0 };
    this.camGoal = { ...this.cam };

    // A soft dark disc under objects that touch the ground, so they look planted (contact shadow).
    this.contactGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.contactMat = new THREE.MeshBasicMaterial({ map: glowTexture('rgba(255,255,255,1)'), color: '#000000', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.textures = {
      glow: glowTexture(),
      foil: normalTexture(128, (u, v) => noise.tileFbm(u * 6, v * 6, 6, 4) * 1.4, 4),
    };

    // Sky, and image-based lighting rendered from the same sky so metal reflects Mars.
    const sky = buildSky();
    scene.add(sky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(buildSky());
    this.envMap = pmrem.fromScene(envScene, 0.02).texture;
    pmrem.dispose();
    envScene.traverse((o) => (o.geometry?.dispose(), o.material?.dispose()));
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.4;

    const sun = (this.sun = new THREE.DirectionalLight('#ffe6c8', 3.9));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight('#e7b88c', '#4a2214', 0.32)); // sky above, sunlit dust bouncing from below

    this.ambientDust = this._buildDust();
    scene.add(this.ambientDust);
    this.puffs = new Particles(220, THREE.NormalBlending, this.textures.glow);
    this.sparks = new Particles(260, THREE.AdditiveBlending, this.textures.glow);
    scene.add(this.puffs.points, this.sparks.points);

    this.rover = buildRover(this.textures);
    scene.add(this.rover.root);
    this.flag = buildFlag();
    scene.add(this.flag.group);
    this.sample = buildSample(this.textures.glow);
    scene.add(this.sample.group);

    this.worlds = new Map(); // grid size → landscape (terrain + scattered rocks)
    this.missionGroup = new THREE.Group(); // rebuilt per mission: rocks and grid
    scene.add(this.missionGroup);
    this.tracks = new THREE.Group();
    scene.add(this.tracks);
    this.trackMat = new THREE.MeshStandardMaterial({ color: '#4a2416', roughness: 1, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.marker = this._buildMarker();
    scene.add(this.marker);

    this._bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.wake();
    });
    this.io.observe(host);
    this.ticker = frameLoop.add((dt, now) => this._tick(dt, now));
    this.resize();
  }

  // ------------------------------------------------------------ mission setup

  setMission(m) {
    this.m = m;
    for (const o of [...this.missionGroup.children]) this._disposeObject(o);
    this.missionGroup.clear();
    // The landscape depends only on the grid size, so it is built once per size and reused.
    if (!this.worlds.has(m.n)) {
      this.heightAt = makeHeight(m.n);
      const world = new THREE.Group();
      world.add(buildTerrain(this.heightAt), this._buildScatter(m.n));
      world.userData.heightAt = this.heightAt;
      this.worlds.set(m.n, world);
      this.scene.add(world);
    }
    for (const [n, w] of this.worlds) w.visible = n === m.n;
    this.heightAt = this.worlds.get(m.n).userData.heightAt;
    this.missionGroup.add(this._buildGrid(m.n));
    this.missionGroup.add(this._buildRocks(m));
    this.gridMat.opacity = this.view === 'plan' ? 0.55 : 0.3;

    const span = (m.n * TILE) / 2 + 2.5;
    const sh = this.sun.shadow.camera;
    sh.left = sh.bottom = -span;
    sh.right = sh.top = span;
    sh.near = 1;
    sh.far = 60;
    sh.updateProjectionMatrix();
    this.sun.position.copy(SUN).multiplyScalar(30);
    this.sun.target.position.set(0, 0, 0);

    this.flag.group.position.copy(this.world(m.goal[0], m.goal[1]));
    this.reset();
    this.setView(this.view, true);
    this._warmUp();
  }

  /**
   * Compile every shader the game will need (wheel tracks, dust puffs, sparks) in the background,
   * so the first run does not freeze for half a second while the browser prepares them.
   */
  _warmUp() {
    if (this.warmed || !this.renderer.compileAsync) return;
    this.warmed = true;
    const extras = new THREE.Scene();
    const probe = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), this.trackMat);
    extras.add(probe);
    Promise.all([this.renderer.compileAsync(this.scene, this.camera), this.renderer.compileAsync(extras, this.camera, this.scene)])
      .catch(() => {}) // a failed warm-up only means the first run compiles as before
      .finally(() => probe.geometry.dispose());
  }

  /** World position of a tile centre, on the ground. */
  world(x, y) {
    const n = this.m.n;
    const wx = (x - (n - 1) / 2) * TILE;
    const wz = (y - (n - 1) / 2) * TILE;
    return new THREE.Vector3(wx, this.heightAt(wx, wz), wz);
  }

  reset() {
    const m = this.m;
    this.anims.length = 0;
    for (const t of [...this.tracks.children]) t.geometry.dispose();
    this.tracks.clear();
    const p = this.world(m.start[0], m.start[1]);
    this.yaw = -m.start[2] * (Math.PI / 2);
    this.rover.root.position.copy(p);
    this.rover.root.rotation.set(0, this.yaw, 0);
    this.rover.body.position.set(0, 0, 0);
    this.rover.body.rotation.set(0, 0, 0);
    this.sample.group.visible = true;
    this.sample.group.scale.setScalar(1);
    this.sample.group.position.copy(this.world(m.sample[0], m.sample[1]));
    this.sample.light.intensity = 1.4;
    this.setPrediction(null);
    this.wake();
  }

  setView(view, instant = false) {
    this.view = view;
    const span = this.m ? this.m.n * TILE : 6;
    this.camGoal = view === 'plan'
      ? { az: 0, pol: 0.02, r: span * 2.05, tx: 0, tz: 0 }
      : { az: 0.5, pol: 1.27, r: span * 2.45, tx: -Math.sin(0.5) * span * 0.32, tz: -Math.cos(0.5) * span * 0.32 };
    if (instant) Object.assign(this.cam, this.camGoal);
    if (this.gridMat) this.gridMat.opacity = view === 'plan' ? 0.55 : 0.3; // tiles read clearly when planning
    this.wake();
  }

  /** Where tile (x, y) appears on screen, in CSS pixels from the canvas's top-left corner. */
  tileOnScreen(x, y) {
    const p = this.world(x, y).project(this.camera);
    const el = this.renderer.domElement;
    return { x: ((p.x + 1) / 2) * el.clientWidth, y: ((1 - p.y) / 2) * el.clientHeight };
  }

  /** Zoom the camera in (factor < 1) or out (factor > 1), within sensible limits. */
  zoomBy(factor) {
    const span = this.m ? this.m.n * TILE : 6;
    this.camGoal.r = Math.min(span * 4.2, Math.max(span * 0.7, this.camGoal.r * factor));
    this.wake();
  }

  /** Put the camera back to the current view's framing. */
  recenter() {
    this.setView(this.view);
  }

  /** Show or hide the "you predicted it stops here" marker. */
  setPrediction(tile) {
    this.prediction = tile;
    this.marker.visible = Boolean(tile);
    if (tile) this.marker.position.copy(this.world(tile.x, tile.y)).add(new THREE.Vector3(0, 0.04, 0));
    this.wake();
  }

  setPicking(on) {
    this.picking = on;
    this.renderer.domElement.style.cursor = on ? 'crosshair' : '';
    if (!on && !this.prediction) this.marker.visible = false;
    this.wake();
  }

  // ------------------------------------------------------------ playing steps

  /**
   * Animate one simulated step ({ cmd, from, to, event, sample }). Resolves when it finishes.
   * @param {number} ms Duration of a move; turns take a little less.
   */
  play(step, ms) {
    this.wake();
    const r = this.rover;
    if (step.event === 'turn') {
      const from = this.yaw;
      this.yaw += step.cmd === 'left' ? Math.PI / 2 : -Math.PI / 2;
      const to = this.yaw;
      const dir = step.cmd === 'left' ? 1 : -1;
      return this._anim(ms * 0.8, (t, dt) => {
        r.root.rotation.y = from + (to - from) * easeInOut(t);
        // Turning on the spot: the two sides' wheels spin in opposite directions.
        for (const w of r.wheels) w.mesh.rotation.x += w.side * dir * dt * 0.006;
        r.body.rotation.z = Math.sin(t * Math.PI) * 0.02 * dir;
      });
    }
    const a = this.world(step.from.x, step.from.y);
    if (step.event === 'move') {
      const b = this.world(step.to.x, step.to.y);
      this._addTrack(a, b);
      let lastPuff = 0;
      return this._anim(ms, (t, dt) => {
        const e = easeInOut(t);
        r.root.position.lerpVectors(a, b, e);
        const speed = Math.sin(t * Math.PI);
        for (const w of r.wheels) w.mesh.rotation.x -= (dt / ms) * (TILE / 0.105) * speed * 1.55;
        r.body.position.y = Math.sin(t * Math.PI * 6) * 0.008 * speed;
        r.body.rotation.x = -speed * 0.025;
        lastPuff += dt;
        if (lastPuff > 45 && speed > 0.3) {
          lastPuff = 0;
          this._puff();
        }
        if (step.sample && t > 0.55 && this.sample.group.visible && !this._collecting) this._collect();
      }).then(() => (r.body.rotation.x = 0));
    }
    // crash or drive off the map: lurch toward the obstacle, bounce back
    const dirv = new THREE.Vector3(...[[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]][step.from.d]);
    const hit = a.clone().addScaledVector(dirv, TILE * (step.event === 'crash' ? 0.36 : 0.45));
    return this._anim(170, (t) => r.root.position.lerpVectors(a, hit, easeInOut(t)))
      .then(() => {
        const contact = a.clone().addScaledVector(dirv, TILE * 0.5).add(new THREE.Vector3(0, 0.25, 0));
        this.shake = step.event === 'crash' ? 0.22 : 0.12;
        const cols = ['#ff7a3d', '#ffc94d', '#ff5470'];
        for (let i = 0; i < 46; i++) {
          this.sparks.spawn(contact.x, contact.y, contact.z, { vx: (Math.random() - 0.5) * 4 - dirv.x * 1.5, vy: Math.random() * 3.2, vz: (Math.random() - 0.5) * 4 - dirv.z * 1.5, life: 0.5 + Math.random() * 0.5, size: 0.08 + Math.random() * 0.08, color: cols[i % 3], gravity: 6 });
        }
        for (let i = 0; i < 14; i++) this._puff(contact, 1.6);
        if (step.event === 'offmap') r.body.rotation.x = 0.12;
        return this._anim(320, (t) => {
          r.root.position.lerpVectors(hit, a, easeInOut(t));
          r.body.rotation.x *= 0.85;
        });
      });
  }

  celebrate() {
    const p = this.world(this.m.goal[0], this.m.goal[1]);
    const cols = ['#3ddc97', '#ffc94d', '#5cc8ff', '#ffffff'];
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.2 + Math.random() * 2.6;
      this.sparks.spawn(p.x, p.y + 0.6, p.z, { vx: Math.cos(a) * s, vy: 2 + Math.random() * 3.5, vz: Math.sin(a) * s, life: 1 + Math.random() * 0.9, size: 0.06 + Math.random() * 0.09, color: cols[i % 4], gravity: 3.2 });
    }
    const body = this.rover.body;
    this._anim(700, (t) => (body.position.y = Math.sin(t * Math.PI) * 0.12 * (1 - t * 0.3)));
    this.wake();
  }

  // ------------------------------------------------------------ frame loop

  _tick(dt, now) {
    if (!this.visible) return IDLE;
    let active = false;

    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t = Math.min(1, a.t + dt / a.ms);
      a.update(a.t, dt);
      if (a.t >= 1) {
        this.anims.splice(i, 1);
        a.resolve();
      }
    }
    if (this.anims.length) active = true;

    // Camera: ease toward the goal; follow the rover a little while it drives.
    const goal = { ...this.camGoal };
    if (this.anims.length && this.view === 'mission' && this.m) {
      goal.tx += this.rover.root.position.x * 0.35;
      goal.tz += this.rover.root.position.z * 0.35;
    }
    const f = easeFactor(dt, 260);
    let moving = false;
    for (const k of ['az', 'pol', 'r', 'tx', 'tz']) {
      const d = goal[k] - this.cam[k];
      if (Math.abs(d) > 1e-4) moving = true;
      this.cam[k] += d * f;
    }
    if (moving) active = true;
    const { az, pol, r, tx, tz } = this.cam;
    this.camera.position.set(tx + r * Math.sin(pol) * Math.sin(az), r * Math.cos(pol) + 0.2, tz + r * Math.sin(pol) * Math.cos(az));
    if (this.shake > 0.002) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt / 90);
      active = true;
    } else this.shake = 0;
    this.camera.lookAt(tx, 0.25, tz);

    // Ambient life: drifting dust, waving flag, glowing sample, pulsing goal ring.
    const s = now / 1000;
    this._updateDust(dt);
    const cloth = this.flag.cloth.geometry.attributes.position;
    const base = this.flag.base;
    for (let i = 0; i < cloth.count; i++) {
      const x = base[i * 3];
      cloth.setZ(i, Math.sin(x * 14 - s * 5) * 0.03 * (x / 0.36) + Math.sin(x * 23 - s * 7.3) * 0.008);
    }
    cloth.needsUpdate = true;
    this.flag.cloth.geometry.computeVertexNormals();
    const pulse = 0.5 + 0.5 * Math.sin(s * 2.4);
    this.flag.ring.material.opacity = 0.3 + 0.35 * pulse;
    this.flag.ring.scale.setScalar(1 + pulse * 0.08);
    if (this.sample.group.visible && !this._collecting) {
      this.sample.group.rotation.y = s * 0.6;
      this.sample.glow.material.opacity = 0.55 + 0.25 * pulse;
    }
    this.marker.material.opacity = this.marker.visible ? 0.55 + 0.3 * pulse : 0;
    this.rover.led.emissiveIntensity = this.anims.length ? 1.2 + 1.8 * (Math.sin(s * 14) > 0 ? 1 : 0) : 2;

    const puffs = this.puffs.update(dt);
    const sparks = this.sparks.update(dt);
    if (puffs || sparks) active = true;

    this.renderer.render(this.scene, this.camera);
    return active ? ACTIVE : AMBIENT;
  }

  wake() {
    this.ticker?.wake();
  }

  _anim(ms, update) {
    return new Promise((resolve) => this.anims.push({ ms: Math.max(1, ms), t: 0, update, resolve }));
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole grid in frame on narrow screens.
    this.camera.fov = w / h < 1.1 ? 46 : 36;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    // Point size in pixels for a particle 1 world unit across, 1 unit away.
    const scale = (h * pr) / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.puffs.uniforms.scale.value = this.sparks.uniforms.scale.value = scale;
    this.wake();
  }

  // ------------------------------------------------------------ builders and helpers

  _buildGrid(n) {
    const px = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext('2d');
    const cell = px / n;
    ctx.strokeStyle = 'rgba(255, 236, 214, 0.75)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, px);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(px, i * cell);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 236, 214, 0.9)';
    for (let x = 0; x <= n; x++) for (let y = 0; y <= n; y++) ctx.fillRect(x * cell - 4, y * cell - 4, 8, 8);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    const size = n * TILE;
    const geo = new THREE.PlaneGeometry(size, size, n * 6, n * 6);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)) + 0.012);
    this.gridMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    return new THREE.Mesh(geo, this.gridMat);
  }

  _buildRocks(m) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.05, normalMap: this.textures.foil, normalScale: new THREE.Vector2(0.5, 0.5) });
    m.rocks.forEach(([x, y], i) => {
      const rock = new THREE.Mesh(rockGeometry(101 + i * 7 + m.n * 13), mat);
      const p = this.world(x, y);
      const r = rng(i + 3);
      const size = TILE * (0.36 + r() * 0.08);
      rock.scale.setScalar(size);
      rock.position.set(p.x, p.y - size * 0.1, p.z); // bedded into the ground, not resting on it
      rock.rotation.y = r() * Math.PI * 2;
      rock.castShadow = rock.receiveShadow = true;
      g.add(rock);
      const contact = new THREE.Mesh(this.contactGeo, this.contactMat);
      contact.position.set(p.x, p.y + 0.015, p.z);
      contact.scale.setScalar(size * 2.6);
      contact.userData.shared = true;
      g.add(contact);
    });
    return g;
  }

  /** Hundreds of small rocks and boulders around the play area, one draw call each. */
  _buildScatter(n) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    const half = (n * TILE) / 2 + TILE * 0.8;
    const place = (geo, count, minS, maxS, minD, maxD, seed) => {
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      const r = rng(seed);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      let k = 0;
      for (let tries = 0; k < count && tries < count * 8; tries++) {
        const a = r() * Math.PI * 2;
        const d = minD + Math.pow(r(), 1.6) * (maxD - minD);
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        if (Math.abs(x) < half && Math.abs(z) < half) continue;
        const s = minS + Math.pow(r(), 3) * (maxS - minS);
        q.setFromEuler(e.set(r() * 0.6, r() * 6.3, r() * 0.6));
        m4.compose(new THREE.Vector3(x, this.heightAt(x, z) + s * 0.15, z), q, new THREE.Vector3(s, s, s));
        mesh.setMatrixAt(k++, m4);
      }
      mesh.count = k;
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    };
    place(rockGeometry(5, 1), 420, 0.03, 0.16, half * 0.75, 26, 21);
    place(rockGeometry(9, 2), 60, 0.25, 0.85, 15, 48, 33);
    return g;
  }

  _buildDust() {
    const count = 700;
    const pos = new Float32Array(count * 3);
    const r = rng(77);
    for (let i = 0; i < count; i++) pos.set([(r() - 0.5) * 30, r() * 5, (r() - 0.5) * 30], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: '#f0c39a', size: 0.035, transparent: true, opacity: 0.45, depthWrite: false, sizeAttenuation: true }));
  }

  _updateDust(dt) {
    const p = this.ambientDust.geometry.attributes.position;
    const s = dt / 1000;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) + 0.35 * s;
      let y = p.getY(i) + Math.sin((i * 12.9 + x) * 0.7) * 0.05 * s;
      if (x > 15) x -= 30;
      if (y < 0) y += 5;
      p.setXY(i, x, y);
    }
    p.needsUpdate = true;
  }

  _buildMarker() {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.44, 40), new THREE.MeshBasicMaterial({ color: '#ffc94d', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    return m;
  }

  _addTrack(a, b) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    for (const s of [-0.38, 0.38]) {
      const geo = new THREE.PlaneGeometry(0.09, len);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, this.trackMat);
      const mid = a.clone().add(b).multiplyScalar(0.5).addScaledVector(side, s);
      mesh.position.set(mid.x, this.heightAt(mid.x, mid.z) + 0.015, mid.z);
      mesh.rotation.y = Math.atan2(dir.x, dir.z);
      this.tracks.add(mesh);
    }
  }

  _puff(at, power = 1) {
    const r = this.rover.root;
    const back = new THREE.Vector3(0, 0, 0.38).applyAxisAngle(new THREE.Vector3(0, 1, 0), r.rotation.y);
    for (const side of [-0.3, 0.3]) {
      const off = new THREE.Vector3(side, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), r.rotation.y);
      const p = at || r.position.clone().add(back).add(off);
      this.puffs.spawn(p.x, p.y + 0.05, p.z, { vx: (Math.random() - 0.5) * 0.5 * power, vy: (0.25 + Math.random() * 0.35) * power, vz: (Math.random() - 0.5) * 0.5 * power, life: 0.9 + Math.random() * 0.6, size: 0.18, grow: 0.5, color: '#c98a62' });
    }
  }

  _collect() {
    this._collecting = true;
    const s = this.sample;
    const start = s.group.position.clone();
    const cols = ['#5cc8ff', '#bfeaff', '#ffffff'];
    for (let i = 0; i < 40; i++) this.sparks.spawn(start.x, start.y + 0.15, start.z, { vx: (Math.random() - 0.5) * 2.5, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 2.5, life: 0.7 + Math.random() * 0.5, size: 0.07, color: cols[i % 3], gravity: 2.5 });
    this._anim(520, (t) => {
      const target = this.rover.root.position.clone().add(new THREE.Vector3(0, 0.5, 0));
      s.group.position.lerpVectors(start, target, easeInOut(t));
      s.group.scale.setScalar(1 - t);
      s.light.intensity = 1.4 * (1 - t);
    }).then(() => {
      s.group.visible = false;
      this._collecting = false;
    });
  }

  _bindInput() {
    const el = this.renderer.domElement;
    const signal = this.listeners.signal;
    let drag = null;
    const tileAt = (e) => {
      if (!this.m) return null;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
      const n = this.m.n;
      const x = Math.round(hit.x / TILE + (n - 1) / 2);
      const y = Math.round(hit.z / TILE + (n - 1) / 2);
      return x >= 0 && y >= 0 && x < n && y < n ? { x, y } : null;
    };
    el.addEventListener('pointerdown', (e) => {
      if (this.picking) {
        const t = tileAt(e);
        if (t) this.opts.onPick?.(t);
        return;
      }
      drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    }, { signal });
    el.addEventListener('pointermove', (e) => {
      if (this.picking) {
        const t = tileAt(e);
        this.marker.visible = Boolean(t) || Boolean(this.prediction);
        if (t) this.marker.position.copy(this.world(t.x, t.y)).add(new THREE.Vector3(0, 0.04, 0));
        this.wake();
        return;
      }
      if (!drag) return;
      // Drag to look around the landing site (mission view only).
      if (this.view === 'mission') {
        this.camGoal.az -= (e.clientX - drag.x) * 0.006;
        this.camGoal.pol = Math.min(1.36, Math.max(0.35, this.camGoal.pol - (e.clientY - drag.y) * 0.004));
        this.wake();
      }
      drag = { x: e.clientX, y: e.clientY };
    }, { signal });
    el.addEventListener('pointerup', () => (drag = null), { signal });
    el.addEventListener('pointercancel', () => (drag = null), { signal });
    el.addEventListener('dblclick', () => this.setView(this.view), { signal });
    // A trackpad pinch arrives as ctrl+wheel. Handle it here, or the browser zooms the whole page
    // and the player is left with no obvious way back. Plain scrolling zooms only when the game
    // owns the screen (opts.captureWheel), so it never hijacks scrolling the page.
    el.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !this.opts.captureWheel?.()) return;
      e.preventDefault();
      this.zoomBy(Math.exp(e.deltaY * (e.ctrlKey ? 0.012 : 0.0016)));
    }, { signal, passive: false });
  }

  _disposeObject(obj) {
    obj.traverse((o) => {
      if (o.userData.shared) return; // shared parts (contact shadows) are released in dispose()
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const mat of mats) {
        for (const key of ['map', 'normalMap']) if (mat[key] && !Object.values(this.textures).includes(mat[key])) mat[key].dispose();
        mat.userData.textures?.forEach((t) => t.dispose());
        mat.dispose();
      }
    });
  }

  dispose() {
    this.ticker?.remove();
    this.ticker = null;
    this.listeners.abort();
    this.ro.disconnect();
    this.io.disconnect();
    this.anims.length = 0;
    this._disposeObject(this.scene);
    for (const t of Object.values(this.textures)) t.dispose();
    this.contactMat.map.dispose();
    this.contactMat.dispose();
    this.contactGeo.dispose();
    this.envMap.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
