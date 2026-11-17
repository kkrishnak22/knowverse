import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, DEFINITION, blocked, simulate, parseProgram, shortestRoute, groups, lineCount, toPython, report } from '../js/kit/rover/missions.js';

test('every mission can be solved, collecting the sample on the way', () => {
  for (const m of MISSIONS) {
    const route = shortestRoute(m);
    assert.ok(route.length, `${m.title} has a solution`);
    const r = simulate(m, route);
    assert.ok(r.reached && r.gotSample && !r.crashed, `${m.title}: the shortest route works`);
  }
});

test('mission 2 can be solved with exactly the commands it hands out', () => {
  const m = MISSIONS[1];
  const route = shortestRoute(m);
  assert.deepEqual([...route].sort(), [...m.pool].sort());
});

test('the definition has one slot per mission, in order', () => {
  assert.deepEqual(DEFINITION.filter((p) => typeof p === 'number'), [0, 1, 2, 3]);
  assert.equal(MISSIONS.length, 4);
  MISSIONS.forEach((m) => assert.ok(m.part && m.check.options[m.check.answer]));
});

test('blocked: map edges and rocks', () => {
  const m = MISSIONS[0];
  assert.equal(blocked(m, -1, 0), true);
  assert.equal(blocked(m, 5, 0), true);
  assert.equal(blocked(m, 2, 3), true);
  assert.equal(blocked(m, 2, 2), false);
});

test('simulate: turning changes direction only', () => {
  const r = simulate(MISSIONS[0], ['right', 'right', 'right', 'right']);
  assert.deepEqual(r.end, { x: 0, y: 4, d: 0 });
  assert.equal(r.steps.length, 4);
  assert.ok(r.steps.every((s) => s.event === 'turn'));
});

test('simulate: stops at the first crash and reports what was hit', () => {
  const r = simulate(MISSIONS[0], ['right', 'forward', 'forward', 'forward']);
  // From (0,4) facing east: (1,4) is clear, (2,4) clear… check against the real rocks instead.
  const m = MISSIONS[0];
  const crash = simulate(m, ['forward', 'right', 'forward']); // up to (0,3), then east into the rock at (1,3)
  assert.equal(crash.crashed, true);
  assert.equal(crash.steps.at(-1).event, 'crash');
  assert.deepEqual(crash.steps.at(-1).hit, [1, 3]);
  assert.deepEqual(crash.end, { x: 0, y: 3, d: 1 });
  assert.equal(r.crashed, false);
});

test('simulate: driving off the map is its own event', () => {
  const r = simulate(MISSIONS[0], ['left', 'forward']);
  assert.equal(r.steps.at(-1).event, 'offmap');
});

test('simulate: the sample counts once', () => {
  const r = simulate(MISSIONS[0], ['forward', 'forward']);
  assert.equal(r.gotSample, true);
  assert.equal(r.steps[1].sample, true);
});

test('parse: commands, forward(n), comments and blank lines', () => {
  const p = parseProgram('# plan\nforward(3)\n\nright()\nforward()');
  assert.equal(p.ok, true);
  assert.deepEqual(p.cmds.map((c) => c.cmd), ['forward', 'forward', 'forward', 'right', 'forward']);
  assert.deepEqual(p.cmds.map((c) => c.line), [1, 1, 1, 3, 4]);
  assert.equal(p.lines, 3);
});

test('parse: plain English is rejected and flagged as English', () => {
  const p = parseProgram('go to the flag');
  assert.equal(p.ok, false);
  assert.equal(p.error.line, 0);
  assert.equal(p.error.plainEnglish, true);
});

test('parse: helpful hints for near misses', () => {
  assert.match(parseProgram('Forward()').error.hint, /capital letters/);
  assert.match(parseProgram('forward').error.hint, /brackets: forward\(\)/);
  assert.match(parseProgram('left(2)').error.hint, /does not take a number/);
  assert.match(parseProgram('forward(0)').error.hint, /1 to 20/);
});

test('groups, lineCount and toPython', () => {
  const cmds = ['forward', 'forward', 'forward', 'right', 'right', 'forward'];
  assert.deepEqual(groups(cmds), [['forward', 3], ['right', 2], ['forward', 1]]);
  assert.equal(lineCount(cmds), 4);
  assert.equal(toPython(cmds).split('\n').slice(3).join('|'), 'forward(3)|right()|right()|forward()');
});

test('report: plain checks, no points', () => {
  const m = MISSIONS[0];
  const route = shortestRoute(m);
  const items = report(m, simulate(m, route), { cmds: route, runs: 1, lines: 0 });
  assert.equal(items.length, 3);
  assert.ok(items.every((i) => i.ok));
  assert.ok(items.every((i) => !/star|point|xp/i.test(i.text)));
});
