// Mission Control: a Mars rover game that teaches what programming is.
//
//   ```kv-rover
//   ```
//
// Four missions each teach one part of the definition of programming. The player builds a
// program, runs it on a realistic 3D Mars landscape, and unlocks that part of the definition by
// answering a checkpoint question. A final round rebuilds the whole definition from memory and
// shows the player's own program written in Python.
//
// Learning design (see docs/LEARN_PLAN.md):
//   • Learn by doing first, then name the idea (the checkpoint follows the mission).
//   • Mission 2 is a Parsons problem: the right commands, in the wrong order.
//   • Mission 3 lets plain English fail before the real commands are introduced.
//   • Mission 4 removes live control (a 20-minute signal delay) and asks the player to predict
//     where the rover will stop before it runs: predict, then observe, then explain.
//   • Nothing plays by itself; a pulsing hint shows what to do next. No points or stars.
//
// The rules live in ./rover/missions.js (unit-tested); the 3D world in ./rover/scene.js, loaded
// only when the game scrolls into view.

import { h, fill, icon, whenVisible } from '../ui.js';
import { frameLoop, ACTIVE, IDLE } from '../engine/loop.js';
import { MISSIONS, DEFINITION, simulate, parseProgram, toPython, report } from './rover/missions.js';

const CMD = {
  forward: { label: 'forward()', ico: 'arrowUp', tip: 'Drive one square the way the rover is facing' },
  left: { label: 'left()', ico: 'turnLeft', tip: 'Turn left on the spot' },
  right: { label: 'right()', ico: 'turnRight', tip: 'Turn right on the spot' },
};
const SPEEDS = [{ label: 'Slow', ms: 820 }, { label: 'Normal', ms: 500 }, { label: 'Fast', ms: 260 }];
const SAY = {
  forward: 'Driving forward.', left: 'Turning left.', right: 'Turning right.',
  crash: 'Ouch! I only did what you told me.', offmap: 'That is off the map!', sample: 'Sample collected!',
};

// ---------------------------------------------------------------- sound

function createSound() {
  let ctx = null;
  let on = true;
  try {
    on = localStorage.getItem('knowverse.sound') !== 'off';
  } catch {
    /* storage blocked: keep the default */
  }
  const tone = (f, d = 0.08, type = 'square', vol = 0.04, slide = 0) => {
    if (!on) return;
    try {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + d + 0.02);
    } catch {
      /* audio unavailable */
    }
  };
  return {
    get on() {
      return on;
    },
    toggle() {
      on = !on;
      try {
        localStorage.setItem('knowverse.sound', on ? 'on' : 'off');
      } catch {
        /* ignore */
      }
      return on;
    },
    add: () => tone(660, 0.05, 'square', 0.022),
    remove: () => tone(330, 0.05, 'square', 0.022),
    move: () => tone(170, 0.18, 'sawtooth', 0.018, 120),
    turn: () => tone(420, 0.09, 'triangle', 0.035, 560),
    crash: () => (tone(140, 0.4, 'sawtooth', 0.08, 40), tone(90, 0.3, 'square', 0.04, 30)),
    error: () => tone(170, 0.22, 'square', 0.045, 110),
    pick: () => (tone(880, 0.08, 'sine', 0.06), setTimeout(() => tone(1320, 0.14, 'sine', 0.05), 70)),
    win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.05), i * 110)),
    unlock: () => (tone(784, 0.1, 'triangle', 0.06), setTimeout(() => tone(1175, 0.3, 'triangle', 0.06), 90)),
    tick: () => tone(1400, 0.012, 'sine', 0.012),
  };
}

// ---------------------------------------------------------------- the game

