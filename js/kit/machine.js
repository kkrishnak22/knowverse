// "The computer reads your program": a 2D picture of a computer that takes one line at a time.
// Each click of "Next step" does one small thing — read a line, show text on the screen, or write
// a value in memory — so the student sees the read → do → next rhythm of every program.
// The steps come from really running the code (js/kit/python.js), so any simple program works.
//
//   ```kv-machine
//   #! title: The computer reads one line at a time
//   print("Boil water")
//   price = 40
//   ```

import { h, icon, esc, whenVisible } from '../ui.js';
import { highlightLine } from './editor.js';
import { trace } from './python.js';
import { parseBlock } from './lab.js';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const clean = (line) => line.replace(/\s+#.*$/, '').trim();

/** Turn tracer steps into small phases: read a line, then each thing that line caused. */
export function phasesOf(run, code) {
  const lines = code.split('\n');
  const phases = [];
  const { steps } = run;
  for (let k = 0; k < steps.length - 1; k++) {
    const cur = steps[k];
    const next = steps[k + 1];
    if (!cur.line) continue;
    phases.push({ type: 'read', line: cur.line, text: clean(lines[cur.line - 1] || '') });
    const before = new Map(cur.frames.flatMap((f) => f.vars).map(([n, id]) => [n, cur.heap[id]?.repr]));
    let did = false;
    for (const [name, id] of next.frames.flatMap((f) => f.vars)) {
      const value = next.heap[id]?.repr;
      if (next.heap[id]?.kind === 'function') continue;
      if (!before.has(name) || before.get(name) !== value) {
        phases.push({ type: 'store', line: cur.line, name, value, changed: before.has(name) });
        did = true;
      }
    }
    const printed = next.out.slice(cur.out.length);
    if (printed) {
      phases.push({ type: 'print', line: cur.line, text: printed.replace(/\n$/, '') });
      did = true;
    }
    if (!did) phases.push({ type: 'do', line: cur.line });
  }
  if (run.error) phases.push({ type: 'error', line: run.error.line, text: `${run.error.type}: ${run.error.message}` });
  else phases.push({ type: 'end' });
  return phases;
}


function captionOf(ph) {
  switch (ph.type) {
    case 'read': return `The computer <b>reads line ${ph.line}</b>: <code>${esc(ph.text)}</code>`;
    case 'print': return `It does it: <b>${esc(ph.text)}</b> appears on the <b>screen</b>.`;
    case 'store': return ph.changed
      ? `It does it: in <b>memory</b>, <code>${esc(ph.name)}</code> changes to <b>${esc(ph.value)}</b>.`
      : `It does it: it writes <b>${esc(ph.value)}</b> in <b>memory</b> and names it <code>${esc(ph.name)}</code>.`;
    case 'do': return 'It does exactly what the line says. Then it moves to the next line.';
    case 'error': return `The computer cannot do this line, so it <b>stops</b>. ${esc(ph.text)}`;
    default: return 'No more lines. <b>The program stops.</b>';
  }
}

export function mountMachine(el, src) {
  const { opts, code } = parseBlock(src);
  const lines = code.split('\n');
  let phases = null;
  let at = -1; // index of the last phase shown
  let busy = false;
  let disposed = false;

  const readerText = h('div', { class: 'kvm-reader-text' });
  const reader = h('div', { class: 'kvm-part kvm-cpu', title: 'Processor: the part of the computer that reads one line and does it' },
    h('div', { class: 'kvm-label' }, icon('cpu'), 'Processor', h('span', {}, 'reads one line, then does it')), readerText);
  const memList = h('div', { class: 'kvm-mem-list' });
  const memory = h('div', { class: 'kvm-part kvm-mem', title: 'Memory: where the computer remembers values while the program runs' },
    h('div', { class: 'kvm-label' }, icon('layers'), 'Memory', h('span', {}, 'remembers values')), memList);
  const screenOut = h('div', { class: 'kvm-screen-out' });
  const screen = h('div', { class: 'kvm-part kvm-screen', title: 'Screen: where the computer shows things to you' },
    h('div', { class: 'kvm-label' }, icon('panel'), 'Screen', h('span', {}, 'shows output')), h('div', { class: 'kvm-monitor' }, screenOut), h('div', { class: 'kvm-stand' }));
  const caption = h('div', { class: 'kvm-caption', 'aria-live': 'polite' }, 'Getting Python ready…');
  const nextLabel = h('span', {}, 'Next step');
  const nextBtn = h('button', { class: 'kv-next guide', type: 'button', disabled: true, onclick: () => next() }, nextLabel, icon('chevron'));
  const backBtn = h('button', { class: 'kv-ctl', type: 'button', title: 'Back one step', 'aria-label': 'Back one step', onclick: () => show(at - 1) }, icon('chevronLeft'));
  const resetBtn = h('button', { class: 'kv-ctl', type: 'button', title: 'Start again', 'aria-label': 'Start again', onclick: () => show(-1) }, icon('undo'));
  const count = h('span', { class: 'kv-steplabel' });
  const codeLines = lines.map((l, i) => h('div', { class: 'kvm-line', html: `<span class="kvm-num">${i + 1}</span><span class="kvm-src">${highlightLine(l) || ' '}</span>` }));

  el.classList.add('kv-machine');
  el.replaceChildren(
    h('div', { class: 'kvm-stage' },
      h('div', { class: 'kvm-computer' }, reader, h('div', { class: 'kvm-row' }, memory, screen)),
      caption,
      h('div', { class: 'kv-controls' }, resetBtn, backBtn, nextBtn, count),
    ),
    h('div', { class: 'kvm-code' },
      h('div', { class: 'kv-lab-head' }, h('span', { class: 'kv-lab-title' }, icon('code'), opts.title || 'The program')),
      h('div', { class: 'kvm-lines' }, codeLines),
      h('p', { class: 'kvm-note' }, 'The computer takes the lines from here, one at a time, top to bottom.'),
    ),
  );

  /** Fly a small copy of `text` from one element to another. */
  function fly(from, to, text, cls = '') {
    if (reduceMotion() || disposed) return Promise.resolve();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const chip = h('div', { class: `kvm-fly ${cls}` }, text);
    document.body.append(chip);
    const w = chip.offsetWidth;
    const hgt = chip.offsetHeight;
    const start = { x: a.left + a.width / 2 - w / 2, y: a.top + a.height / 2 - hgt / 2 };
    const end = { x: b.left + b.width / 2 - w / 2, y: b.top + b.height / 2 - hgt / 2 };
    chip.style.transform = `translate(${start.x}px, ${start.y}px) scale(1)`;
    return new Promise((done) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        chip.classList.add('go');
        chip.style.transform = `translate(${end.x}px, ${end.y}px) scale(0.92)`;
        setTimeout(() => {
          chip.remove();
          done();
        }, 620);
      }));
    });
  }

  /** Draw everything as it is after phase `i`. `flash` marks the part the last phase touched. */
  function draw(i, flash = true) {
    const mem = new Map();
    const out = [];
    let line = null;
    let reading = '';
    const doneLines = new Set();
    for (let k = 0; k <= i; k++) {
      const ph = phases[k];
      if (ph.type === 'read') {
        if (line) doneLines.add(line);
        line = ph.line;
        reading = ph.text;
      } else if (ph.type === 'store') mem.set(ph.name, ph.value);
      else if (ph.type === 'print') out.push(...ph.text.split('\n'));
      else if (ph.type === 'end') {
        if (line) doneLines.add(line);
        line = null;
        reading = '';
      }
    }
    const ph = phases[i];
    codeLines.forEach((n, idx) => {
      n.classList.toggle('active', idx + 1 === line);
      n.classList.toggle('done', doneLines.has(idx + 1) && idx + 1 !== line);
      n.classList.toggle('error', ph?.type === 'error' && idx + 1 === ph.line);
    });
    readerText.innerHTML = reading ? highlightLine(reading) : '<span class="kvm-idle">waiting for a line</span>';
    reader.classList.toggle('busy', Boolean(reading));
    memList.replaceChildren(...(mem.size
      ? [...mem].map(([name, value]) => h('div', { class: `kvm-slot ${flash && ph?.type === 'store' && ph.name === name ? 'flash' : ''}`, title: `The name ${name} points to the value ${value}` }, h('span', { class: 'kvm-name' }, name), h('span', { class: 'kvm-val' }, value)))
      : [h('div', { class: 'kvm-empty' }, 'empty')]));
    screenOut.replaceChildren(...(out.length ? out.map((t, k) => h('div', { class: flash && ph?.type === 'print' && k >= out.length - ph.text.split('\n').length ? 'flash' : '' }, t || ' ')) : [h('div', { class: 'kvm-empty' }, 'nothing yet')]));
    for (const [part, type] of [[reader, 'read'], [memory, 'store'], [screen, 'print']]) part.classList.toggle('lit', flash && ph?.type === type);
    if (i >= 0) caption.innerHTML = captionOf(ph);
    const ended = i >= phases.length - 1;
    nextLabel.textContent = ended ? 'Start again' : i < 0 ? 'Read line 1' : phases[i + 1].type === 'read' ? `Read line ${phases[i + 1].line}` : phases[i + 1].type === 'end' ? 'Next step' : 'Do it';
    if (i < 0) caption.innerHTML = `Click <b>${esc(nextLabel.textContent)}</b>. The computer will read the first line.`;
    nextBtn.title = ended ? 'Go back to the start' : 'Do the next small step';
    backBtn.disabled = resetBtn.disabled = i < 0;
    count.textContent = i < 0 ? `${lines.filter((l) => l.trim()).length} lines` : `Step ${i + 1} of ${phases.length}`;
  }

  function show(i) {
    if (!phases || busy) return;
    at = Math.max(-1, Math.min(phases.length - 1, i));
    draw(at);
  }

  async function next() {
    if (!phases || busy) return;
    nextBtn.classList.remove('guide');
    if (at >= phases.length - 1) return show(-1);
    busy = true;
    const ph = phases[at + 1];
    if (ph.type === 'read') await fly(codeLines[ph.line - 1].querySelector('.kvm-src'), readerText, ph.text);
    else if (ph.type === 'print') await fly(readerText, screenOut, ph.text, 'out');
    else if (ph.type === 'store') await fly(readerText, memList, `${ph.name} = ${ph.value}`, 'mem');
    busy = false;
    if (disposed) return;
    at++;
    draw(at);
  }

  async function start() {
    try {
      const run = await trace(code, { inputs: opts.inputs ? opts.inputs.split('|').map((s) => s.trim()) : [], onStatus: (s) => (caption.textContent = s) });
      if (disposed) return;
      phases = phasesOf(run, code);
      nextBtn.disabled = false;
      draw(-1);
    } catch (err) {
      caption.textContent = `Couldn’t start Python: ${err.message}. Check your internet connection and reload.`;
    }
  }

  const stopWaiting = whenVisible(el, start);

  return () => {
    disposed = true;
    stopWaiting();
    document.querySelectorAll('.kvm-fly').forEach((n) => n.remove());
  };
}
