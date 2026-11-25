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
//   • The mission brief lives in the left panel. After a win, the checkpoint slides up in a glass
//     panel over the game, never a blocking pop-up: Hide folds it to a pill, the player keeps
//     playing and answers when ready. Mission tabs in the header jump anywhere.
//   • Mission 2 is a Parsons problem: the right commands, in the wrong order.
//   • Mission 3 lets plain English fail before the real commands are introduced.
//   • Mission 4 removes live control (a 20-minute signal delay) and asks the player to predict
//     where the rover will stop before it runs: predict, then observe, then explain.
//   • Nothing plays by itself; a pulsing hint shows what to do next. No points or stars.
//   • "Show me how" plays an animated demo with a ghost cursor driving the real controls.
//   • Starting a mission opens focus mode: the game fills the screen and the page is locked,
//     so nothing scrolls or jumps while playing. Esc returns to the page.
//   • Full keyboard control (see KEYS below), and on-screen game controls on the 3D view: an arrow
//     pad that adds commands in every mission, plus Run / Step / Reset buttons.
//   • Focus mode lays out mission | 3D view | telemetry; demo captions ride beside the cursor.
//   • Words a beginner may not know are underlined (js/words.js); a Words tab lists them all.
//   • All text comes from ./rover/strings.js in English or Telugish (the top bar switch,
//     js/i18n.js). Switching language re-renders the game in place; progress is kept.
//
// The rules live in ./rover/missions.js (unit-tested); the 3D world in ./rover/scene.js, loaded
// only when the game scrolls into view.

import { h, fill, icon, whenVisible } from '../ui.js';
import { frameLoop, ACTIVE, IDLE } from '../engine/loop.js';
import { MISSIONS, definition, localizeMission, simulate, parseProgram, toPython, report } from './rover/missions.js';
import { STRINGS } from './rover/strings.js';
import { translator, getLang, htmlLang } from '../i18n.js';
import { createDirector, Cancelled } from './rover/demo.js';
import { termify, termButton, isSeen } from '../words.js';
import { GLOSSARY, BY_ID, wordText } from '../glossary.js';

// Words this game underlines, for its Words list (see js/glossary.js).
const WORDS = GLOSSARY.filter((g) => g.tags?.includes('rover')).map((g) => g.id);

const t = translator(STRINGS);
const KEY_GLYPHS = ['↑ ← →', '⌫', 'Enter', 'Space', 'R', 'V', '+ −', '?', 'Esc']; // labels: t('keys')
const KEY_FOR = { forward: '↑', left: '←', right: '→' };

