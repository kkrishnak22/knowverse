// Tea game: the steps for making tea are given, but in the wrong order. The student drags them
// into order and runs them one at a time. The kitchen robot does each step literally — it boils
// an empty kettle or pours cold water without complaining — so the student sees why the order
// of a program matters and that a computer never fixes your steps for you.
//
//   ```kv-tea
//   ```

import { h, icon } from '../ui.js';

const STEPS = {
  fill: { label: 'Fill the kettle with water', tip: 'Puts cold water in the kettle' },
  boil: { label: 'Boil the kettle', tip: 'Heats whatever is in the kettle' },
  leaves: { label: 'Put tea leaves in the cup', tip: 'Drops tea leaves into the cup' },
  pour: { label: 'Pour the kettle into the cup', tip: 'Pours whatever is in the kettle into the cup' },
  sugar: { label: 'Add sugar to the cup', tip: 'Drops a spoon of sugar into the cup' },
  stir: { label: 'Stir the cup', tip: 'Stirs whatever is in the cup right now' },
};

const LEVELS = [
  { title: 'Make a cup of tea', start: ['pour', 'boil', 'leaves', 'fill'] },
  { title: 'Make sweet tea', start: ['stir', 'pour', 'sugar', 'boil', 'leaves', 'fill'] },
];

const fresh = () => ({ kettle: { water: false, hot: false }, cup: { water: null, leaves: false, sugar: false, mixed: false } });

/** Do one step exactly as written. Returns a sentence saying what happened. */
export function doStep(s, cmd) {
  switch (cmd) {
    case 'fill':
      s.kettle = { water: true, hot: false };
      return { text: 'Cold water goes into the kettle.' };
    case 'boil':
      if (!s.kettle.water) return { text: 'The kettle is <b>empty</b>, so nothing gets hot. The robot does not stop to ask why.', odd: true };
      s.kettle.hot = true;
      return { text: 'The water in the kettle is now hot.' };
    case 'leaves':
      s.cup.leaves = true;
      return { text: 'Tea leaves go into the cup.' };
    case 'pour':
      if (!s.kettle.water) return { text: '<b>Nothing comes out.</b> The kettle is empty. The robot tips it anyway.', odd: true };
      s.cup.water = s.kettle.hot ? 'hot' : 'cold';
      s.kettle.water = false;
      if (s.cup.sugar && !s.cup.mixed) s.cup.mixed = false;
      return s.cup.water === 'hot' ? { text: 'Hot water goes into the cup.' } : { text: '<b>Cold</b> water goes into the cup. The robot was never told to boil it first.', odd: true };
    case 'sugar':
      s.cup.sugar = true;
      s.cup.mixed = false;
      return { text: 'Sugar drops to the bottom of the cup.' };
    default:
      if (!s.cup.water) return { text: 'The robot stirs a cup with <b>no water</b> in it.', odd: true };
      if (!s.cup.sugar) return { text: 'The robot stirs, but there is <b>no sugar</b> in the cup yet.', odd: true };
      s.cup.mixed = true;
      return { text: 'The sugar mixes into the tea.' };
  }
}

/** Look at the cup when the program ends. */
export function verdict(s, level) {
  const sweet = LEVELS[level].start.includes('sugar');
  if (!s.cup.water) return { win: false, text: '<b>The cup has no water in it.</b> The kettle was poured before it was filled.' };
  if (s.cup.water === 'cold') return { win: false, text: '<b>Cold water and tea leaves. That is not tea.</b> The water was poured before it was boiled.' };
  if (sweet && !s.cup.mixed) return { win: false, text: '<b>The sugar is sitting at the bottom.</b> The cup was stirred before the sugar went in.' };
  return { win: true, text: '<b>A perfect cup of tea!</b> Same steps as before. Only the order changed.' };
}

