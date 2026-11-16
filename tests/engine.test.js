import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoop, ACTIVE, AMBIENT, IDLE } from '../js/engine/loop.js';
import { placeLabels } from '../js/engine/labels.js';

/** A hand-cranked requestAnimationFrame so the loop can be tested without a browser. */
function fakeClock() {
  let queue = [];
  let now = 0;
  const doc = { hidden: false, addEventListener() {} };
  return {
    doc,
    raf: (fn) => queue.push(fn),
    caf: () => (queue = []),
    pending: () => queue.length,
    tick(ms = 16.7) {
      now += ms;
      const run = queue;
      queue = [];
      run.forEach((fn) => fn(now));
    },
  };
}

test('an idle loop requests no frames until woken', () => {
  const clock = fakeClock();
  const loop = createLoop(clock);
  let calls = 0;
  const t = loop.add(() => (calls++, IDLE));
  clock.tick();
  assert.equal(calls, 1);
  assert.equal(clock.pending(), 0, 'no frame requested once idle');
  clock.tick();
  assert.equal(calls, 1);
  t.wake();
  assert.equal(clock.pending(), 1);
  clock.tick();
  assert.equal(calls, 2);
});

test('an active ticker runs every frame and receives real elapsed time', () => {
  const clock = fakeClock();
  const loop = createLoop(clock);
  const dts = [];
  loop.add((dt) => (dts.push(dt), ACTIVE));
  clock.tick(16);
  clock.tick(8);
  clock.tick(400); // a stall is clamped so animations never jump
  assert.equal(dts.length, 3);
  assert.equal(dts[1], 8);
  assert.equal(dts[2], 50);
});

test('ambient-only work is held to a reduced frame rate', () => {
  const clock = fakeClock();
  const loop = createLoop(clock);
  let calls = 0;
  loop.add(() => (calls++, AMBIENT));
  for (let i = 0; i < 60; i++) clock.tick(16.7); // one second at 60 Hz
  assert.ok(calls >= 28 && calls <= 32, `about 30 calls, got ${calls}`);
});

test('nothing runs while the tab is hidden', () => {
  const clock = fakeClock();
  const loop = createLoop(clock);
  let calls = 0;
  loop.add(() => (calls++, ACTIVE));
  clock.tick();
  clock.doc.hidden = true;
  clock.tick();
  clock.tick();
  assert.equal(calls, 1);
});

test('removing the last ticker stops the loop', () => {
  const clock = fakeClock();
  const loop = createLoop(clock);
  const t = loop.add(() => ACTIVE);
  clock.tick();
  t.remove();
  assert.equal(loop.size, 0);
  assert.equal(clock.pending(), 0);
});

test('labels: higher priority wins an overlap', () => {
  const shown = placeLabels([
    { x: 0, y: 0, w: 100, h: 16, priority: 1 },
    { x: 50, y: 4, w: 100, h: 16, priority: 5 },
    { x: 400, y: 0, w: 100, h: 16, priority: 1 },
  ]);
  assert.deepEqual(shown, [false, true, true]);
});

test('labels: forced labels always show and block others', () => {
  const shown = placeLabels([
    { x: 0, y: 0, w: 100, h: 16, priority: 9 },
    { x: 20, y: 0, w: 100, h: 16, priority: 1, force: true },
  ]);
  assert.deepEqual(shown, [false, true]);
});

test('labels: boxes closer than the gap count as overlapping', () => {
  const boxes = [
    { x: 0, y: 0, w: 100, h: 16, priority: 2 },
    { x: 102, y: 0, w: 100, h: 16, priority: 1 },
  ];
  assert.deepEqual(placeLabels(boxes, 4), [true, false]);
  assert.deepEqual(placeLabels(boxes, 1), [true, true]);
});

test('labels: placement scales to thousands of boxes', () => {
  const boxes = Array.from({ length: 5000 }, (_, i) => ({ x: (i % 100) * 30, y: Math.floor(i / 100) * 10, w: 60, h: 14, priority: i % 7 }));
  const start = performance.now();
  const shown = placeLabels(boxes);
  assert.ok(performance.now() - start < 200, 'under 200 ms for 5,000 labels');
  // No two shown labels overlap.
  const kept = boxes.filter((_, i) => shown[i]);
  for (let i = 0; i < kept.length; i += 37) {
    for (const o of kept) {
      if (o === kept[i]) continue;
      const hit = kept[i].x < o.x + o.w && o.x < kept[i].x + kept[i].w && kept[i].y < o.y + o.h && o.y < kept[i].y + kept[i].h;
      assert.ok(!hit, 'shown labels never overlap');
    }
  }
});
