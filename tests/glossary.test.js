import test from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARY, findTerms, lookupTerm } from '../js/glossary.js';

const ids = (text, seen) => findTerms(text, seen).filter((s) => s.id).map((s) => `${s.id}:${s.text}`);

test('every glossary entry is complete and unique', () => {
  const seen = new Set();
  for (const g of GLOSSARY) {
    assert.ok(g.id && g.term && g.short, `${g.id} has id, term and short`);
    assert.ok(!seen.has(g.id), `${g.id} is unique`);
    seen.add(g.id);
    assert.ok(g.match.length || g.re, `${g.id} can be found in text`);
  }
});

test('findTerms keeps the text intact', () => {
  const text = 'Add commands to your program, then press Run.';
  assert.equal(findTerms(text).map((s) => s.text).join(''), text);
});

test('longest phrase wins and whole words only', () => {
  assert.deepEqual(ids('forward(3) moves 3 squares'), ['argument:forward(3)', 'square:squares']);
  assert.deepEqual(ids('A programming language like Python'), ['programming-language:programming language', 'python:Python']);
  assert.deepEqual(ids('programming is fun'), ['programming:programming']);
  assert.deepEqual(ids('reprogrammed it'), []);
});

test('case is ignored but the original text is kept', () => {
  assert.deepEqual(ids('MISSION CONTROL // What is programming?'), ['mission-control:MISSION CONTROL', 'programming:programming']);
});

test('a word is marked once per seen set', () => {
  const seen = new Set();
  assert.deepEqual(ids('T+01  forward()', seen), ['mission-time:T+01', 'brackets:forward()']);
  assert.deepEqual(ids('T+02  forward()', seen), []);
});

test('lookupTerm finds entries by id, term or phrase', () => {
  assert.equal(lookupTerm('telemetry')?.id, 'telemetry');
  assert.equal(lookupTerm('Rock sample')?.id, 'rock-sample');
  assert.equal(lookupTerm('light-minutes')?.id, 'light-minute');
  assert.equal(lookupTerm('banana'), null);
});