export function mountRover(el) {
  const sfx = createSound();
  const listeners = new AbortController();
  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => (timers.delete(id), fn()), ms);
    timers.add(id);
  };

  let scene = null;
  let disposed = false;
  let mi = 0; // mission index
  let program = []; // commands in the program (build and order modes)
  let pool = []; // unplaced commands (order mode)
  let code = '';
  let runs = 0;
  let exec = null; // { sim, i, lineOf, cmds, lines }
  let busy = false;
  let won = false;
  let lastResult = null;
  let prediction = null;
  let speed = 1;
  let view = 'mission';
  let finalProgram = [];
  let bubbleTimer = 0;
  const unlocked = new Set();

  // ---------------------------------------------------------------- layout
  const dots = h('div', { class: 'kvx-dots', 'aria-hidden': 'true' });
  const viewBtn = h('button', { class: 'kvx-tool', type: 'button', title: 'Switch between the 3D view and a top-down plan', onclick: () => setView(view === 'mission' ? 'plan' : 'mission') });
  const soundBtn = h('button', { class: 'kvx-tool', type: 'button', title: 'Sound effects on or off', onclick: () => (sfx.toggle(), renderTools()) });
  const def = h('p', { class: 'kvx-def-line' });
  const viewport = h('div', { class: 'kvx-viewport' });
  const poster = h('div', { class: 'kvx-poster' }, h('div', { class: 'kvx-poster-glow' }), h('span', {}, 'Landing on Mars…'));
  const bubble = h('div', { class: 'kvx-bubble', role: 'status' });
  const signal = h('div', { class: 'kvx-signal' });
  const flash = h('div', { class: 'kvx-flash' });
  const pickBar = h('div', { class: 'kvx-pick' });
  const stage = h('div', { class: 'kvx-stage' }, viewport, poster, flash, bubble, signal, pickBar,
    h('div', { class: 'kvx-legend' },
      h('span', {}, h('i', { class: 'kvx-key flag' }), 'Flag (goal)'),
      h('span', {}, h('i', { class: 'kvx-key sample' }), 'Rock sample (bonus)'),
      h('span', {}, h('i', { class: 'kvx-key rock' }), 'Rock (avoid)')));
  const missionKicker = h('div', { class: 'kvx-kicker' });
  const missionTitle = h('h3', { class: 'kvx-title' });
  const missionBrief = h('p', { class: 'kvx-brief' });
  const controls = h('div', { class: 'kvx-controls' });
  const runBtn = h('button', { class: 'kvx-run', type: 'button', onclick: () => runAll() });
  const stepBtn = h('button', { class: 'kvx-btn', type: 'button', title: 'Run one command at a time', onclick: () => runStep() }, icon('skip'), 'Step');
  const resetBtn = h('button', { class: 'kvx-btn', type: 'button', title: 'Put the rover back at the start', onclick: () => resetRun() }, icon('undo'), 'Reset');
  const speedLabel = h('span', { class: 'kvx-speed-label' });
  const speedInput = h('input', { type: 'range', min: '0', max: '2', step: '1', value: String(speed), 'aria-label': 'Rover speed', oninput: (e) => ((speed = Number(e.target.value)), (speedLabel.textContent = SPEEDS[speed].label)) });
  const log = h('div', { class: 'kvx-log', role: 'log', 'aria-live': 'polite' });
  const side = h('div', { class: 'kvx-side' },
    missionKicker, missionTitle, missionBrief, controls,
    h('div', { class: 'kvx-runrow' }, runBtn, stepBtn, resetBtn),
    h('label', { class: 'kvx-speed' }, h('span', {}, 'Speed'), speedInput, speedLabel),
    h('div', { class: 'kvx-log-head' }, 'Telemetry'), log);
  const main = h('div', { class: 'kvx-main' }, stage, side);
  const overlay = h('div', { class: 'kvx-overlay' });
  const final = h('div', { class: 'kvx-final' });
  const root = h('div', { class: 'kvx', tabindex: '-1' },
    h('header', { class: 'kvx-head' },
      h('div', { class: 'kvx-brand' }, 'MISSION CONTROL', h('b', {}, ' // What is programming?')),
      h('div', { class: 'kvx-head-right' }, dots, viewBtn, soundBtn)),
    h('div', { class: 'kvx-def' }, h('small', {}, 'The definition. Each mission unlocks one part.'), def),
    main, final, overlay);
  el.append(root);
  speedLabel.textContent = SPEEDS[speed].label;

  // ---------------------------------------------------------------- rendering helpers

  const m = () => MISSIONS[mi];

  function renderTools() {
    fill(viewBtn, icon(view === 'mission' ? 'eye' : 'globe'), view === 'mission' ? '3D view' : 'Plan view');
    fill(soundBtn, icon(sfx.on ? 'sparkles' : 'x'), sfx.on ? 'Sound on' : 'Sound off');
    viewBtn.classList.toggle('on', view === 'plan');
    soundBtn.classList.toggle('on', sfx.on);
  }

  function renderDots() {
    fill(dots, MISSIONS.map((_, i) => h('i', { class: i < mi || (i === mi && won) ? 'done' : i === mi ? 'on' : '' })));
  }

  function renderDefinition(fresh = -1) {
    fill(def, DEFINITION.map((part) => (typeof part === 'string' ? part
      : h('span', { class: `kvx-slot ${unlocked.has(part) ? 'open' : ''} ${fresh === part ? 'fresh' : ''}`, title: unlocked.has(part) ? '' : `Unlocked by mission ${part + 1}` }, MISSIONS[part].part))));
  }

  function say(text, kind = '') {
    bubble.textContent = text;
    bubble.className = `kvx-bubble show ${kind}`;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('show'), 2600);
  }

  function addLog(text, kind = '') {
    log.append(h('div', { class: kind }, text));
    log.scrollTop = log.scrollHeight;
  }

  const canEdit = () => !busy && !exec && !won;

  function chip(cmd, where, index) {
    const c = CMD[cmd];
    return h('button', {
      class: 'kvx-chip', type: 'button', draggable: 'true', title: c.tip, 'data-cmd': cmd,
      ondragstart: (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ where, index, cmd }));
        e.dataTransfer.effectAllowed = where === 'palette' ? 'copy' : 'move';
      },
      onclick: () => clickChip(where, index, cmd),
    }, icon(c.ico), c.label);
  }

  function clickChip(where, index, cmd) {
    if (!canEdit()) return;
    if (where === 'palette') {
      if (program.length >= 30) return;
      program.push(cmd);
      sfx.add();
    } else if (where === 'pool') {
      program.push(pool.splice(index, 1)[0]);
      sfx.add();
    } else {
      const [removed] = program.splice(index, 1);
      if (m().mode === 'order') pool.push(removed);
      sfx.remove();
    }
    renderControls();
  }

  /** Make a list accept dropped chips, inserting where the pointer is. */
  function dropZone(list, target) {
    // Lists are rebuilt on every render, so plain listeners are released with the old element.
    list.addEventListener('dragover', (e) => {
      if (!canEdit()) return;
      e.preventDefault();
      list.classList.add('over');
    });
    list.addEventListener('dragleave', () => list.classList.remove('over'));
    list.addEventListener('drop', (e) => {
      e.preventDefault();
      list.classList.remove('over');
      if (!canEdit()) return;
      let data;
      try {
        data = JSON.parse(e.dataTransfer.getData('text/plain'));
      } catch {
        return;
      }
      const chips = [...list.querySelectorAll('.kvx-chip')];
      let at = chips.findIndex((c) => {
        const r = c.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2 || (e.clientY < r.bottom && e.clientX < r.left + r.width / 2);
      });
      if (at < 0) at = chips.length;
      const into = target === 'program' ? program : pool;
      if (data.where === 'palette') {
        if (target !== 'program' || program.length >= 30) return;
        program.splice(at, 0, data.cmd);
      } else {
        const from = data.where === 'program' ? program : pool;
        const [moved] = from.splice(data.index, 1);
        if (from === into && data.index < at) at--;
        into.splice(at, 0, moved);
      }
      sfx.add();
      renderControls();
    });
  }

  function renderControls() {
    const mission = m();
    const edit = canEdit();
    let body;
    if (mission.mode === 'code') {
      const highlight = exec ? exec.lineOf[Math.min(exec.i, exec.lineOf.length - 1)] : -1;
      body = [
        h('div', { class: 'kvx-hint' }, 'Insert a command'),
        h('div', { class: 'kvx-palette' }, ['forward()', 'left()', 'right()', 'forward(3)'].map((s) =>
          h('button', { class: 'kvx-ins', type: 'button', disabled: !edit, onclick: () => insert(s) }, s))),
        exec
          ? h('pre', { class: 'kvx-code' }, code.split('\n').map((line, i) => h('div', { class: `kvx-ln ${i === highlight ? 'on' : ''}` }, h('span', {}, String(i + 1)), line || ' ')))
          : h('textarea', { class: 'kvx-text', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Rover program', readOnly: !edit, oninput: (e) => (code = e.target.value) }),
      ];
    } else {
      const current = exec && busy ? exec.lineOf[exec.i] : -1;
      const progList = h('ol', { class: 'kvx-program' },
        program.length
          ? program.map((c, i) => h('li', { class: i === current ? 'running' : '' }, chip(c, 'program', i)))
          : h('li', { class: 'kvx-empty' }, mission.mode === 'order' ? 'Tap the commands above in the right order' : 'Tap or drag commands here'));
      dropZone(progList, 'program');
      if (mission.mode === 'order') {
        const poolList = h('ol', { class: 'kvx-program kvx-pool' },
          pool.length ? pool.map((c, i) => h('li', {}, chip(c, 'pool', i))) : h('li', { class: 'kvx-empty' }, 'All commands placed. Press Run.'));
        dropZone(poolList, 'pool');
        body = [h('div', { class: 'kvx-hint' }, 'Mixed-up commands'), poolList, h('div', { class: 'kvx-hint' }, 'Your program · drag to reorder'), progList];
      } else {
        body = [
          h('div', { class: 'kvx-hint' }, 'Commands · tap or drag'),
          h('div', { class: 'kvx-palette' }, Object.keys(CMD).map((c) => chip(c, 'palette'))),
          h('div', { class: 'kvx-hint' }, `Your program · ${program.length} command${program.length === 1 ? '' : 's'}`),
          progList,
          h('div', { class: 'kvx-mini' },
            h('button', { class: 'kvx-btn small', type: 'button', disabled: !edit || !program.length, onclick: () => (program.pop(), sfx.remove(), renderControls()) }, 'Undo'),
            h('button', { class: 'kvx-btn small', type: 'button', disabled: !edit || !program.length, onclick: () => ((program = []), sfx.remove(), renderControls()) }, 'Clear')),
        ];
      }
    }
    fill(controls, body);
    const ta = controls.querySelector('textarea');
    if (ta) ta.value = code;
    controls.classList.toggle('locked', !edit);

    // Run row
    const blocked = mission.mode === 'order' && pool.length > 0;
    runBtn.disabled = busy || won || blocked;
    stepBtn.hidden = Boolean(mission.delay);
    stepBtn.disabled = busy || won || blocked;
    resetBtn.disabled = busy || won;
    fill(runBtn, icon('play'), mission.delay ? 'Transmit to Mars' : exec ? 'Continue' : 'Run');

    // Pulse what to do next.
    const empty = mission.mode === 'code' ? !code.trim() : program.length === 0;
    controls.querySelector('.kvx-palette, .kvx-pool')?.classList.toggle('guide', edit && empty && mission.mode !== 'code');
    runBtn.classList.toggle('guide', edit && !empty && !blocked);
  }

  function insert(s) {
    if (!canEdit()) return;
    const ta = controls.querySelector('textarea');
    const a = ta.selectionStart;
    const b = ta.selectionEnd;
    let before = ta.value.slice(0, a);
    if (before && !before.endsWith('\n')) before += '\n';
    const after = ta.value.slice(b).replace(/^\n/, '');
    ta.value = `${before}${s}\n${after}`;
    const caret = before.length + s.length + 1;
    ta.setSelectionRange(caret, caret);
    ta.focus();
    code = ta.value;
    sfx.add();
    renderControls();
    const fresh = controls.querySelector('textarea');
    fresh?.focus();
    fresh?.setSelectionRange(caret, caret);
  }

  // ---------------------------------------------------------------- missions

  function loadMission(i) {
    mi = i;
    const mission = m();
    won = false;
    exec = null;
    busy = false;
    runs = 0;
    prediction = null;
    lastResult = null;
    program = [];
    pool = mission.pool ? [...mission.pool] : [];
    code = mission.starter || '';
    missionKicker.textContent = `Mission ${i + 1} of ${MISSIONS.length}`;
    missionTitle.textContent = mission.title;
    missionBrief.textContent = mission.brief;
    fill(log);
    addLog('Link established with the rover. Awaiting instructions.', 'acc');
    scene?.setMission(mission);
    renderDots();
    renderDefinition();
    renderControls();
    briefing();
  }

  function briefing() {
    const mission = m();
    const accept = h('button', { class: 'kvx-run guide', type: 'button', onclick: () => closeOverlay() }, 'Accept mission', icon('arrowRight'));
    openOverlay(h('div', { class: 'kvx-card' },
      h('div', { class: 'kvx-kicker' }, `Mission ${mi + 1} of ${MISSIONS.length} · Briefing`),
      h('h3', { class: 'kvx-title' }, mission.title),
      h('p', { class: 'kvx-brief' }, mission.brief),
      mission.delay && h('p', { class: 'kvx-note' }, icon('clock'), 'New: before the signal arrives, you will predict where the rover stops.'),
      h('div', { class: 'kvx-actions' }, accept)));
    accept.focus({ preventScroll: true });
  }

  function openOverlay(card) {
    fill(overlay, card);
    overlay.classList.add('show');
  }

  function closeOverlay() {
    overlay.classList.remove('show');
    later(() => !overlay.classList.contains('show') && fill(overlay), 250);
  }

  function setView(v) {
    view = v;
    scene?.setView(v);
    renderTools();
  }

  // ---------------------------------------------------------------- running

  /** Turn the current program into simulated steps. Returns false if there is nothing to run. */
  function prepare() {
    const mission = m();
    let cmds;
    let lineOf;
    let lines = 0;
    if (mission.mode === 'code') {
      addLog('Transmitting message…');
      const parsed = parseProgram(code);
      if (!parsed.ok) {
        const { error } = parsed;
        addLog(error.message, 'bad');
        addLog(error.hint, 'acc');
        say(error.plainEnglish ? 'I do not speak English!' : 'I do not know that command.', 'bad');
        sfx.error();
        const ta = controls.querySelector('textarea');
        ta?.classList.remove('shake');
        void ta?.offsetWidth;
        ta?.classList.add('shake');
        return false;
      }
      cmds = parsed.cmds.map((c) => c.cmd);
      lineOf = parsed.cmds.map((c) => c.line);
      lines = parsed.lines;
    } else {
      cmds = [...program];
      lineOf = cmds.map((_, i) => i);
    }
    if (!cmds.length) {
      addLog('No instructions sent. The rover just sits there: computers do nothing without instructions.', 'bad');
      say('…waiting for instructions');
      sfx.error();
      return false;
    }
    runs++;
    scene?.reset();
    exec = { sim: simulate(mission, cmds), i: 0, lineOf, cmds, lines };
    return true;
  }

  async function runAll() {
    if (busy || won) return;
    const mission = m();
    if (!exec) {
      if (!prepare()) return;
      if (mission.delay) {
        busy = true;
        renderControls();
        addLog('Transmitting. You can no longer change the program.', 'acc');
        await predict();
        if (disposed) return;
        await countdown();
        if (disposed) return;
      }
    }
    busy = true;
    renderControls();
    while (exec && exec.i < exec.sim.steps.length && !disposed) await stepOnce();
    if (exec && !disposed) finish();
    busy = false;
    if (!disposed) renderControls();
  }

  async function runStep() {
    if (busy || won || m().delay) return;
    if (!exec && !prepare()) return;
    busy = true;
    renderControls();
    await stepOnce();
    if (exec && exec.i >= exec.sim.steps.length) finish();
    busy = false;
    if (!disposed) renderControls();
  }

  async function stepOnce() {
    const step = exec.sim.steps[exec.i];
    renderControls();
    addLog(`T+${String(exec.i + 1).padStart(2, '0')}  ${step.cmd}()`);
    if (step.event === 'turn') {
      sfx.turn();
      say(SAY[step.cmd]);
    } else if (step.event === 'move') {
      sfx.move();
    }
    await scene?.play(step, SPEEDS[speed].ms);
    if (disposed) return;
    if (step.sample) {
      sfx.pick();
      say(SAY.sample, 'ok');
      addLog('◆ Rock sample collected!', 'ok');
    }
    if (step.event === 'crash' || step.event === 'offmap') {
      sfx.crash();
      flash.classList.remove('on');
      void flash.offsetWidth;
      flash.classList.add('on');
      say(SAY[step.event], 'bad');
      addLog(step.event === 'crash' ? 'ERROR: The rover hit a rock.' : 'ERROR: The rover drove off the map.', 'bad');
    }
    exec.i++;
  }

  function finish() {
    const mission = m();
    const { sim, cmds, lines } = exec;
    exec = null;
    lastResult = sim;
    if (prediction) {
      const hitIt = prediction.x === sim.end.x && prediction.y === sim.end.y;
      addLog(hitIt ? 'Your prediction was right: it stopped exactly where you said.' : 'Your prediction and the real result were different. Compare them on the map.', hitIt ? 'ok' : 'acc');
    }
    if (sim.reached) {
      won = true;
      if (mission.delay) finalProgram = cmds;
      sfx.win();
      say('Flag reached!', 'ok');
      addLog('MISSION SUCCESS', 'ok');
      scene?.celebrate();
      renderDots();
      later(() => debrief(sim, { cmds, runs, lines }), 1100);
    } else {
      if (!sim.crashed) {
        addLog('The program finished, but the rover is not at the flag.', 'bad');
        say('Done… but this is not the flag.');
        sfx.error();
      }
      if (mission.delay) addLog('The rover did exactly what you wrote, and you could not step in. Fix the program and transmit again.', 'acc');
    }
    renderControls();
  }

  function resetRun() {
    if (busy || won) return;
    exec = null;
    prediction = null;
    scene?.reset();
    addLog('Rover back at the start.');
    renderControls();
  }

  /** Mission 4: ask where the rover will stop before the signal arrives. */
  function predict() {
    return new Promise((resolve) => {
      if (!scene) return resolve();
      const done = (tile) => {
        scene.setPicking(false);
        pickBar.classList.remove('show');
        if (tile) {
          prediction = tile;
          scene.setPrediction(tile);
          addLog(`Prediction logged: the rover will stop at square (${tile.x + 1}, ${tile.y + 1}).`, 'acc');
        }
        resolve();
      };
      fill(pickBar,
        h('span', {}, icon('target'), 'Before it runs: tap the square where you think the rover will stop.'),
        h('button', { class: 'kvx-btn small', type: 'button', onclick: () => done(null) }, 'Skip'));
      pickBar.classList.add('show');
      scene.opts.onPick = (tile) => (sfx.add(), done(tile));
      scene.setPicking(true);
    });
  }

  /** Mission 4: the 20-minute signal delay, compressed into a few seconds. */
  function countdown() {
    return new Promise((resolve) => {
      const time = h('b', {}, '20:00');
      fill(signal,
        h('div', { class: 'kvx-signal-row' }, h('span', { class: 'kvx-planet earth' }, 'Earth'), h('div', { class: 'kvx-beam' }, h('i')), h('span', { class: 'kvx-planet mars' }, 'Mars')),
        h('div', {}, 'SIGNAL IN TRANSIT  ', time));
      signal.classList.add('show');
      let elapsed = 0;
      let lastTick = 0;
      const total = 2600;
      const ticker = frameLoop.add((dt) => {
        elapsed += dt;
        const left = Math.max(0, 1200 - Math.round((elapsed / total) * 1200));
        time.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
        signal.style.setProperty('--p', Math.min(1, elapsed / total));
        if (elapsed - lastTick > 90) (lastTick = elapsed), sfx.tick();
        if (elapsed < total && !disposed) return ACTIVE;
        ticker.remove();
        time.textContent = '00:00';
        later(() => {
          signal.classList.remove('show');
          addLog('Signal received. Executing…', 'acc');
          resolve();
        }, 450);
        return IDLE;
      });
    });
  }

  // ---------------------------------------------------------------- debrief and checkpoint

  function debrief(sim, run) {
    const mission = m();
    const items = report(mission, sim, run);
    const status = h('p', { class: 'kvx-why' });
    const next = h('div', { class: 'kvx-actions' });
    const options = mission.check.options.map((text, i) => h('button', { class: 'kv-option', type: 'button', onclick: (e) => answer(i, e.currentTarget) }, text));
    const optionBox = h('div', { class: 'kvx-options guide' }, options);
    openOverlay(h('div', { class: 'kvx-card' },
      h('div', { class: 'kvx-kicker' }, `Mission ${mi + 1} complete · Report`),
      h('ul', { class: 'kvx-report' }, items.map((it) => h('li', { class: it.ok ? 'ok' : '' }, icon(it.ok ? 'check' : 'info'), it.text))),
      h('div', { class: 'kvx-kicker' }, 'Checkpoint · unlock the definition'),
      h('p', { class: 'kvx-q' }, mission.check.q),
      optionBox, status, next));

    function answer(i, btn) {
      if (i === mission.check.answer) {
        btn.classList.add('right');
        options.forEach((b) => (b.disabled = true));
        optionBox.classList.remove('guide');
        fill(status, h('b', {}, 'Correct. '), mission.check.why);
        status.className = 'kvx-why ok';
        unlocked.add(mi);
        renderDefinition(mi);
        sfx.unlock();
        const last = mi === MISSIONS.length - 1;
        const go = h('button', { class: 'kvx-run guide', type: 'button', onclick: () => (closeOverlay(), last ? startFinal() : loadMission(mi + 1)) }, last ? 'Final challenge' : 'Next mission', icon('arrowRight'));
        fill(next, go);
        go.focus({ preventScroll: true });
      } else {
        btn.classList.add('wrong');
        btn.disabled = true;
        sfx.error();
        fill(status, h('b', {}, 'Not quite. '), mission.check.wrong[i], ' Try again.');
        status.className = 'kvx-why bad';
      }
    }
  }

  // ---------------------------------------------------------------- final challenge

  function startFinal() {
    main.hidden = true;
    root.querySelector('.kvx-def').hidden = true;
    final.classList.add('show');
    const parts = MISSIONS.map((x) => x.part);
    const blanks = parts.map(() => h('span', { class: 'kvx-blank' }));
    let at = 0;
    blanks[0].classList.add('next');
    const msg = h('p', { class: 'kvx-why' });
    const after = h('div', { class: 'kvx-after' });
    const bank = h('div', { class: 'kvx-bank guide' }, [...parts].sort(() => Math.random() - 0.5).map((p) => {
      const b = h('button', { class: 'kvx-btn', type: 'button', onclick: () => {
        if (p !== parts[at]) {
          b.classList.remove('shake');
          void b.offsetWidth;
          b.classList.add('shake');
          sfx.error();
          fill(msg, 'Not that one yet. Think about the order of the missions.');
          msg.className = 'kvx-why bad';
          return;
        }
        blanks[at].textContent = p;
        blanks[at].className = 'kvx-blank filled';
        b.disabled = true;
        sfx.unlock();
        at++;
        fill(msg);
        if (at < parts.length) return blanks[at].classList.add('next');
        bank.classList.remove('guide');
        sfx.win();
        fill(msg, h('b', {}, 'Perfect. That is the definition of programming.'));
        msg.className = 'kvx-why ok';
        fill(after,
          h('h3', { class: 'kvx-title' }, 'You just did programming.'),
          h('p', { class: 'kvx-brief' }, 'Here is your Mission 4 program written in Python, the language of this course:'),
          h('pre', { class: 'kvx-py' }, toPython(finalProgram, 'Mission 4: reach the flag on Mars')),
          h('p', { class: 'kvx-brief' }, h('b', {}, 'Think about it: '), 'where else do instructions run with no person steering? Alarms, traffic lights, washing machines, game characters.'),
          h('button', { class: 'kvx-btn', type: 'button', onclick: restart }, icon('undo'), 'Replay the missions'));
      } }, p);
      return b;
    }));
    fill(final,
      h('div', { class: 'kvx-kicker' }, 'Final challenge'),
      h('h3', { class: 'kvx-title' }, 'Build the definition from memory'),
      h('p', { class: 'kvx-brief' }, 'Tap the phrases in the right order to complete the sentence.'),
      h('p', { class: 'kvx-sentence' }, 'Programming is writing ', blanks[0], ', ', blanks[1], ', ', blanks[2], ', so it can ', blanks[3], '.'),
      bank, msg, after);
  }

  function restart() {
    unlocked.clear();
    finalProgram = [];
    final.classList.remove('show');
    main.hidden = false;
    root.querySelector('.kvx-def').hidden = false;
    loadMission(0);
  }

  // ---------------------------------------------------------------- keyboard

  root.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || overlay.classList.contains('show') || final.classList.contains('show')) return;
    const mission = m();
    if (mission.mode === 'build') {
      const cmd = { ArrowUp: 'forward', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
      if (cmd) {
        e.preventDefault();
        clickChip('palette', 0, cmd);
        return;
      }
      if (e.key === 'Backspace' && canEdit() && program.length) {
        e.preventDefault();
        program.pop();
        sfx.remove();
        renderControls();
        return;
      }
    }
    if (tag === 'BUTTON') return; // Enter and Space activate the focused button
    if (e.key === 'Enter') {
      e.preventDefault();
      runAll();
    }
  }, { signal: listeners.signal });

  // ---------------------------------------------------------------- start

  renderTools();
  loadMission(0);

  // The 3D world (and the three.js bundle) loads only when the game comes into view.
  const stopWaiting = whenVisible(root, async () => {
    try {
      const { MarsScene } = await import('./rover/scene.js');
      if (disposed) return;
      scene = new MarsScene(viewport);
      scene.setMission(m());
      scene.setView(view);
      poster.classList.add('gone');
    } catch (err) {
      console.error(err);
      fill(poster, h('span', {}, 'The 3D view could not start on this device. The missions still work: watch the telemetry.'));
    }
  });

  return () => {
    disposed = true;
    stopWaiting();
    listeners.abort();
    clearTimeout(bubbleTimer);
    timers.forEach(clearTimeout);
    scene?.dispose();
    scene = null;
  };
}