const CMD = {
  forward: { label: 'forward()', ico: 'arrowUp' },
  left: { label: 'left()', ico: 'turnLeft' },
  right: { label: 'right()', ico: 'turnRight' },
};
const SPEEDS = [{ ms: 820 }, { ms: 500 }, { ms: 260 }]; // labels: t('speeds')

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
  let focused = false; // focus mode: the game fills the screen
  let placeholder = null; // keeps the game's place in the page while it is in focus mode
  let demoing = false;
  let cancelPick = null; // ends a pending mission 4 prediction
  const unlocked = new Set(); // missions whose checkpoint was answered
  const solved = new Set(); // missions where the rover reached the flag
  let dockKind = null; // 'check' while the checkpoint panel has content, else null
  let dockPillText = '';
  let played = false; // the player has watched the demo or started building (stops the "Show me how" pulse)

  // ---------------------------------------------------------------- layout
  const tabs = h('nav', { class: 'kvx-tabs' });
  const viewBtn = h('button', { class: 'kvx-tool', type: 'button', onclick: () => setView(view === 'mission' ? 'plan' : 'mission') });
  const soundBtn = h('button', { class: 'kvx-tool', type: 'button', onclick: () => (sfx.toggle(), renderTools()) });
  const helpBtn = h('button', { class: 'kvx-tool', type: 'button', onclick: () => runDemo() });
  const focusBtn = h('button', { class: 'kvx-tool', type: 'button', onclick: () => (focused ? exitFocus() : enterFocus()) });
  const fullBtn = h('button', { class: 'kvx-tool', type: 'button', onclick: () => toggleFullscreen() });
  const demoText = h('span', {});
  const demoSkip = h('button', { class: 'kvx-btn small', type: 'button', onclick: () => stopDemo() });
  const demoBar = h('div', { class: 'kvx-demo' }, h('b', {}, 'DEMO'), demoText, demoSkip);
  // On-screen game controls, like a mobile game: an arrow pad that adds commands, and action buttons.
  const padBtn = (cls, ico, fn) => h('button', { class: cls, type: 'button', onclick: fn }, icon(ico));
  const padKeys = {
    forward: padBtn('up', 'arrowUp', () => addCommand('forward')),
    left: padBtn('left', 'turnLeft', () => addCommand('left')),
    right: padBtn('right', 'turnRight', () => addCommand('right')),
  };
  const padUndo = padBtn('down', 'undo', () => undoCommand());
  const pad = h('div', { class: 'kvx-pad', role: 'group' }, h('i', { class: 'kvx-pad-hub' }), padKeys.forward, padKeys.left, padKeys.right, padUndo);
  const runFab = padBtn('kvx-fab run', 'play', () => runAll());
  const stepFab = padBtn('kvx-fab', 'skip', () => runStep());
  const resetFab = padBtn('kvx-fab', 'reset', () => resetRun());
  const actionPad = h('div', { class: 'kvx-act' }, resetFab, stepFab, runFab);
  const zoomInBtn = padBtn('', 'plus', () => scene?.zoomBy(0.8));
  const zoomOutBtn = padBtn('', 'minus', () => scene?.zoomBy(1.25));
  const recenterBtn = padBtn('', 'target', () => scene?.recenter());
  const hud = h('div', { class: 'kvx-hud' }, zoomInBtn, zoomOutBtn, recenterBtn);
  const def = h('p', { class: 'kvx-def-line' });
  const defNote = h('small', {});
  const viewport = h('div', { class: 'kvx-viewport' });
  const posterText = h('span', {});
  const poster = h('div', { class: 'kvx-poster' }, h('div', { class: 'kvx-poster-glow' }), posterText);
  const bubble = h('div', { class: 'kvx-bubble', role: 'status' });
  const signal = h('div', { class: 'kvx-signal' });
  const flash = h('div', { class: 'kvx-flash' });
  const pickBar = h('div', { class: 'kvx-pick' });
  const legend = { flag: h('span', {}), sample: h('span', {}), rock: h('span', {}) };
  const stage = h('div', { class: 'kvx-stage' }, viewport, poster, flash, bubble, signal, pickBar, hud, pad, actionPad, demoBar,
    h('div', { class: 'kvx-legend' },
      h('span', {}, h('i', { class: 'kvx-key flag' }), legend.flag),
      h('span', {}, h('i', { class: 'kvx-key sample' }), legend.sample),
      h('span', {}, h('i', { class: 'kvx-key rock' }), legend.rock)));
  const missionKicker = h('div', { class: 'kvx-kicker' });
  const missionTitle = h('h3', { class: 'kvx-title' });
  const missionBrief = h('p', { class: 'kvx-brief' });
  const missionNoteText = h('span', {});
  const missionNote = h('p', { class: 'kvx-note' }, icon('clock'), missionNoteText);
  const howBtn = h('button', { class: 'kvx-btn small kvx-how', type: 'button', onclick: () => runDemo() });
  const controls = h('div', { class: 'kvx-controls' });
  const runBtn = h('button', { class: 'kvx-run', type: 'button', onclick: () => runAll() });
  const stepBtn = h('button', { class: 'kvx-btn', type: 'button', onclick: () => runStep() });
  const resetBtn = h('button', { class: 'kvx-btn', type: 'button', onclick: () => resetRun() });
  const speedText = h('span', {});
  const speedLabel = h('span', { class: 'kvx-speed-label' });
  const speedInput = h('input', { type: 'range', min: '0', max: '2', step: '1', value: String(speed), oninput: (e) => ((speed = Number(e.target.value)), (speedLabel.textContent = t('speeds')[speed])) });
  const keysStrip = h('div', { class: 'kvx-keys' });
  const log = h('div', { class: 'kvx-log', role: 'log', 'aria-live': 'polite' });
  const side = h('div', { class: 'kvx-side' },
    missionKicker, missionTitle, missionBrief, missionNote, howBtn, controls,
    h('div', { class: 'kvx-runrow' }, runBtn, stepBtn, resetBtn),
    h('label', { class: 'kvx-speed' }, speedText, speedInput, speedLabel),
    keysStrip);
  let teleMode = 'log';
  let logScope = new Set(); // underline each word once per log
  const teleLabel = h('div', { class: 'kvx-hint tele' });
  const wordsLabel = h('div', { class: 'kvx-hint words' });
  const teleSwitch = h('button', { class: 'kvx-switch', type: 'button', onclick: () => showTele(teleMode === 'log' ? 'words' : 'log') });
  const wordsList = h('ul', { class: 'kvx-words' });
  const tele = h('aside', { class: 'kvx-tele' }, h('div', { class: 'kvx-tele-head' }, teleLabel, wordsLabel, teleSwitch), log, wordsList);
  // While a demo plays, this catches clicks so the player cannot fight the ghost cursor.
  const shield = h('div', { class: 'kvx-shield' });
  // Mission and controls on the left, the 3D view in the centre, telemetry on the right.
  const main = h('div', { class: 'kvx-main' }, side, stage, tele, shield);
  // The checkpoint panel: glass, slides up over the game, folds to a pill. Never blocks play.
  const dockKicker = h('span', { class: 'kvx-dock-kicker' });
  const dockTitle = h('h3', { class: 'kvx-dock-title' });
  const dockToggle = h('button', { class: 'kvx-dock-toggle', type: 'button', onclick: () => setDockOpen(false) });
  const dockBody = h('div', { class: 'kvx-dock-body' });
  const dock = h('section', { class: 'kvx-dock' },
    h('header', { class: 'kvx-dock-head' }, h('div', {}, dockKicker, dockTitle), dockToggle),
    dockBody);
  const dockPill = h('button', { class: 'kvx-dock-pill', type: 'button', onclick: () => setDockOpen(true) });
  const final = h('div', { class: 'kvx-final' });
  const brand = h('div', { class: 'kvx-brand' });
  const root = h('div', { class: 'kvx', tabindex: '-1' },
    h('header', { class: 'kvx-head' },
      brand,
      tabs,
      h('div', { class: 'kvx-head-right' }, helpBtn, viewBtn, soundBtn, fullBtn, focusBtn)),
    h('div', { class: 'kvx-def' }, defNote, def),
    main, dock, dockPill, final);
  el.append(root);
  const director = createDirector(root);
  let lastDebrief = null; // [sim, run] of the checkpoint on show, to redraw it in another language

  // ---------------------------------------------------------------- rendering helpers

  const m = () => localizeMission(MISSIONS[mi], getLang());
  const tip = (el, text) => {
    el.title = text;
    el.setAttribute('aria-label', text);
  };

  /** Every fixed piece of text, in the current language. */
  function renderStatic() {
    root.lang = htmlLang();
    fill(brand, termify(t('brand')), h('b', {}, termify(t('brandSub'))));
    tabs.setAttribute('aria-label', t('missions'));
    fill(helpBtn, icon('play'), t('howToPlay'));
    helpBtn.title = t('howTitle');
    fill(fullBtn, icon('fit'), t('fullScreen'));
    fullBtn.title = t('fullTitle');
    viewBtn.title = t('viewTitle');
    soundBtn.title = t('soundTitle');
    demoText.textContent = t('followCursor');
    demoSkip.textContent = t('skipEsc');
    tip(padKeys.forward, t('padAdd', 'forward', '↑'));
    tip(padKeys.left, t('padAdd', 'left', '←'));
    tip(padKeys.right, t('padAdd', 'right', '→'));
    tip(padUndo, t('padUndo'));
    pad.setAttribute('aria-label', t('padGroup'));
    tip(stepFab, t('stepFab'));
    tip(resetFab, t('resetFab'));
    tip(zoomInBtn, t('zoomIn'));
    tip(zoomOutBtn, t('zoomOut'));
    tip(recenterBtn, t('recenter'));
    defNote.textContent = t('defNote');
    posterText.textContent = 'failed' in poster.dataset ? t('noScene') : t('landing');
    legend.flag.textContent = t('legendFlag');
    legend.sample.textContent = t('legendSample');
    legend.rock.textContent = t('legendRock');
    fill(missionNoteText, termify(t('missionNote')));
    fill(howBtn, icon('play'), t('showMe'));
    howBtn.title = t('showMeTitle');
    fill(stepBtn, icon('skip'), t('step'));
    stepBtn.title = t('stepTitle');
    fill(resetBtn, icon('reset'), t('reset'));
    resetBtn.title = t('resetTitle');
    speedText.textContent = t('speed');
    speedInput.setAttribute('aria-label', t('speedAria'));
    speedLabel.textContent = t('speeds')[speed];
    keysStrip.setAttribute('aria-label', t('keysAria'));
    fill(keysStrip, KEY_GLYPHS.map((k, i) => h('span', {}, h('kbd', {}, k), t('keys')[i])));
    fill(teleLabel, termify(t('teleLabel')));
    wordsLabel.textContent = t('wordsLabel');
    fill(dockToggle, t('hide'), icon('chevron'));
    dockToggle.title = t('hideTitle');
    dock.setAttribute('aria-label', t('checkpointAria'));
  }

  function renderTools() {
    fill(viewBtn, icon(view === 'mission' ? 'eye' : 'globe'), view === 'mission' ? t('view3d') : t('planView'));
    fill(soundBtn, icon(sfx.on ? 'sparkles' : 'x'), sfx.on ? t('soundOn') : t('soundOff'));
    viewBtn.classList.toggle('on', view === 'plan');
    soundBtn.classList.toggle('on', sfx.on);
    fill(focusBtn, icon(focused ? 'x' : 'unfold'), focused ? t('exitFocus') : t('focusMode'));
    focusBtn.title = focused ? t('focusOnTitle') : t('focusOffTitle');
    fullBtn.hidden = !focused || !document.fullscreenEnabled;
  }

  /** Mission tabs: every mission is always visible and one click away. */
  function renderTabs() {
    const inFinal = final.classList.contains('show');
    const hold = demoing || busy; // no jumping away mid-run or mid-demo
    const allDone = unlocked.size === MISSIONS.length;
    fill(tabs, MISSIONS.map((mission, i) => {
      const x = localizeMission(mission, getLang());
      const state = unlocked.has(i) ? 'done' : solved.has(i) ? 'solved' : '';
      return h('button', {
        class: `kvx-tab ${state} ${i === mi && !inFinal ? 'on' : ''}`, type: 'button', disabled: hold,
        'aria-current': i === mi && !inFinal ? 'step' : null,
        title: t('tabTitle', i + 1, x.title, state),
        onclick: () => goMission(i),
      }, h('b', {}, unlocked.has(i) ? icon('check') : String(i + 1)), h('span', {}, t('tabShort')[i]));
    }), h('button', {
      class: `kvx-tab final ${inFinal ? 'on' : ''}`, type: 'button', disabled: hold || !allDone,
      title: allDone ? t('finalTitleOn') : t('finalTitleOff'),
      onclick: () => startFinal(),
    }, h('b', {}, '★'), h('span', {}, t('final'))));
  }

  function goMission(i) {
    if (demoing || busy) return;
    leaveFinal();
    loadMission(i);
  }

  // ---------------------------------------------------------------- the dock

  /** Slide the checkpoint panel up. It never blocks the game. */
  function showDock(kind, kicker, title, body, pill) {
    dockKind = kind;
    dockKicker.textContent = kicker;
    dockTitle.textContent = title;
    fill(dockBody, body);
    setPill(pill);
    setDockOpen(true);
  }

  function setPill(text) {
    dockPillText = text;
    fill(dockPill, icon('chevron'), text);
  }

  /** Open the panel, or fold it to the pill (when there is something to come back to). */
  function setDockOpen(open) {
    dock.classList.toggle('open', open && Boolean(dockKind));
    root.classList.toggle('dock-min', !open && Boolean(dockKind));
    dockToggle.setAttribute('aria-expanded', String(open));
  }

  function hideDock() {
    dockKind = null;
    dock.classList.remove('open');
    root.classList.remove('dock-min');
    later(() => !dockKind && fill(dockBody), 500); // empty it once the slide-out has finished
  }

  function renderDefinition(fresh = -1) {
    const scope = new Set();
    fill(def, definition(getLang()).map((part) => (typeof part === 'string' ? termify(part, scope)
      : h('span', { class: `kvx-slot ${unlocked.has(part) ? 'open' : ''} ${fresh === part ? 'fresh' : ''}`, title: unlocked.has(part) ? '' : t('slotTitle', part + 1) }, localizeMission(MISSIONS[part], getLang()).part))));
  }

  function say(text, kind = '') {
    bubble.textContent = text;
    bubble.className = `kvx-bubble show ${kind}`;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('show'), 2600);
  }

  function clearLog() {
    fill(log);
    logScope = new Set();
  }

  /** The right-hand panel shows telemetry, or the list of words this game explains. */
  function showTele(mode) {
    teleMode = mode;
    const words = mode === 'words';
    log.hidden = words;
    teleLabel.hidden = words;
    wordsList.hidden = !words;
    wordsLabel.hidden = !words;
    const known = WORDS.filter(isSeen).length;
    fill(teleSwitch, ...(words ? [icon('chevronLeft'), t('telemetry')] : [icon('book'), t('words'), h('small', {}, `${known}/${WORDS.length}`)]));
    teleSwitch.title = words ? t('teleTitle') : t('wordsTitle');
    if (words) {
      fill(wordsList, WORDS.map((id) => h('li', { class: isSeen(id) ? 'seen' : '' },
        termButton(id), h('span', {}, wordText(BY_ID.get(id), getLang()).short), isSeen(id) && icon('check'))));
    }
  }

  function addLog(text, kind = '') {
    log.append(h('div', { class: kind }, termify(text, logScope)));
    log.scrollTop = log.scrollHeight;
  }

  const canEdit = () => !busy && !exec && !won;

  function chip(cmd, where, index) {
    const c = CMD[cmd];
    return h('button', {
      class: 'kvx-chip', type: 'button', draggable: 'true', title: t('cmdTip')[cmd], 'data-cmd': cmd,
      ondragstart: (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ where, index, cmd }));
        e.dataTransfer.effectAllowed = where === 'palette' ? 'copy' : 'move';
      },
      onclick: () => clickChip(where, index, cmd),
    }, icon(c.ico), c.label, where === 'palette' && m().mode === 'build' && h('kbd', {}, KEY_FOR[cmd]));
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
        h('div', { class: 'kvx-hint cmd' }, termify(t('hintInsert'))),
        h('div', { class: 'kvx-palette' }, ['forward()', 'left()', 'right()', 'forward(3)'].map((s) =>
          h('button', { class: 'kvx-ins', type: 'button', disabled: !edit, title: s === 'forward(3)' ? wordText(BY_ID.get('argument'), getLang()).short : t('cmdTip')[s.slice(0, -2)], onclick: () => insert(s) }, s))),
        h('div', { class: 'kvx-hint prog' }, termify(t('hintLines'))),
        exec
          ? h('pre', { class: 'kvx-code' }, code.split('\n').map((line, i) => h('div', { class: `kvx-ln ${i === highlight ? 'on' : ''}` }, h('span', {}, String(i + 1)), line || ' ')))
          : h('textarea', { class: 'kvx-text', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': t('programAria'), readOnly: !edit, oninput: (e) => (code = e.target.value) }),
      ];
    } else {
      const current = exec && busy ? exec.lineOf[exec.i] : -1;
      const progList = h('ol', { class: 'kvx-program' },
        program.length
          ? program.map((c, i) => h('li', { class: i === current ? 'running' : '' }, chip(c, 'program', i)))
          : h('li', { class: 'kvx-empty' }, mission.mode === 'order' ? t('emptyOrder') : t('emptyBuild')));
      dropZone(progList, 'program');
      if (mission.mode === 'order') {
        const poolList = h('ol', { class: 'kvx-program kvx-pool' },
          pool.length ? pool.map((c, i) => h('li', {}, chip(c, 'pool', i))) : h('li', { class: 'kvx-empty' }, t('allPlaced')));
        dropZone(poolList, 'pool');
        body = [h('div', { class: 'kvx-hint cmd' }, termify(t('hintMixed'))), poolList, h('div', { class: 'kvx-hint prog' }, termify(t('hintReorder'))), progList];
      } else {
        body = [
          h('div', { class: 'kvx-hint cmd' }, termify(t('hintTapDrag'))),
          h('div', { class: 'kvx-palette' }, Object.keys(CMD).map((c) => chip(c, 'palette'))),
          h('div', { class: 'kvx-hint prog' }, termify(t('hintCount', program.length))),
          progList,
          h('div', { class: 'kvx-mini' },
            h('button', { class: 'kvx-btn small', type: 'button', disabled: !edit || !program.length, onclick: () => undoCommand() }, t('undo')),
            h('button', { class: 'kvx-btn small', type: 'button', disabled: !edit || !program.length, onclick: () => ((program = []), sfx.remove(), renderControls()) }, t('clear'))),
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
    resetBtn.disabled = busy;
    fill(runBtn, icon('play'), mission.delay ? t('transmit') : exec ? t('continue') : t('run'));

    // Pulse what to do next.
    const empty = mission.mode === 'code' ? !code.trim() : program.length === 0;
    if (!empty || exec) played = true;
    howBtn.classList.toggle('guide', mi === 0 && !played);
    controls.querySelector('.kvx-palette, .kvx-pool')?.classList.toggle('guide', edit && empty && mission.mode !== 'code' && (played || mi > 0));
    runBtn.classList.toggle('guide', edit && !empty && !blocked);

    // The on-screen pad and action buttons mirror the panel's controls.
    for (const [cmd, b] of Object.entries(padKeys)) b.disabled = !edit || (mission.mode === 'order' && !pool.includes(cmd));
    padUndo.hidden = mission.mode === 'code';
    padUndo.disabled = !edit || !program.length;
    runFab.disabled = runBtn.disabled;
    tip(runFab, t('runFab', mission.delay));
    runFab.classList.toggle('guide', runBtn.classList.contains('guide'));
    stepFab.hidden = stepBtn.hidden;
    stepFab.disabled = stepBtn.disabled;
    resetFab.disabled = resetBtn.disabled;
    resetBtn.classList.toggle('guide', won && !busy);
    renderTabs();

  }

  /** Add a command from the arrow pad or the keyboard, whatever kind of editor this mission uses. */
  function addCommand(cmd) {
    if (!canEdit()) return;
    const mode = m().mode;
    if (mode === 'code') return insert(`${cmd}()`);
    if (mode === 'order') {
      const i = pool.indexOf(cmd);
      if (i >= 0) clickChip('pool', i, cmd);
      return;
    }
    clickChip('palette', 0, cmd);
  }

  /** Take the last command off the program (back into the mixed-up pile in mission 2). */
  function undoCommand() {
    if (!canEdit() || !program.length || m().mode === 'code') return;
    clickChip('program', program.length - 1, program[program.length - 1]);
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
    renderMissionText();
    hideDock();
    clearLog();
    addLog(t('linkUp'), 'acc');
    scene?.setMission(mission);
    renderDefinition();
    renderControls();
  }

  function renderMissionText() {
    const mission = m();
    missionKicker.textContent = t('kicker', mi + 1, MISSIONS.length);
    missionTitle.textContent = mission.title;
    fill(missionBrief, termify(mission.brief));
    missionNote.hidden = !mission.delay;
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
      addLog(t('sending'));
      const parsed = parseProgram(code, getLang());
      if (!parsed.ok) {
        const { error } = parsed;
        addLog(error.message, 'bad');
        addLog(error.hint, 'acc');
        say(error.plainEnglish ? t('noEnglish') : t('unknownCmd'), 'bad');
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
      addLog(t('noInstructions'), 'bad');
      say(t('waiting'));
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
    showTele('log');
    const mission = m();
    if (!exec) {
      if (!prepare()) return;
      if (mission.delay) {
        busy = true;
        renderControls();
        addLog(t('locked'), 'acc');
        await predict();
        if (disposed) return;
        if (!exec) return void ((busy = false), renderControls()); // the demo was skipped mid-prediction
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
      say(t('say')[step.cmd]);
    } else if (step.event === 'move') {
      sfx.move();
    }
    await scene?.play(step, SPEEDS[speed].ms);
    if (disposed || !exec) return;
    if (step.sample) {
      sfx.pick();
      say(t('say').sample, 'ok');
      addLog(t('sampleLog'), 'ok');
    }
    if (step.event === 'crash' || step.event === 'offmap') {
      sfx.crash();
      flash.classList.remove('on');
      void flash.offsetWidth;
      flash.classList.add('on');
      say(t('say')[step.event], 'bad');
      addLog(step.event === 'crash' ? t('crashLog') : t('offmapLog'), 'bad');
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
      addLog(hitIt ? t('predRight') : t('predWrong'), hitIt ? 'ok' : 'acc');
    }
    if (sim.reached) {
      won = true;
      if (mission.delay) finalProgram = cmds;
      sfx.win();
      say(t('flagReached'), 'ok');
      addLog(t('success'), 'ok');
      scene?.celebrate();
      solved.add(mi);
      later(() => debrief(sim, { cmds, runs, lines }), 1100);
    } else if (!demoing) {
      if (!sim.crashed) {
        addLog(t('notAtFlag'), 'bad');
        say(t('notFlagSay'));
        sfx.error();
      }
      if (mission.delay) addLog(t('delayFix'), 'acc');
    }
    renderControls();
  }

  function resetRun() {
    if (busy) return;
    won = false; // after a win, Reset lets the player drive the mission again
    exec = null;
    prediction = null;
    scene?.reset();
    addLog(t('backAtStart'));
    renderControls();
  }

  /** Mission 4: ask where the rover will stop before the signal arrives. */
  function predict() {
    return new Promise((resolve) => {
      if (!scene) return resolve();
      const done = (tile) => {
        cancelPick = null;
        scene.setPicking(false);
        pickBar.classList.remove('show');
        if (tile) {
          prediction = tile;
          scene.setPrediction(tile);
          addLog(t('predLogged', tile.x + 1, tile.y + 1), 'acc');
        }
        resolve();
      };
      fill(pickBar,
        h('span', {}, icon('target'), h('span', {}, termify(t('pickPrompt')))),
        h('button', { class: 'kvx-btn small', type: 'button', onclick: () => done(null) }, t('skip')));
      pickBar.classList.add('show');
      cancelPick = () => done(null);
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
        h('div', {}, t('inTransit'), time));
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
          addLog(t('received'), 'acc');
          resolve();
        }, 450);
        return IDLE;
      });
    });
  }

  // ---------------------------------------------------------------- focus mode

  /** Move the game over the whole window. The page underneath is locked, so nothing scrolls. */
  function enterFocus() {
    if (focused) return;
    focused = true;
    placeholder = h('div', { class: 'kvx-placeholder', style: { height: `${root.offsetHeight}px` } },
      h('span', {}, icon('unfold'), t('placeholder')),
      h('button', { class: 'kvx-btn small', type: 'button', onclick: () => exitFocus() }, t('bringBack')));
    root.replaceWith(placeholder);
    document.body.append(root);
    root.classList.add('focus');
    document.documentElement.classList.add('kvx-locked');
    root.focus({ preventScroll: true });
    renderTools();
  }

  function exitFocus() {
    if (!focused) return;
    if (document.fullscreenElement === root) document.exitFullscreen?.().catch(() => {});
    focused = false;
    root.classList.remove('focus');
    placeholder?.replaceWith(root);
    placeholder = null;
    document.documentElement.classList.remove('kvx-locked');
    renderTools();
    root.scrollIntoView({ block: 'nearest' });
  }

  function toggleFullscreen() {
    if (!focused) enterFocus();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else root.requestFullscreen?.().catch(() => {});
  }

  // ---------------------------------------------------------------- how-to-play demo

  /** Back to an untouched mission: empty program, rover at the start, fresh telemetry. */
  function resetEditor(message) {
    const mission = m();
    won = false;
    exec = null;
    busy = false;
    prediction = null;
    runs = 0;
    program = [];
    pool = mission.pool ? [...mission.pool] : [];
    code = mission.starter || '';
    scene?.reset();
    clearLog();
    if (message) addLog(message, 'acc');
    renderControls();
  }

  // Each demo uses the real controls through a ghost cursor, with the explanation beside it.
  // Demo programs are short and never solve the mission: they show how to play, not the answer.
  const explain = (text) => director.say(text);
  const find = (sel) => controls.querySelector(sel) || root.querySelector(sel);
  const programList = () => find('.kvx-program:not(.kvx-pool)');
  const insButton = (label) => [...controls.querySelectorAll('.kvx-ins')].find((b) => b.textContent === label);

  /** Where a map square is, in the root's coordinates (for pointing at it). */
  function tilePoint(t) {
    const p = scene.tileOnScreen(t.x, t.y);
    const c = viewport.getBoundingClientRect();
    const o = root.getBoundingClientRect();
    return { x: c.left - o.left + p.x, y: c.top - o.top + p.y };
  }

  /** Point at the program, press Run, and narrate while the rover drives. */
  async function demoRun(during, after) {
    await director.click(runFab, 800);
    explain(during);
    await runAll();
    await director.sleep(400);
    explain(after);
    await director.moveTo(log, 900);
    await director.sleep(2600);
  }

  async function demoBuild() {
    explain(t('d').buildCommands);
    await director.moveTo(find('.kvx-palette'), 900);
    await director.sleep(1600);
    explain(t('d').buildDrag);
    await director.drag(find('.kvx-palette .kvx-chip[data-cmd="forward"]'), programList(), 1000);
    clickChip('palette', 0, 'forward');
    await director.sleep(700);
    explain(t('d').buildPad);
    await director.click(padKeys.forward, 1000);
    addCommand('forward');
    await director.sleep(1200);
    explain(t('d').buildTurn);
    await director.click(padKeys.right, 600);
    addCommand('right');
    await director.sleep(1400);
    explain(t('d').buildProgram);
    await director.moveTo(programList(), 900);
    await director.sleep(2000);
    await demoRun(t('d').buildRun, t('d').buildAfter);
  }

  async function demoOrder() {
    explain(t('d').orderWrong);
    await director.moveTo(find('.kvx-pool'), 900);
    await director.sleep(1800);
    explain(t('d').orderTap);
    await director.click(find('.kvx-pool .kvx-chip'), 700);
    clickChip('pool', 0, pool[0]);
    await director.sleep(700);
    explain(t('d').orderMoves);
    await director.moveTo(find('.kvx-program:not(.kvx-pool) .kvx-chip'), 800);
    await director.sleep(1500);
    explain(t('d').orderBack);
    await director.press();
    clickChip('program', 0, program[0]);
    await director.sleep(1300);
    explain(t('d').orderPad);
    await director.click(padKeys.forward, 1000);
    addCommand('forward');
    await director.sleep(1400);
    explain(t('d').orderRun);
    await director.moveTo(runFab, 900);
    await director.sleep(2400);
  }

  async function demoCode() {
    code = '';
    renderControls();
    explain(t('d').codeWrite);
    await director.moveTo(find('textarea'), 900);
    await director.sleep(1800);
    explain(t('d').codeInsert);
    for (const label of ['forward()', 'left()', 'forward()']) {
      await director.click(insButton(label), 650);
      insert(label);
      await director.sleep(450);
    }
    explain(t('d').codeThree);
    await director.moveTo(insButton('forward(3)'), 700);
    await director.sleep(1800);
    await demoRun(t('d').codeRun, t('d').codeAfter);
  }

  async function demoDelay() {
    const cmds = ['forward', 'forward'];
    const stop = simulate(m(), cmds).end;
    explain(t('d').delaySame);
    await director.moveTo(find('.kvx-palette'), 900);
    await director.sleep(2000);
    explain(t('d').delayBuild);
    for (const cmd of cmds) {
      await director.click(padKeys[cmd], 800);
      addCommand(cmd);
      await director.sleep(400);
    }
    explain(t('d').delayTransmit);
    await director.click(runFab, 900);
    const running = runAll();
    if (scene) {
      while (!pickBar.classList.contains('show')) await director.sleep(80);
      explain(t('d').delayPick);
      await director.moveTo(tilePoint(stop), 1100);
      await director.sleep(900);
      await director.press();
      scene.opts.onPick?.(stop);
      explain(t('d').delaySignal);
    }
    await running;
    explain(t('d').delayAfter);
    await director.sleep(2800);
  }

  /** Play the demo for this mission. */
  async function runDemo() {
    if (demoing || busy) return;
    played = true;
    setDockOpen(false);
    enterFocus();
    resetEditor();
    demoing = true;
    root.classList.add('demoing');
    showTele('log');
    director.start();
    try {
      await director.sleep(500);
      const mission = m();
      if (mission.mode === 'order') await demoOrder();
      else if (mission.mode === 'code') await demoCode();
      else if (mission.delay) await demoDelay();
      else await demoBuild();
      explain(mission.mode === 'code' ? t('d').yourTurnCode : t('d').yourTurn);
      await director.moveTo(mission.mode === 'code' ? runFab : padKeys.forward, 900);
      await director.sleep(2000);
    } catch (err) {
      if (!(err instanceof Cancelled)) console.error(err);
    } finally {
      endDemo();
    }
  }

  function stopDemo() {
    if (demoing) director.cancel();
  }

  function endDemo() {
    director.cancel();
    cancelPick?.();
    demoing = false;
    root.classList.remove('demoing');
    resetEditor(t('demoDone'));
  }

  // ---------------------------------------------------------------- debrief and checkpoint

  function debrief(sim, run) {
    lastDebrief = [sim, run];
    const mission = m();
    const items = report(mission, sim, run, getLang());
    const status = h('p', { class: 'kvx-why' });
    const next = h('div', { class: 'kvx-actions' });
    const already = unlocked.has(mi);
    const options = mission.check.options.map((text, i) => h('button', { class: 'kvx-answer', type: 'button', onclick: (e) => answer(i, e.currentTarget) }, h('i', {}, 'ABC'[i]), h('span', {}, text)));
    const optionBox = h('div', { class: 'kvx-options' }, options);
    const showNext = () => {
      const last = mi === MISSIONS.length - 1;
      fill(next,
        h('button', { class: 'kvx-run guide', type: 'button', onclick: () => (last ? startFinal() : goMission(mi + 1)) }, last ? t('finalChallenge') : t('nextMission'), icon('arrowRight')),
        h('button', { class: 'kvx-btn', type: 'button', title: t('resetFab'), onclick: () => resetRun() }, icon('reset'), t('playAgain')));
    };
    showDock('check', already ? t('completeUnlocked', mi + 1) : t('complete', mi + 1), already ? mission.title : mission.check.q, [
      h('ul', { class: 'kvx-chips' }, items.map((it) => h('li', { class: it.ok ? 'ok' : '' }, icon(it.ok ? 'check' : 'info'), h('span', {}, termify(it.text))))),
      already
        ? h('p', { class: 'kvx-why ok' }, h('b', {}, t('checkpointDone')), termify(mission.check.why))
        : [h('div', { class: 'kvx-hint cmd' }, t('checkpointHint')), optionBox],
      status, next], already ? t('pillNext') : t('pillWaiting'));
    if (already) showNext();

    function answer(i, btn) {
      if (i === mission.check.answer) {
        btn.classList.add('right');
        options.forEach((b) => (b.disabled = true));
        fill(status, h('b', {}, t('correct')), termify(mission.check.why));
        status.className = 'kvx-why ok';
        unlocked.add(mi);
        renderDefinition(mi);
        renderTabs();
        sfx.unlock();
        dockKicker.textContent = t('completeUnlocked', mi + 1);
        setPill(t('pillNext'));
        showNext();
      } else {
        btn.classList.add('wrong');
        btn.disabled = true;
        sfx.error();
        fill(status, h('b', {}, t('notQuite')), termify(mission.check.wrong[i]), t('tryAgain'));
        status.className = 'kvx-why bad';
      }
    }
  }

  // ---------------------------------------------------------------- final challenge

  function startFinal() {
    if (demoing || busy) return;
    hideDock();
    main.hidden = true;
    root.querySelector('.kvx-def').hidden = true;
    final.classList.add('show');
    const parts = MISSIONS.map((x) => localizeMission(x, getLang()).part);
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
          fill(msg, t('notYet'));
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
        fill(msg, h('b', {}, t('perfect')));
        msg.className = 'kvx-why ok';
        fill(after,
          h('h3', { class: 'kvx-title' }, t('didIt')),
          h('p', { class: 'kvx-brief' }, termify(t('pythonIntro'))),
          h('pre', { class: 'kvx-py' }, toPython(finalProgram, 'Mission 4: reach the flag on Mars')),
          h('p', { class: 'kvx-brief' }, h('b', {}, t('thinkLabel')), t('thinkText')),
          h('button', { class: 'kvx-btn', type: 'button', onclick: restart }, icon('undo'), t('replay')));
      } }, p);
      return b;
    }));
    fill(final,
      h('div', { class: 'kvx-kicker' }, t('finalChallenge')),
      h('h3', { class: 'kvx-title' }, t('finalTitle')),
      h('p', { class: 'kvx-brief' }, t('finalBrief')),
      h('p', { class: 'kvx-sentence' }, definition(getLang()).map((part) => (typeof part === 'string' ? part : blanks[part]))),
      bank, msg, after);
    renderTabs();
  }

  function leaveFinal() {
    if (!final.classList.contains('show')) return;
    final.classList.remove('show');
    main.hidden = false;
    root.querySelector('.kvx-def').hidden = false;
  }

  function restart() {
    unlocked.clear();
    solved.clear();
    finalProgram = [];
    leaveFinal();
    loadMission(0);
  }

  // ---------------------------------------------------------------- keyboard

  root.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('button, textarea, input, select, a')) root.focus({ preventScroll: true });
  }, { signal: listeners.signal });

  // Keys work while the game has the screen (focus mode) or keyboard focus.
  document.addEventListener('keydown', (e) => {
    if (!focused && !root.contains(document.activeElement)) return;
    const tag = e.target.tagName;
    const typing = tag === 'TEXTAREA' || tag === 'INPUT';
    if (e.key === 'Escape') {
      if (demoing) stopDemo();
      else if (dock.classList.contains('open')) setDockOpen(false);
      else if (document.fullscreenElement) return; // the browser leaves full screen first
      else if (focused && !typing) exitFocus();
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (demoing) return e.preventDefault();
    if (final.classList.contains('show')) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const mission = m();
    const cmd = { ArrowUp: 'forward', ArrowLeft: 'left', ArrowRight: 'right' }[key];
    if (cmd) {
      e.preventDefault();
      addCommand(cmd);
      return;
    }
    const actions = {
      Backspace: () => undoCommand(),
      r: () => resetRun(),
      v: () => setView(view === 'mission' ? 'plan' : 'mission'),
      '+': () => scene?.zoomBy(0.8),
      '=': () => scene?.zoomBy(0.8),
      '-': () => scene?.zoomBy(1.25),
      0: () => scene?.recenter(),
      '?': () => runDemo(),
      h: () => runDemo(),
      m: () => (sfx.toggle(), renderTools()),
      f: () => toggleFullscreen(),
    };
    if (tag !== 'BUTTON') {
      actions.Enter = () => runAll();
      actions[' '] = () => runStep();
    }
    if (actions[key]) {
      e.preventDefault();
      actions[key]();
    }
  }, { signal: listeners.signal });

  // ---------------------------------------------------------------- start

  renderStatic();
  renderTools();
  showTele('log');
  loadMission(0);

  /** The language changed (top bar switch): redraw every word in place. Progress is kept. */
  function relocalize() {
    if (demoing) stopDemo();
    renderStatic();
    renderTools();
    renderMissionText();
    renderDefinition();
    renderControls();
    showTele(teleMode);
    if (dockKind && lastDebrief) {
      const open = dock.classList.contains('open');
      debrief(...lastDebrief);
      setDockOpen(open);
    }
    if (final.classList.contains('show')) startFinal();
  }
  document.addEventListener('kv-lang-changed', relocalize, { signal: listeners.signal });

  // The 3D world (and the three.js bundle) loads only when the game comes into view.
  const stopWaiting = whenVisible(root, async () => {
    try {
      const { MarsScene } = await import('./rover/scene.js');
      if (disposed) return;
      scene = new MarsScene(viewport, { captureWheel: () => focused });
      scene.setMission(m());
      scene.setView(view);
      poster.classList.add('gone');
    } catch (err) {
      console.error(err);
      posterText.textContent = t('noScene');
      poster.dataset.failed = '';
    }
  });

  // Leaving full screen with the browser's own controls keeps focus mode; refresh the buttons.
  document.addEventListener('fullscreenchange', () => renderTools(), { signal: listeners.signal });
  document.addEventListener('kv-words-changed', () => showTele(teleMode), { signal: listeners.signal });

  return () => {
    disposed = true;
    director.cancel();
    if (focused) {
      if (document.fullscreenElement === root) document.exitFullscreen?.().catch(() => {});
      root.remove();
      document.documentElement.classList.remove('kvx-locked');
    }
    stopWaiting();
    listeners.abort();
    clearTimeout(bubbleTimer);
    timers.forEach(clearTimeout);
    scene?.dispose();
    scene = null;
  };
}