const SCENE = `
<svg viewBox="0 0 520 300" role="img" aria-label="A kettle on a stove and a cup on a table">
  <defs>
    <clipPath id="kv-tea-kettle"><rect x="84" y="150" width="92" height="68" rx="12"/></clipPath>
    <clipPath id="kv-tea-cup"><path d="M338 150h84l-8 82a8 8 0 0 1-8 7h-52a8 8 0 0 1-8-7z"/></clipPath>
  </defs>
  <rect x="20" y="244" width="480" height="10" rx="5" fill="#1c2236"/>
  <g class="t-stove"><rect x="62" y="226" width="136" height="18" rx="6" fill="#232a40"/><rect x="74" y="231" width="112" height="4" rx="2" class="t-ring"/></g>
  <g class="t-flames"><path d="M100 226c-6-10 4-12 2-22 9 6 10 14 6 22zM130 226c-8-12 5-15 2-28 12 8 13 18 7 28zM160 226c-6-10 4-12 2-22 9 6 10 14 6 22z" fill="#fb923c"/></g>
  <g class="t-kettle">
    <path d="M108 138c0-26 44-26 44 0" fill="none" stroke="#8b93a7" stroke-width="7" stroke-linecap="round"/>
    <path d="M176 168l34-16 4 9-38 26z" fill="#aab3c9"/>
    <rect x="80" y="146" width="100" height="76" rx="16" fill="#aab3c9"/>
    <g clip-path="url(#kv-tea-kettle)"><rect x="84" y="150" width="92" height="68" fill="#0b0e17"/><rect class="t-kwater" x="84" y="218" width="92" height="52"/></g>
    <rect x="118" y="136" width="24" height="12" rx="5" fill="#8b93a7"/>
    <g class="t-ksteam"><path d="M214 140c-8-10 8-14 0-26M226 144c-8-10 8-14 0-26" fill="none" stroke="#e7eaf3" stroke-width="3" stroke-linecap="round"/></g>
  </g>
  <path class="t-stream" d="M336 96q28 6 44 60" fill="none" stroke-width="7" stroke-linecap="round"/>
  <g class="t-cup">
    <g clip-path="url(#kv-tea-cup)">
      <rect x="336" y="148" width="90" height="94" fill="#0b0e17"/>
      <rect class="t-cwater" x="336" y="242" width="90" height="74"/>
      <g class="t-sugar"><path d="M352 239q28-22 56 0z" fill="#f8fafc"/></g>
      <g class="t-leaves" fill="#3f6212"><ellipse cx="358" cy="232" rx="7" ry="3" transform="rotate(-20 358 232)"/><ellipse cx="376" cy="235" rx="7" ry="3" transform="rotate(15 376 235)"/><ellipse cx="394" cy="231" rx="7" ry="3" transform="rotate(-10 394 231)"/><ellipse cx="406" cy="236" rx="6" ry="3" transform="rotate(25 406 236)"/><ellipse cx="368" cy="226" rx="6" ry="3" transform="rotate(40 368 226)"/></g>
    </g>
    <path d="M338 150h84l-8 82a8 8 0 0 1-8 7h-52a8 8 0 0 1-8-7z" fill="none" stroke="#e7eaf3" stroke-width="4" stroke-linejoin="round"/>
    <path d="M421 168c26-4 26 40-4 38" fill="none" stroke="#e7eaf3" stroke-width="4" stroke-linecap="round"/>
    <g class="t-spoon"><rect x="377" y="96" width="5" height="120" rx="2.5" fill="#cbd5e1"/></g>
    <g class="t-csteam"><path d="M362 138c-8-10 8-14 0-26M380 134c-8-10 8-14 0-26M398 138c-8-10 8-14 0-26" fill="none" stroke="#e7eaf3" stroke-width="3" stroke-linecap="round"/></g>
  </g>
  <g class="t-drop t-drop-leaves" fill="#4d7c0f"><ellipse cx="372" cy="80" rx="7" ry="3"/><ellipse cx="388" cy="70" rx="7" ry="3"/><ellipse cx="380" cy="92" rx="6" ry="3"/></g>
  <g class="t-drop t-drop-sugar" fill="#f8fafc"><rect x="372" y="76" width="7" height="7" rx="1.5"/><rect x="384" y="68" width="7" height="7" rx="1.5"/><rect x="378" y="88" width="7" height="7" rx="1.5"/></g>
  <g class="t-tap"><rect x="122" y="40" width="16" height="50" rx="4" fill="#8b93a7"/><rect class="t-tapwater" x="127" y="90" width="6" height="52" rx="3" fill="#38bdf8"/></g>
  <text x="130" y="276" class="t-cap">KETTLE</text><text x="380" y="276" class="t-cap">CUP</text>
</svg>`;

