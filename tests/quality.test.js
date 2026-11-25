// The basics, enforced. Each test is one rule from docs/QUALITY.md that can be checked from the
// source alone, so a regression fails `npm run check` (and blocks the deploy) instead of waiting
// for someone to notice. The live-page rules run in the browser with ?audit (js/engine/audit.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const css = Object.fromEntries(readdirSync('css').filter((f) => f.endsWith('.css')).map((f) => [f, readFileSync(join('css', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')]));

/** Top-level rules (outside @media / @supports / @keyframes), as [selector, body]. */
function topRules(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  let selector = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) {
        selector = text.slice(start, i).trim();
        start = i + 1;
      }
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        if (!selector.startsWith('@')) out.push([selector, text.slice(start, i)]);
        start = i + 1;
      }
    }
  }
  return out;
}

test('motion.snap: open/close states animate instead of switching display:none', () => {
  const snaps = [];
  for (const [file, text] of Object.entries(css)) {
    for (const [sel, body] of topRules(text)) {
      if (/\.[\w-]*(collapsed|closed|expanded)\b/.test(sel) && /display:\s*none/.test(body)) snaps.push(`${file}: ${sel}`);
    }
  }
  assert.deepEqual(snaps, [], 'these snap shut; fade and resize them instead (docs/ENGINEERING.md §2b)');
});

test('motion.costly-loop: endless animations move only transform and opacity', () => {
  const all = Object.values(css).join('\n');
  const keyframes = Object.fromEntries([...all.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)].map((m) => [m[1], m[2]]));
  const bad = [];
  for (const m of all.matchAll(/animation:\s*([\w-]+)[^;]*\binfinite\b/g)) {
    const frames = keyframes[m[1]];
    assert.ok(frames, `@keyframes ${m[1]} exists`);
    const props = [...frames.matchAll(/([\w-]+)\s*:/g)].map((p) => p[1]);
    const other = props.filter((p) => !['transform', 'opacity'].includes(p));
    if (other.length) bad.push(`${m[1]} animates ${[...new Set(other)].join(', ')}`);
  }
  assert.deepEqual(bad, [], 'an endless animation that is not transform/opacity repaints every frame');
});

test('motion.bare-transition: no `transition: <time>` that animates every property', () => {
  const bare = Object.entries(css).flatMap(([f, t]) => [...t.matchAll(/transition:\s*[0-9.]+m?s\s*[;}]/g)].map((m) => `${f}: ${m[0]}`));
  assert.deepEqual(bare, []);
});

test('motion.reduce: people who ask for less motion get it', () => {
  assert.match(css['styles.css'], /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

// ---------- loading: heavy code never rides along with the first page ----------

const staticImports = (file) => [...readFileSync(file, 'utf8').matchAll(/^\s*import\s[^'"]*['"](\.[^'"]+)['"]/gm)].map((m) => resolve(dirname(file), m[1]));

test('load.heavy-before-ask: the 3D engine and Python are never loaded with the first page', () => {
  const seen = new Set();
  const queue = [resolve('js/app.js')];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    queue.push(...staticImports(f));
  }
  // The 3D engine, Python, and each lesson block's code (loaded per block by js/kit/blocks.js).
  const heavy = [...seen].filter((f) => /vendor[\\/]three\.js$|[\\/]scene\.js$|memoryScene\.js$|kit[\\/](rover|lab|machine|robot|tea|predict)\.js$/.test(f));
  assert.deepEqual(heavy, [], 'these must be loaded with import() when the visitor asks for them');
  const sources = [...seen].map((f) => readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(sources, /^\s*import\s[^\n]*pyodide/m, 'Pyodide is loaded with import() on demand');
});
