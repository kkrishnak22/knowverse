// Robot game: the student builds a program by dragging instruction cards into a list, then runs
// it one step at a time. The robot does exactly what each card says — nothing more — which is
// the whole idea of programming, learned by doing it.
//
//   ```kv-robot
//   title: Take the robot to the star
//   .....
//   .>.*.        . floor   # wall   * star   > < ^ v robot (and the way it faces)
//   .....
//   ---
//   title: Go around the wall
//   ...
//   ```

import { h, icon } from '../ui.js';

const COMMANDS = {
  forward: { label: 'Move forward', ico: 'arrowUp', tip: 'The robot moves one square the way it is facing' },
  left: { label: 'Turn left', ico: 'turnLeft', tip: 'The robot turns left. It stays on the same square' },
  right: { label: 'Turn right', ico: 'turnRight', tip: 'The robot turns right. It stays on the same square' },
};
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
const FACING = { '^': 0, '>': 1, v: 2, '<': 3 };
const CELL = 56;

export function parseLevels(src) {
  return String(src).split(/^---\s*$/m).map((part) => {
    const level = { title: '', rows: [], start: { x: 0, y: 0, dir: 1 }, goal: null };
    for (const raw of part.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const t = line.match(/^title:\s*(.*)$/i);
      if (t) {
        level.title = t[1];
        continue;
      }
      const y = level.rows.length;
      [...line].forEach((ch, x) => {
        if (ch in FACING) level.start = { x, y, dir: FACING[ch] };
        if (ch === '*') level.goal = { x, y };
      });
      level.rows.push([...line].map((ch) => (ch === '#' ? '#' : '.')));
    }
    return level;
  }).filter((l) => l.rows.length);
}

const ROBOT_SVG = '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><path d="M24 3l7 9H17z" fill="#5eead4"/><rect x="9" y="13" width="30" height="27" rx="8" fill="#e7eaf3"/><rect x="14" y="19" width="20" height="10" rx="5" fill="#0b0e17"/><circle cx="19.5" cy="24" r="2.4" fill="#5eead4"/><circle cx="28.5" cy="24" r="2.4" fill="#5eead4"/><rect x="18" y="33" width="12" height="2.6" rx="1.3" fill="#8b93a7"/><rect x="4" y="21" width="5" height="11" rx="2.5" fill="#8b93a7"/><rect x="39" y="21" width="5" height="11" rx="2.5" fill="#8b93a7"/></svg>';
const STAR_SVG = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5l-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9z" fill="#fbbf24" stroke="#f59e0b" stroke-width="1"/></svg>';