export function mountTea(el) {
  let li = 0;
  let program = [];
  let pc = 0;
  let s = fresh();
  let state = 'build'; // build | running | won | lost
  let moved = false;
  let timer = null;
  let actTimer = null;
  let dragFrom = null;
  let last = null;

  const scene = h('div', { class: 'kvt-scene', html: SCENE });
  const caption = h('div', { class: 'kvr-caption', 'aria-live': 'polite' });
  const list = h('ol', { class: 'kvr-program kvt-program' });
  const title = h('span', { class: 'kvr-title' });
  const levelLabel = h('span', { class: 'kvr-level' });
  const stepBtn = h('button', { class: 'kv-next', type: 'button', title: 'Do the next step, exactly as written', onclick: () => step() }, h('span', {}, 'Run one step'), icon('chevron'));
  const runBtn = h('button', { class: 'btn small-btn', type: 'button', title: 'Run every step, one after another', onclick: () => runAll() }, icon('play'), 'Run all');
  const againBtn = h('button', { class: 'btn ghost small-btn', type: 'button', title: 'Empty the kettle and the cup. Your order stays', onclick: () => rewind() }, icon('undo'), 'Start again');
  const nextLevelBtn = h('button', { class: 'btn primary small-btn hidden', type: 'button', onclick: () => load(li + 1) }, 'Next level', icon('arrowRight'));

  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    list.classList.add('over');
  });
  list.addEventListener('dragleave', () => list.classList.remove('over'));
  list.addEventListener('drop', (e) => {
    e.preventDefault();
    list.classList.remove('over');
    if (dragFrom == null) return;
    const items = [...list.querySelectorAll('li.kvr-step')];
    let to = items.findIndex((it) => e.clientY < it.getBoundingClientRect().top + it.offsetHeight / 2);
    if (to < 0) to = items.length;
    move(dragFrom, to > dragFrom ? to - 1 : to);
    dragFrom = null;
  });

  el.classList.add('kv-robot', 'kv-tea');
  el.replaceChildren(
    h('div', { class: 'kvr-stage' },
      h('div', { class: 'kvr-head' }, h('span', { class: 'kv-lab-title' }, icon('target'), title), levelLabel),
      scene,
      caption,
    ),
    h('div', { class: 'kvr-side' },
      h('div', { class: 'kvr-side-head' }, 'The program', h('span', {}, 'runs top to bottom')),
      list,
      h('div', { class: 'kvr-actions' }, stepBtn, runBtn),
      h('div', { class: 'kvr-actions' }, againBtn, nextLevelBtn),
    ),
  );

  function move(from, to) {
    if (from === to || to < 0 || to >= program.length) return;
    const [item] = program.splice(from, 1);
    program.splice(to, 0, item);
    moved = true;
    rewind();
  }

  function load(index) {
    li = (index + LEVELS.length) % LEVELS.length;
    program = [...LEVELS[li].start];
    moved = false;
    title.textContent = LEVELS[li].title;
    levelLabel.textContent = `Level ${li + 1} of ${LEVELS.length}`;
    rewind();
  }

  function rewind() {
    clearTimeout(timer);
    s = fresh();
    pc = 0;
    state = 'build';
    last = null;
    act(null);
    draw();
  }

  /** Play the short animation for one step (tap, flames, tilt, drop, stir). */
  function act(cmd) {
    clearTimeout(actTimer);
    scene.dataset.act = '';
    if (!cmd) return;
    void scene.offsetWidth;
    scene.dataset.act = cmd;
    actTimer = setTimeout(() => (scene.dataset.act = ''), 1100);
  }

  function draw() {
    const d = scene.dataset;
    d.kwater = s.kettle.water ? (s.kettle.hot ? 'hot' : 'cold') : 'none';
    d.cwater = s.cup.water ? (s.cup.water === 'hot' && s.cup.leaves ? 'tea' : s.cup.water) : 'none';
    d.leaves = s.cup.leaves ? (s.cup.water ? 'wet' : 'dry') : 'none';
    d.sugar = s.cup.sugar && !s.cup.mixed ? 'yes' : 'no';
    d.csteam = s.cup.water === 'hot' ? 'yes' : 'no';
    d.end = state === 'won' ? 'won' : state === 'lost' ? 'lost' : '';

    const over = state === 'won' || state === 'lost';
    list.replaceChildren(...program.map((cmd, i) => h('li', {
      class: `kvr-step ${i === pc && pc > 0 && !over ? 'next' : ''} ${i < pc ? 'done' : ''} ${last?.odd && i === pc - 1 ? 'bad' : ''}`, draggable: 'true', title: `${STEPS[cmd].tip}. Drag to move it`,
      ondragstart: (e) => {
        dragFrom = i;
        e.dataTransfer.setData('text/plain', cmd);
        e.dataTransfer.effectAllowed = 'move';
      },
    }, icon('grip', 'kvr-grip'), h('span', { class: 'kvr-n' }, i + 1), h('span', { class: 'kvr-t' }, STEPS[cmd].label),
      h('button', { class: 'kvr-x', type: 'button', title: 'Move up', 'aria-label': `Move step ${i + 1} up`, disabled: i === 0, onclick: () => move(i, i - 1) }, icon('arrowUp')),
      h('button', { class: 'kvr-x kvt-down', type: 'button', title: 'Move down', 'aria-label': `Move step ${i + 1} down`, disabled: i === program.length - 1, onclick: () => move(i, i + 1) }, icon('arrowUp')))));

    stepBtn.disabled = runBtn.disabled = over || state === 'running';
    againBtn.disabled = pc === 0;
    list.classList.toggle('guide', !moved && pc === 0);
    stepBtn.classList.toggle('guide', moved && pc === 0);
    nextLevelBtn.classList.toggle('hidden', state !== 'won');
    nextLevelBtn.replaceChildren(li + 1 < LEVELS.length ? 'Next level' : 'Play level 1 again', icon('arrowRight'));
    caption.className = `kvr-caption ${state === 'won' ? 'won' : state === 'lost' ? 'bumped' : last?.odd ? 'ended' : ''}`;
    caption.innerHTML = over ? `${verdict(s, li).text}${state === 'lost' ? ' Click <b>Start again</b> and change the order.' : ''}`
      : pc === 0 ? (moved ? 'Now click <b>Run one step</b>. The robot will do step 1, exactly as written.' : 'These steps are in the <b>wrong order</b>. Drag them into the right order, or run them as they are and see what happens.')
      : `Step ${pc}: ${last.text}`;
  }

  function step() {
    if (pc >= program.length || state === 'won' || state === 'lost') return false;
    const cmd = program[pc++];
    scene.dataset.stream = s.kettle.water ? (s.kettle.hot ? 'hot' : 'cold') : 'none';
    last = doStep(s, cmd);
    act(cmd);
    if (pc >= program.length) {
      draw();
      // Let the last animation finish, then judge the cup.
      state = 'running';
      stepBtn.disabled = runBtn.disabled = true;
      timer = setTimeout(() => {
        state = verdict(s, li).win ? 'won' : 'lost';
        draw();
      }, 1300);
      return false;
    }
    draw();
    return true;
  }

  function runAll() {
    const tick = () => {
      if (step()) {
        stepBtn.disabled = runBtn.disabled = true;
        timer = setTimeout(tick, 1300);
      }
    };
    tick();
  }

  load(0);
  return () => {
    clearTimeout(timer);
    clearTimeout(actTimer);
  };
}
