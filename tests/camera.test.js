import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, easeFactor, zoomAt, toWorld, approach, fitBounds, Inertia } from '../js/engine/camera.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('clamp keeps a value inside its range', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});

test('zoomAt keeps the world point under the cursor fixed', () => {
  const cam = { x: 40, y: -20, k: 1.5 };
  const before = toWorld(cam, 300, 200);
  const after = toWorld(zoomAt(cam, 300, 200, 3), 300, 200);
  near(before.x, after.x);
  near(before.y, after.y);
});

test('easing is frame-rate independent: two half steps equal one full step', () => {
  const one = easeFactor(32, 110);
  const half = easeFactor(16, 110);
  near(1 - one, (1 - half) * (1 - half));
});

test('approach reaches the target and reports arrival', () => {
  const cam = { x: 0, y: 0, k: 1 };
  const target = { x: 200, y: -80, k: 2 };
  let done = false;
  for (let i = 0; i < 200 && !done; i++) done = approach(cam, target, 16.7);
  assert.ok(done, 'arrives within 200 frames');
  assert.deepEqual(cam, target);
});

test('approach covers the same ground at 60 Hz and 120 Hz', () => {
  const a = { x: 0, y: 0, k: 1 };
  const b = { x: 0, y: 0, k: 1 };
  const target = { x: 300, y: 0, k: 1 };
  for (let i = 0; i < 6; i++) approach(a, target, 16);
  for (let i = 0; i < 12; i++) approach(b, target, 8);
  near(a.x, b.x, 1e-6);
});

test('fitBounds centres the box and respects padding and zoom limits', () => {
  const cam = fitBounds({ x0: -100, y0: -50, x1: 100, y1: 50 }, { width: 800, height: 600 }, { pad: 50, maxK: 2 });
  near(cam.k, 2); // 800 / 300 = 2.67 and 600 / 200 = 3, capped at maxK
  near(cam.x, 400);
  near(cam.y, 300);
  const tight = fitBounds({ x0: 0, y0: 0, x1: 4000, y1: 100 }, { width: 800, height: 600 });
  near(tight.k, 0.2);
});

test('a flick glides, slows down and stops', () => {
  const inertia = new Inertia();
  for (let t = 0; t <= 60; t += 10) inertia.track(t * 2, 0, t); // 2 px/ms to the right
  assert.ok(inertia.release(60));
  let travelled = 0;
  let frames = 0;
  while (inertia.active && frames < 1000) {
    travelled += inertia.step(16.7).dx;
    frames++;
  }
  assert.ok(!inertia.active, 'comes to rest');
  assert.ok(travelled > 100, `glides a useful distance (${travelled.toFixed(0)}px)`);
  assert.ok(travelled < 2 * 240 + 1, "never exceeds velocity × friction");
});

test('no glide when the pointer was held still before release', () => {
  const inertia = new Inertia();
  inertia.track(0, 0, 0);
  inertia.track(100, 0, 20);
  assert.equal(inertia.release(400), false);
  assert.deepEqual(inertia.step(16), { dx: 0, dy: 0 });
});

test('glide distance does not depend on frame rate', () => {
  const run = (dt) => {
    const inertia = new Inertia();
    inertia.track(0, 0, 0);
    inertia.track(60, 30, 40);
    inertia.release(40);
    let x = 0;
    for (let t = 0; t < 4000 && inertia.active; t += dt) x += inertia.step(dt).dx;
    return x;
  };
  near(run(16), run(8), 3);
});