export function mountRobot(el, src) {
  const levels = parseLevels(src);
  if (!levels.length) {
    el.textContent = 'This game has no levels.';
    return () => {};
  }
  let li = 0;
  let program = [];
  let pc = 0; // next step to run
  let pos = null; // { x, y, rot } — rot is in quarter turns and keeps growing so turns animate the short way
  let state = 'build'; // build | running | won | bumped | ended
  let timer = null;
  let dragFrom = null;

  const board = h('div', { class: 'kvr-board' });
  const robot = h('div', { class: 'kvr-robot', title: 'The robot. The green tip shows which way it is facing', html: ROBOT_SVG });
  const caption = h('div', { class: 'kvr-caption', 'aria-live': 'polite' });
  const list = h('ol', { class: 'kvr-program', title: 'Your program: the robot runs these steps from top to bottom' });
  const levelLabel = h('span', { class: 'kvr-level' });
  const stepBtn = h('button', { class: 'kv-next', type: 'button', onclick: () => step() }, h('span', {}, 'Run one step'), icon('chevron'));
  const runBtn = h('button', { class: 'btn small-btn', type: 'button', title: 'Run every step, one after another', onclick: () => runAll() }, icon('play'), 'Run all');
  const againBtn = h('button', { class: 'btn ghost small-btn', type: 'button', title: 'Put the robot back at the start. Your program stays', onclick: () => rewind() }, icon('undo'), 'Start again');
  const clearBtn = h('button', { class: 'btn ghost small-btn', type: 'button', title: 'Remove every step from your program', onclick: () => {
    program = [];
    rewind();
  } }, icon('trash'), 'Clear');
  const nextLevelBtn = h('button', { class: 'btn primary small-btn hidden', type: 'button', onclick: () => load(li + 1) }, 'Next level', icon('arrowRight'));

  const palette = h('div', { class: 'kvr-palette' }, Object.entries(COMMANDS).map(([cmd, c]) => h('button', {
    class: 'kvr-card', type: 'button', draggable: 'true', title: `${c.tip}. Drag it into your program, or click it`,
    ondragstart: (e) => {
      dragFrom = { cmd };
      e.dataTransfer.setData('text/plain', cmd);
      e.dataTransfer.effectAllowed = 'copyMove';
    },
    onclick: () => insert(cmd, program.length),
  }, icon('grip', 'kvr-grip'), icon(c.ico), c.label)));

  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    list.classList.add('over');
  });
  list.addEventListener('dragleave', () => list.classList.remove('over'));
  list.addEventListener('drop', (e) => {
    e.preventDefault();
    list.classList.remove('over');
    if (!dragFrom) return;
    // Insert before the first step whose middle is below the mouse.
    const items = [...list.querySelectorAll('li.kvr-step')];
    let to = items.findIndex((it) => e.clientY < it.getBoundingClientRect().top + it.offsetHeight / 2);
    if (to < 0) to = items.length;
    if (dragFrom.index != null) {
      const [moved] = program.splice(dragFrom.index, 1);
      if (dragFrom.index < to) to--;
      program.splice(to, 0, moved);
      rewind();
    } else insert(dragFrom.cmd, to);
    dragFrom = null;
  });

  el.classList.add('kv-robot');
  el.replaceChildren(
    h('div', { class: 'kvr-stage' },
      h('div', { class: 'kvr-head' }, h('span', { class: 'kv-lab-title' }, icon('target'), h('span', { class: 'kvr-title' })), levelLabel),
      h('div', { class: 'kvr-board-wrap' }, board),
      caption,
    ),
    h('div', { class: 'kvr-side' },
      h('div', { class: 'kvr-side-head' }, 'Instructions', h('span', {}, 'drag or click')),
      palette,
      h('div', { class: 'kvr-side-head' }, 'Your program', h('span', {}, 'runs top to bottom')),
      list,
      h('div', { class: 'kvr-actions' }, stepBtn, runBtn),
      h('div', { class: 'kvr-actions' }, againBtn, clearBtn, nextLevelBtn),
    ),
  );

  function insert(cmd, index) {
    program.splice(index, 0, cmd);
    rewind();
  }

  function load(index) {
    li = (index + levels.length) % levels.length;
    program = [];
    const level = levels[li];
    el.querySelector('.kvr-title').textContent = level.title || 'Take the robot to the star';
    levelLabel.textContent = levels.length > 1 ? `Level ${li + 1} of ${levels.length}` : '';
    board.style.gridTemplateColumns = `repeat(${level.rows[0].length}, ${CELL}px)`;
    board.replaceChildren(...level.rows.flatMap((row, y) => row.map((cell, x) => {
      const isGoal = level.goal && level.goal.x === x && level.goal.y === y;
      return h('div', { class: `kvr-cell ${cell === '#' ? 'wall' : ''} ${isGoal ? 'goal' : ''}`, title: cell === '#' ? 'A wall. The robot cannot go through it' : isGoal ? 'The star. Get the robot here' : null, html: isGoal ? STAR_SVG : '' });
    })), robot);
    rewind();
  }

  /** Robot back to the start; program kept. */
  function rewind() {
    clearTimeout(timer);
    const s = levels[li].start;
    pos = { x: s.x, y: s.y, rot: s.dir };
    pc = 0;
    state = 'build';
    robot.classList.remove('bump', 'win');
    draw();
  }

  function draw() {
    robot.style.transform = `translate(${pos.x * (CELL + 4) + 4}px, ${pos.y * (CELL + 4) + 4}px) rotate(${pos.rot * 90}deg)`;
    list.replaceChildren(...(program.length
      ? program.map((cmd, i) => h('li', {
          class: `kvr-step ${i === pc && state !== 'build' && state !== 'won' ? 'next' : ''} ${i < pc ? 'done' : ''} ${state === 'bumped' && i === pc - 1 ? 'bad' : ''}`, draggable: 'true', title: 'Drag to move this step. Click × to remove it',
          ondragstart: (e) => {
            dragFrom = { index: i };
            e.dataTransfer.setData('text/plain', cmd);
            e.dataTransfer.effectAllowed = 'move';
          },
        }, h('span', { class: 'kvr-n' }, i + 1), icon(COMMANDS[cmd].ico), h('span', { class: 'kvr-t' }, COMMANDS[cmd].label),
          h('button', { class: 'kvr-x', type: 'button', title: 'Remove this step', 'aria-label': 'Remove this step', onclick: () => {
            program.splice(i, 1);
            rewind();
          } }, icon('x'))))
      : [h('li', { class: 'kvr-drop' }, 'Drop instructions here')]));
    const empty = !program.length;
    const over = state === 'won' || state === 'bumped' || state === 'ended';
    stepBtn.disabled = runBtn.disabled = empty || over || state === 'running';
    againBtn.disabled = pc === 0 && state === 'build';
    clearBtn.disabled = empty;
    palette.classList.toggle('guide', empty);
    stepBtn.classList.toggle('guide', !empty && pc === 0 && state === 'build');
    nextLevelBtn.classList.toggle('hidden', !(state === 'won' && levels.length > 1));
    nextLevelBtn.replaceChildren(li + 1 < levels.length ? 'Next level' : 'Play level 1 again', icon('arrowRight'));
    caption.className = `kvr-caption ${state}`;
    caption.innerHTML = empty ? 'The robot is waiting. <b>Drag an instruction</b> into your program (or click it).'
      : state === 'won' ? '<b>You did it!</b> You wrote a program: exact steps, run one at a time.'
      : state === 'bumped' ? '<b>Bump!</b> The robot did exactly what you told it. Click <b>Start again</b> and change your program.'
      : state === 'ended' ? 'The program ended, but the robot is not on the star. It only does what you wrote. <b>Add more steps</b>, then start again.'
      : pc === 0 ? 'Now click <b>Run one step</b>. The robot will do step 1 and nothing else.'
      : `The robot did step ${pc}: <b>${COMMANDS[program[pc - 1]].label}</b>. ${pc < program.length ? 'Click again for the next step.' : ''}`;
  }

  /** Run the next step. Returns false when the run is over. */
  function step() {
    if (pc >= program.length || state === 'won' || state === 'bumped') return false;
    const level = levels[li];
    const cmd = program[pc++];
    state = 'stepping';
    if (cmd === 'left') pos.rot -= 1;
    else if (cmd === 'right') pos.rot += 1;
    else {
      const [dx, dy] = DIRS[((pos.rot % 4) + 4) % 4];
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      if (level.rows[ny]?.[nx] !== '.') {
        state = 'bumped';
        robot.classList.remove('bump');
        void robot.offsetWidth;
        robot.classList.add('bump');
      } else {
        pos.x = nx;
        pos.y = ny;
      }
    }
    if (state !== 'bumped' && level.goal && pos.x === level.goal.x && pos.y === level.goal.y) {
      state = 'won';
      robot.classList.add('win');
    } else if (state !== 'bumped' && pc >= program.length) state = 'ended';
    draw();
    return state === 'stepping';
  }

  function runAll() {
    if (state === 'build' && pc !== 0) rewind();
    const tick = () => {
      if (step()) {
        runBtn.disabled = stepBtn.disabled = true;
        timer = setTimeout(tick, 650);
      }
    };
    tick();
  }

  load(0);
  return () => clearTimeout(timer);
}
