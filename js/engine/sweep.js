// Scenario sweep: plays a page the way a real visitor does and runs the quality audit after every
// step, so basic bugs (a message hidden behind a bar, a note off-screen, a panel that overflows)
// are found by a script instead of by the owner.
//
//   Open the page with ?sweep before the # (e.g. /?sweep#/note/programming/universe).
//   It runs once, shows a summary panel, and leaves the full result in window.__sweep.
//
// One run covers one screen size. Run it at every size in SIZES (docs/QUALITY.md):
// layout bugs only appear at the size where they happen.
//
// Each step can also state what must be true ("the empty-program note is on screen"). A step
// fails if that expectation fails or the audit reports a "fail". Every bug found by hand becomes
// a new step or a new audit rule, so it can never come back unnoticed.

import { runAudit, markInteraction, ensureStyle } from './audit.js';

export const SIZES = [[1920, 1080], [1366, 768], [1083, 622], [375, 812]];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => document.querySelector(s);
async function waitFor(test, ms = 6000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (test()) return true;
    await sleep(100);
  }
  return false;
}

/** The element is drawn and fully inside the window. */
function onScreen(el) {
  if (!el || !el.getClientRects().length) return false;
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && Number(s.opacity) > 0.5 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1;
}

function press(key) {
  markInteraction();
  (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}
function click(el) {
  markInteraction();
  el?.click();
}

// ---------- scenarios, per page ----------

/** The Programming Universe page and its rover game (Mission Control). */
async function roverSweep(step) {
  const M = await import('../kit/rover/missions.js');
  const game = () => q('.kvx');
  const focusGame = () => game()?.focus({ preventScroll: true });
  const running = () => q('.kvx-fab.run')?.disabled && !q('.kvx-dock.open');

  await step('page: cover before anything loads', () => ({
    'cover is shown': Boolean(q('.kvx.covered .kvx-cover')),
    'no 3D engine downloaded': !performance.getEntriesByType('resource').some((r) => /three\.js|rover\/scene\.js/.test(r.name)),
  }));

  click(q('.kvx-cover-play'));
  await waitFor(() => game()?.classList.contains('focus') && q('.kvx canvas'), 8000);
  await sleep(600);
  // Fastest speed keeps the sweep short; every message still appears.
  const speed = q('.kvx-speed input');
  if (speed) (speed.value = '2'), speed.dispatchEvent(new Event('input', { bubbles: true }));
  await step('game: opened full screen', () => ({
    'focus mode is on': game().classList.contains('focus'),
    '3D view is drawn': Boolean(q('.kvx canvas')),
    'Run is on screen': onScreen(q('.kvx-fab.run')),
  }));

  focusGame();
  click(q('.kvx-run'));
  await sleep(350);
  await step('Run with an empty program', () => ({
    'the empty-program note is on screen': onScreen(q('.kvx-inline-hint')),
  }));

  // Into a rock: right, forward, left, forward (mission 1 has a rock at square 2 of row 4).
  focusGame();
  for (const k of ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowUp']) press(k);
  press('Enter');
  await step('run into a rock (checked while it runs)', null, { during: running });
  await step('after the crash', () => ({ 'telemetry shows an ERROR line': /ERROR/.test(q('.kvx-log')?.textContent || '') }));

  // Off the map: reset, clear, turn left (west) and drive off the edge.
  focusGame();
  press('r');
  for (let i = 0; i < 8; i++) press('Backspace');
  for (const k of ['ArrowLeft', 'ArrowUp']) press(k);
  press('Enter');
  await step('drive off the map (checked while it runs)', null, { during: running });

  // Win mission 1 and open the checkpoint.
  focusGame();
  press('r');
  for (let i = 0; i < 8; i++) press('Backspace');
  const keys = { forward: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight' };
  for (const c of M.shortestRoute(M.MISSIONS[0])) press(keys[c]);
  press('Enter');
  await step('winning run (checked while it runs)', null, { during: running });
  await waitFor(() => q('.kvx-dock.open'), 6000);
  await sleep(600);
  await step('checkpoint panel after a win', () => ({
    'checkpoint panel is open': Boolean(q('.kvx-dock.open')),
    'all answers are on screen': [...document.querySelectorAll('.kvx-answer')].every(onScreen),
  }));

  const answers = [...document.querySelectorAll('.kvx-answer')];
  click(answers.find((b, i) => i === M.MISSIONS[0].check.answer));
  await sleep(500);
  await step('checkpoint answered', () => ({ 'Next mission is on screen': onScreen([...document.querySelectorAll('.kvx-dock .kvx-run')][0]) }));

  focusGame();
  press('Escape');
  await sleep(600);
  await step('checkpoint folded to the pill', () => ({ 'the pill is on screen': onScreen(q('.kvx-dock-pill')) }));

  // Switch language inside the game, then back.
  const lang = [...document.querySelectorAll('.kvx-head-right .kvx-tool')].find((b) => /Telugish|English/.test(b.textContent + b.title));
  click(lang);
  await sleep(700);
  await step('game in Telugish', () => ({ 'still in the game': game().classList.contains('focus'), 'the text changed': /Nee|Mission 1 \//.test(game().textContent) }));
  click([...document.querySelectorAll('.kvx-head-right .kvx-tool')].find((b) => /Telugish|English/.test(b.textContent + b.title)));
  await sleep(500);

  // The demo: check the caption and cursor while it plays, then skip it.
  click(q('.kvx-tabs .kvx-tab'));
  await sleep(500);
  focusGame();
  press('?');
  await step('how-to-play demo (checked while it plays)', null, { during: () => game().classList.contains('demoing'), for: 7000 });
  focusGame();
  press('Escape');
  await sleep(600);
  await step('demo skipped with Esc', () => ({ 'the demo has stopped': !game().classList.contains('demoing'), 'the program was reset': !document.querySelector('.kvx-program .kvx-chip') }));

  focusGame();
  press('Escape');
  await sleep(800);
  await step('back on the page', () => ({ 'focus mode is off': !game().classList.contains('focus'), 'game is back in the page': Boolean(q('.prose .kvx')) }));
}

const SWEEPS = { 'programming/universe': roverSweep };

// ---------- runner ----------

export async function runSweep() {
  const page = location.hash.replace(/^#\/(note|learn)\//, '');
  const scenario = SWEEPS[page];
  const result = { page, size: [innerWidth, innerHeight], steps: [], done: false };
  window.__sweep = result;
  if (!scenario) {
    result.error = `No sweep for "${page}". Add one to SWEEPS in js/engine/sweep.js.`;
    result.done = true;
    return result;
  }
  const findingsNow = () => runAudit({ quiet: true }).findings.filter((f) => !/^perf\./.test(f.rule));

  /** Run checks for a step: the audit (once, or repeatedly while `during` holds) plus expectations. */
  async function step(name, expect, opts = {}) {
    const seen = new Map();
    const collect = () => findingsNow().forEach((f) => seen.set(`${f.rule}|${f.what}`, f));
    if (opts.during) {
      const end = performance.now() + (opts.for || 9000);
      await sleep(150);
      while (performance.now() < end && opts.during()) {
        collect();
        await sleep(250);
      }
    }
    collect();
    const expectations = expect ? Object.entries(expect()) : [];
    const failed = expectations.filter(([, ok]) => !ok).map(([what]) => what);
    const findings = [...seen.values()];
    result.steps.push({ name, ok: !failed.length && !findings.some((f) => f.level === 'fail'), failed, findings: findings.map((f) => `${f.level} ${f.rule}: ${f.what}${f.where.length ? ` | ${f.where.join(' · ')}` : ''}`) });
  }

  try {
    await scenario(step);
  } catch (err) {
    result.error = String(err?.stack || err);
  }
  result.ok = !result.error && result.steps.every((s) => s.ok && !s.findings.length);
  result.done = true;
  render(result);
  return result;
}

function render(result) {
  ensureStyle();
  const panel = document.createElement('aside');
  panel.className = 'audit-panel';
  const head = document.createElement('div');
  head.className = 'audit-head';
  const bad = result.steps.filter((s) => !s.ok || s.findings.length).length;
  head.textContent = `Sweep ${result.size.join('×')} · ${result.steps.length} steps · ${bad ? `${bad} with problems` : 'all clean'}`;
  const list = document.createElement('ol');
  for (const s of result.steps) {
    const li = document.createElement('li');
    li.className = s.ok && !s.findings.length ? '' : s.ok ? 'warn' : 'fail';
    const b = document.createElement('b');
    b.textContent = `${s.ok && !s.findings.length ? '✓' : '✗'} ${s.name}`;
    li.append(b);
    for (const line of [...s.failed.map((f) => `expected: ${f}`), ...s.findings]) {
      const small = document.createElement('small');
      small.textContent = line;
      li.append(small);
    }
    list.append(li);
  }
  if (result.error) {
    const li = document.createElement('li');
    li.className = 'fail';
    li.textContent = result.error;
    list.append(li);
  }
  panel.append(head, list);
  document.body.append(panel);
}
