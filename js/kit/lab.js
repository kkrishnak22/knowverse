// Live Lab: type Python on the left, watch it come alive in 3D on the right.
// Modes:
//   lab   — editable; every pause in typing re-runs the code and the scene animates to the new result.
//   watch — read-only; the student clicks "Next step" to run one line at a time, narrated by the code's # comments.
// Nothing plays by itself: a pulsing button and a caption tell the student what to click.
// The picture is on the left and the code on the right.
// Both share the step controls (first / back / play / forward / last) and the "what just happened" caption.
//
// Block syntax in a lesson (Markdown):
//   ```kv-lab            or   ```kv-watch
//   #! title: Your first variable
//   #! inputs: Ravi | 20
//   age = 20   # Python makes the value 20 and sticks the name age on it
//   ```

import { h, icon, esc, whenVisible } from '../ui.js';
import { createEditor } from './editor.js';
import { trace, loadPython, pythonLoaded } from './python.js';

const HINTS = {
  NameError: 'Python doesn’t know this name yet. Check the spelling, and make sure the line that creates it runs first.',
  SyntaxError: 'Python couldn’t read this line. Look for a missing bracket, quote or colon.',
  IndentationError: 'The spaces at the start of the line don’t match. Lines inside the same block need the same indent.',
  TypeError: 'Two values of types that don’t mix, like adding text to a number. Convert one with int() or str().',
  ZeroDivisionError: 'Dividing by zero has no answer, so Python stops.',
  ValueError: 'The type is right but the value isn’t — for example int("hello").',
  IndexError: 'That position doesn’t exist in the list. Positions start at 0.',
  StepLimit: 'Your program ran for a very long time. A while loop whose condition never becomes False runs forever.',
};

