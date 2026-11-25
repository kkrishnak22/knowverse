import test from 'node:test';
import assert from 'node:assert/strict';
import { translator, pick, getLang } from '../js/i18n.js';
import { STRINGS } from '../js/kit/rover/strings.js';
import { MISSIONS, DEFINITION_TE, definition, localizeMission, parseProgram, report, simulate, shortestRoute } from '../js/kit/rover/missions.js';
import { GLOSSARY, wordText } from '../js/glossary.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEARN_STRINGS } from '../js/views/learnStrings.js';

/** Every key (and nested key) of `a` exists in `b` with the same kind of value. */
function sameShape(a, b, path = '') {
  for (const [k, v] of Object.entries(a)) {
    const p = `${path}${k}`;
    assert.ok(k in b, `Telugish is missing "${p}"`);
    assert.equal(typeof b[k], typeof v, `"${p}" has the same kind of value`);
    if (Array.isArray(v)) assert.equal(b[k].length, v.length, `"${p}" has as many items`);
    else if (v && typeof v === 'object') sameShape(v, b[k], `${p}.`);
  }
}

test('the default language is English', () => {
  assert.equal(getLang(), 'en');
});

test('translator falls back to English and fills in numbers', () => {
  const t = translator({ en: { hi: 'Hello', n: (x) => `${x} steps`, only: 'English only' }, te: { hi: 'Bavunnava' } });
  assert.equal(t('hi'), 'Hello');
  assert.equal(t('n', 3), '3 steps');
  assert.equal(t('only'), 'English only');
  assert.equal(pick({ en: 'a', te: 'b' }), 'a');
});

test('every Mission Control string has a Telugish line', () => {
  sameShape(STRINGS.en, STRINGS.te);
});

test('every mission has Telugish text with the same answers', () => {
  for (const m of MISSIONS) {
    const te = localizeMission(m, 'te');
    assert.ok(te.title && te.brief && te.part && te.check.q, `${m.title} has Telugish`);
    assert.equal(te.check.options.length, m.check.options.length);
    assert.equal(te.check.wrong.length, m.check.wrong.length);
    assert.equal(te.check.answer, m.check.answer, 'the right answer stays the same');
    assert.deepEqual(te.start, m.start, 'the rules are untouched');
  }
});

test('the Telugish definition keeps the parts in mission order', () => {
  assert.deepEqual(DEFINITION_TE.filter((p) => typeof p === 'number'), [0, 1, 2, 3]);
  assert.equal(definition('te'), DEFINITION_TE);
});

test('rule messages come in Telugish too', () => {
  assert.match(parseProgram('forward', 'te').error.hint, /brackets kaavaali: forward\(\)/);
  assert.match(parseProgram('go to the flag', 'te').error.message, /Line 1 lo SyntaxError/);
  const m = MISSIONS[0];
  const items = report(m, simulate(m, shortestRoute(m)), { cmds: shortestRoute(m), runs: 1, lines: 0 }, 'te');
  assert.equal(items[0].text, 'Flag daaka cherindi');
});

test('every glossary word has Telugish', () => {
  for (const g of GLOSSARY) {
    assert.ok(g.te?.short, `${g.id} has a Telugish meaning`);
    assert.notEqual(wordText(g, 'te').short, g.short);
  }
});

test('every Learn screen string has a Telugish line', () => {
  sameShape(LEARN_STRINGS.en, LEARN_STRINGS.te);
});

// A Telugish note (<name>.te.md) must keep the English note's structure: the same "## " sections
// (the lesson tabs) and the same kit blocks with the same code, in the same order.
function* files(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (e.name.endsWith('.te.md')) yield p;
  }
}
const sections = (md) => [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
const blocks = (md) => [...md.matchAll(/^```(kv-[\w-]+)\n([\s\S]*?)^```/gm)].map((m) => ({ kind: m[1], code: m[2].split('\n').filter((l) => /^(print|Print|[a-z_]+\s*=|for |while |if |\.|>|#)/.test(l) && !/^#!/.test(l) && !/^> /.test(l)) }));

test('Telugish notes keep the English structure', () => {
  const found = [...files('content')];
  assert.ok(found.length, 'there is at least one Telugish note');
  for (const te of found) {
    const en = readFileSync(te.replace(/\.te\.md$/, '.md'), 'utf8');
    const tx = readFileSync(te, 'utf8');
    assert.match(tx, /^---\ntitle: .+/m, `${te} has a title`);
    assert.deepEqual(sections(tx), sections(en), `${te}: same sections`);
    assert.deepEqual(blocks(tx).map((b) => b.kind), blocks(en).map((b) => b.kind), `${te}: same kit blocks`);
    assert.deepEqual(blocks(tx).map((b) => b.code), blocks(en).map((b) => b.code), `${te}: code inside blocks is unchanged`);
  }
});