/** Parse "#! key: value" header lines off a block. */
export function parseBlock(src) {
  const opts = {};
  const lines = [];
  for (const line of String(src).split('\n')) {
    const m = line.match(/^#!\s*([\w-]+)\s*:\s*(.*)$/);
    if (m && !lines.length) opts[m[1]] = m[2].trim();
    else lines.push(line);
  }
  return { opts, code: lines.join('\n').replace(/\s+$/, '') };
}

const commentOf = (code, line) => {
  const text = code.split('\n')[line - 1] || '';
  const m = text.match(/#\s*(.+)$/);
  return m && !/^\s*#!/.test(text) ? m[1].trim() : '';
};

const strip = (s) => s.replace(/#.*$/, '').trim();

/** Describe in plain words what changed between two steps. */
export function describe(prev, cur, code) {
  if (!cur) return '';
  if (!prev) return cur.event === 'end' ? 'Done.' : `Click <b>Run line ${cur.line}</b>. Python will run that line and nothing else.`;
  const msgs = [];
  const ran = prev.line;
  const note = ran ? commentOf(code, ran) : '';
  const scope = (s) => new Map((s.frames.at(-1)?.vars || []).map(([n, id]) => [n, id]));
  const p = scope(prev);
  const c = scope(cur);
  const val = (s, id) => esc(s.heap[id]?.repr ?? '?');
  if (cur.frames.length > prev.frames.length) msgs.push(`Calling ${cur.frames.at(-1).name}() — it gets its own space for names.`);
  else if (cur.frames.length < prev.frames.length) msgs.push(`${prev.frames.at(-1).name}() finished, and its names are gone.`);
  else {
    for (const [name, id] of c) {
      if (!p.has(name)) msgs.push(`New name **${esc(name)}** → ${val(cur, id)}`);
      else if (p.get(name) !== id) msgs.push(`**${esc(name)}** now points to ${val(cur, id)} (was ${val(prev, p.get(name))})`);
      else if (prev.heap[id] && cur.heap[id] && prev.heap[id].repr !== cur.heap[id].repr) msgs.push(`The ${cur.heap[id].kind} that **${esc(name)}** points to changed: ${val(cur, id)}`);
    }
    const stillUsed = new Set([...c.values()]);
    for (const [, id] of p) {
      if (!stillUsed.has(id) && ![...cur.frames].some((f) => f.vars.some(([, x]) => x === id))) {
        msgs.push(`Nothing points to ${val(prev, id)} any more, so Python can throw it away.`);
        break;
      }
    }
  }
  const newOut = cur.out.slice(prev.out.length);
  if (newOut) msgs.push(`Printed: ${esc(JSON.stringify(newOut.replace(/\n$/, '')))}`);
  if (cur.event === 'return' && cur.frames.length > 1) msgs.push(`${esc(cur.frames.at(-1).name)}() is handing its result back to the line that called it.`);
  if (!msgs.length && ran) msgs.push(`Ran line ${ran}: ${esc(strip(code.split('\n')[ran - 1] || ''))}`);
  return [note && `<b>${esc(note)}</b>`, msgs.join(' · ')].filter(Boolean).join('<br>');
}

const md = (s) => s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

export function mountLab(el, src, { mode = 'lab' } = {}) {
  const { opts, code: initial } = parseBlock(src);
  const watch = mode === 'watch';
  const inputs = opts.inputs ? opts.inputs.split('|').map((s) => s.trim()) : [];
  let run = null; // { steps, error }
  let index = 0;
  let timer = null;
  let scene = null;
  let disposed = false;
  let lastCode = null;

  const status = h('span', { class: 'kv-status' }, 'Python not loaded');
  const consoleOut = h('pre', { class: 'kv-console-out' });
  const consoleErr = h('div', { class: 'kv-console-err' });
  const caption = h('div', { class: 'kv-caption', 'aria-live': 'polite' });
  const stepLabel = h('span', { class: 'kv-steplabel' });
  const range = h('input', { type: 'range', min: '0', max: '0', value: '0', 'aria-label': 'Step', oninput: (e) => go(+e.target.value) });
  const playBtn = h('button', { class: 'kv-ctl', type: 'button', title: 'Play all the steps', 'aria-label': 'Play all the steps', onclick: () => (timer ? pause() : play()) }, icon('play'));
  const nextLabel = h('span', {}, 'Next step');
  const nextBtn = h('button', { class: 'kv-next guide', type: 'button', title: 'Run the next line', onclick: () => {
    nextBtn.classList.remove('guide');
    if (!run) return;
    if (index >= run.steps.length - 1) restart();
    else go(index + 1);
  } }, nextLabel, icon('chevron'));
  const editHint = !watch && h('div', { class: 'kv-edit-hint', title: 'This code is yours to change' }, icon('edit'), 'Change this code. The picture updates.');
  const stageBox = h('div', { class: 'kv-stage-canvas' });
  const overlay = h('div', { class: 'kv-overlay' }, h('div', { class: 'orbit' }), h('p', {}, 'Python wakes up when you scroll here'));

  const editor = createEditor({
    value: initial,
    readOnly: watch,
    onChange: (v) => {
      editHint?.remove();
      clearTimeout(editTimer);
      editTimer = setTimeout(() => execute(v, { live: true }), 650);
    },
  });
  let editTimer;

  const ctl = (name, label, fn) => h('button', { class: 'kv-ctl', type: 'button', title: label, 'aria-label': label, onclick: fn }, icon(name));

  el.classList.add('kv-lab', watch ? 'is-watch' : 'is-lab');
  el.replaceChildren(
    h('div', { class: 'kv-lab-code' },
      h('div', { class: 'kv-lab-head' },
        h('span', { class: 'kv-lab-title' }, icon(watch ? 'eye' : 'code'), opts.title || (watch ? 'Watch it run' : 'Live Lab')),
        status,
        !watch && h('button', { class: 'btn ghost small-btn', type: 'button', title: 'Put the original code back', onclick: () => {
          editor.setValue(initial);
          execute(initial, { live: true });
        } }, icon('undo'), 'Reset'),
      ),
      editor.el,
      editHint,
      h('div', { class: 'kv-console', title: 'Everything your program prints appears here' }, h('div', { class: 'kv-console-head' }, 'Output'), consoleOut, consoleErr),
    ),
    h('div', { class: 'kv-lab-stage' },
      stageBox,
      overlay,
      h('div', { class: 'kv-hud' },
        ctl('minus', 'Zoom out', () => scene?.zoomBy(0.85)),
        ctl('plus', 'Zoom in', () => scene?.zoomBy(1.18)),
        ctl('fit', 'Reset view', () => scene?.resetView()),
      ),
      caption,
      h('div', { class: 'kv-controls' },
        ctl('undo', 'First step', () => go(0)),
        ctl('chevronLeft', 'Back one step', () => go(index - 1)),
        nextBtn,
        playBtn,
        ctl('skip', 'Last step', () => go((run?.steps.length || 1) - 1)),
        range,
        stepLabel,
      ),
    ),
  );

  function setStatus(text, kind = '') {
    status.textContent = text;
    status.className = `kv-status ${kind}`;
  }

  function render(animate = true) {
    if (!run?.steps.length) return;
    const step = run.steps[index];
    const last = index === run.steps.length - 1;
    editor.setActiveLine(step.line || null);
    scene?.show(step, { instant: !animate });
    consoleOut.textContent = step.out || '';
    consoleOut.classList.toggle('empty', !step.out);
    if (last && run.error) {
      consoleErr.innerHTML = `<b>${run.error.type}</b>${run.error.line ? ` on line ${run.error.line}` : ''}: ${esc(run.error.message)}<span>${HINTS[run.error.type] || ''}</span>`;
      editor.setErrorLine(run.error.line);
    } else consoleErr.textContent = '';
    caption.innerHTML = md(describe(run.steps[index - 1], step, lastCode)) || '&nbsp;';
    range.max = String(run.steps.length - 1);
    range.value = String(index);
    nextLabel.textContent = last ? 'Start again' : index === 0 ? `Run line ${step.line ?? 1}` : 'Next step';
    nextBtn.title = last ? 'Go back to the first line' : 'Run the next line';
    stepLabel.textContent = step.event === 'end' ? `Done · ${run.steps.length - 1} steps` : `Step ${index + 1}/${run.steps.length} · line ${step.line}`;
  }

  function go(i) {
    if (!run) return;
    pause();
    index = Math.max(0, Math.min(run.steps.length - 1, i));
    render();
  }

  function restart() {
    pause();
    scene?.clear();
    index = 0;
    render(false);
  }

  function play() {
    if (!run) return;
    nextBtn.classList.remove('guide');
    if (index >= run.steps.length - 1) restart();
    playBtn.replaceChildren(icon('pause'));
    playBtn.title = 'Pause';
    const tick = () => {
      if (disposed) return;
      if (index < run.steps.length - 1) {
        index++;
        render();
        timer = setTimeout(tick, watch ? 1500 : 850);
      } else pause();
    };
    timer = setTimeout(tick, 400);
  }

  function pause() {
    clearTimeout(timer);
    timer = null;
    playBtn.replaceChildren(icon('play'));
    playBtn.title = 'Play all the steps';
  }

  async function execute(code, { live = false } = {}) {
    if (disposed) return;
    try {
      const result = await trace(code, { inputs, onStatus: (s) => setStatus(s) });
      if (disposed) return;
      setStatus('Python ready', 'ok');
      overlay.classList.add('hidden');
      if (result.error?.type === 'SyntaxError' || result.error?.type === 'IndentationError') {
        // Keep the last good picture while the student is mid-typing; just flag the line.
        editor.setErrorLine(result.error.line);
        consoleErr.innerHTML = `<b>${result.error.type}</b> on line ${result.error.line}: ${esc(result.error.message)}<span>${HINTS[result.error.type]}</span>`;
        return;
      }
      lastCode = code;
      run = result;
      pause();
      if (watch) {
        // Wait at the first line: the student runs it by clicking "Next step".
        scene?.clear();
        index = 0;
        render(false);
      } else {
        // Live: jump straight to the result so the scene animates from the old state to the new one.
        index = run.steps.length - 1;
        render(live);
      }
    } catch (err) {
      setStatus('Python failed to load', 'warn');
      overlay.querySelector('p').textContent = `Couldn’t start Python: ${err.message}. Check your internet connection and reload.`;
    }
  }

  async function start() {
    const { MemoryScene } = await import('./memoryScene.js');
    if (disposed) return;
    scene = new MemoryScene(stageBox);
    overlay.querySelector('p').textContent = pythonLoaded() ? 'Running…' : 'Loading Python (one-time download, about 10 MB)…';
    try {
      await loadPython((s) => setStatus(s));
    } catch {
      /* execute() reports the failure */
    }
    execute(editor.getValue());
  }

  // Start Python and the 3D scene only when the lab scrolls into view.
  const stopWaiting = whenVisible(el, start);

  return () => {
    disposed = true;
    stopWaiting();
    pause();
    clearTimeout(editTimer);
    scene?.dispose();
  };
}
