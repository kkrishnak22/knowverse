// Mission Control: the rules of the Mars rover game, with no DOM or graphics.
//
// The grid is n × n tiles. x grows to the right, y grows downwards. A rover state is
// { x, y, d } where d is the way it faces: 0 north (up), 1 east, 2 south, 3 west.
// Everything here is pure, so tests/rover.test.js can check every rule.
//
// Text: each mission keeps its Telugish next to the English (`te`), and report() / parseProgram()
// take a language. Telugish status: draft, to be reviewed by the owner.

export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const COMMANDS = ['forward', 'left', 'right'];

/**
 * The four missions. Each one teaches one part of the definition of programming, which the
 * player unlocks by answering the checkpoint question after the mission.
 */
export const MISSIONS = [
  {
    title: 'Give your first instructions',
    part: 'instructions',
    brief: 'The rover on Mars will not move by itself. Add commands to your program, then press Run. Reach the green flag. Pick up the blue rock sample on the way if you can.',
    mode: 'build',
    n: 5, start: [0, 4, 0], goal: [3, 1], sample: [0, 2], rocks: [[2, 3], [4, 4], [1, 3]],
    check: {
      q: 'What made the rover move?',
      options: ['It decided where to go', 'Your instructions', 'It followed the flag'],
      answer: 1,
      why: 'A computer does nothing until it is given instructions.',
      wrong: ['Rovers and computers cannot decide anything by themselves.', '', 'The flag is only a target. The rover cannot see it.'],
    },
    te: {
      title: 'Nee modati instructions ivvu',
      part: 'instructions',
      brief: 'Mars meeda unna rover tanantata kadaladu. Nee program lo commands add chesi, Run nokku. Green flag daaka cheru. Veelaithe daarilo blue rock sample kuda teesko.',
      check: {
        q: 'Rover ni kadilinchindi edi?',
        options: ['Adi ekkadiki vellaalo adhe decide chesukundi', 'Nuvvu ichina instructions', 'Adi flag ni follow ayyindi'],
        why: 'Instructions ivvakapothe computer emi cheyyadu.',
        wrong: ['Rovers, computers tamantata emi decide cheyyalevu.', '', 'Flag kevalam target matrame. Rover daanni choodaledu.'],
      },
    },
  },
  {
    title: 'Order matters',
    part: 'step by step',
    brief: 'These are the right commands, but they are mixed up. The rover runs one command at a time, in exactly the order you give. Put them in order. Try to get it right on the first run.',
    mode: 'order',
    n: 5, start: [1, 4, 0], goal: [3, 2], sample: [2, 2], rocks: [[1, 1], [3, 4], [0, 2]],
    pool: ['right', 'forward', 'forward', 'forward', 'forward'],
    check: {
      q: 'Why did the order of the commands matter?',
      options: ['The rover runs commands one by one, in order', 'The rover picks a random order', 'The rocks moved'],
      answer: 0,
      why: 'Programs run step by step. The same steps in a different order give a different result.',
      wrong: ['', 'Computers are not random. They follow the exact order you give.', 'The rocks never moved. Only the order of your commands changed.'],
    },
    te: {
      title: 'Order mukhyam',
      part: 'step by step',
      brief: 'Ivi correct commands, kaani kalisipoyayi. Rover okko command ni, nuvvu ichina order lone, okkokkati ga run chestundi. Vaatini correct order lo pettu. First run lone correct ga cheyyadaniki try cheyyi.',
      check: {
        q: 'Commands order enduku mukhyam ayyindi?',
        options: ['Rover commands ni okkokkati ga, order lo run chestundi', 'Rover random order pick chestundi', 'Rocks kadilayi'],
        why: 'Programs step by step run avutayi. Ade steps vere order lo isthe vere result vastundi.',
        wrong: ['', 'Computers random kaadu. Nuvvu ichina exact order ne follow avutayi.', 'Rocks eppudu kadalaledu. Nee commands order matrame maarindi.'],
      },
    },
  },
  {
    title: 'Speak its language',
    part: 'in a language a computer understands',
    brief: 'Press Run to send the message in plain English and see what happens. Then rewrite it using only the words the rover knows: forward(), left() and right(), one per line. forward(3) moves 3 squares.',
    mode: 'code',
    n: 5, start: [0, 4, 1], goal: [3, 1], sample: [3, 3], rocks: [[1, 2], [4, 1], [0, 0], [2, 2]],
    starter: 'go to the flag',
    check: {
      q: 'Why was "go to the flag" rejected?',
      options: ['The rover was broken', 'The message was too short', 'Computers only understand exact commands in their own language'],
      answer: 2,
      why: 'We write programs in a programming language, like Python, that the computer understands.',
      wrong: ['It worked once you used its commands.', 'Length was not the problem. The words were.', ''],
    },
    te: {
      title: 'Daani language lo maatlaadu',
      part: 'computer ki ardham ayye language lo',
      brief: 'Mundu plain English lo message pampi Run nokku, em jarugutundo choodu. Tarvata rover ki telisina words tho matrame malli raayi: forward(), left(), right(), line ki okkati. forward(3) ante 3 squares munduku.',
      check: {
        q: '"go to the flag" enduku reject ayyindi?',
        options: ['Rover paadaipoyindi', 'Message chaala chinnadi', 'Computers ki tama language lo unna exact commands matrame ardham avutayi'],
        why: 'Manam programs ni Python laanti, computer ki ardham ayye programming language lo raastaam.',
        wrong: ['Daani commands vaadagaane adi pani chesindi.', 'Length problem kaadu. Words problem.', ''],
      },
    },
  },
  {
    title: 'No joystick on Mars',
    part: 'solve a problem on its own',
    brief: 'Mars is about 20 light-minutes away. Once you transmit, you cannot steer, pause or stop the rover. The whole program must be right before it runs. Plan the full route around the rocks.',
    mode: 'build', delay: true,
    n: 6, start: [0, 5, 0], goal: [5, 0], sample: [4, 1], rocks: [[0, 2], [2, 4], [3, 1], [1, 1], [4, 4], [2, 2], [4, 2]],
    check: {
      q: 'After you pressed Transmit, what was controlling the rover?',
      options: ['You, live, with a joystick', 'The program you wrote', 'Nothing'],
      answer: 1,
      why: 'A program runs on its own. You do the thinking first, and the computer carries it out without you.',
      wrong: ['There is no live control on Mars. The signal takes 20 minutes.', '', 'Something was in control: the instructions you wrote.'],
    },
    te: {
      title: 'Mars meeda joystick ledu',
      part: 'tanantata oka problem solve cheyagaligelaa',
      brief: 'Mars daadapu 20 light-minutes dooram lo undi. Okkasari transmit chesaka, rover ni steer cheyyalevu, pause cheyyalevu, aapalevu. Run avvakamunde motham program correct ga undaali. Rocks chuttu full route plan cheyyi.',
      check: {
        q: 'Transmit nokkina tarvata rover ni control chesindi evaru?',
        options: ['Nuvve, live ga, joystick tho', 'Nuvvu raasina program', 'Evaru kaadu'],
        why: 'Program tanantata run avutundi. Aalochana mundu nuvvu chestav, computer nee sahayam lekunda daanni chestundi.',
        wrong: ['Mars meeda live control ledu. Signal ki 20 minutes padutundi.', '', 'Edo okati control chesindi: nuvvu raasina instructions.'],
      },
    },
  },
];

/** The sentence the four missions build, one part per mission. */
export const DEFINITION = ['Programming is writing ', 0, ', ', 1, ', ', 2, ', so it can ', 3, '.'];
// Telugu puts the verb last; the parts still come in mission order, so the final round works the same.
export const DEFINITION_TE = ['Programming ante ', 0, ' ni, ', 1, ' ga, ', 2, ', ', 3, ' raayadam.'];

/** The definition sentence in a language. */
export const definition = (lang = 'en') => (lang === 'te' ? DEFINITION_TE : DEFINITION);

/** A mission with its text in the given language (the rules are untouched). */
export function localizeMission(m, lang = 'en') {
  if (lang !== 'te' || !m.te) return m;
  return { ...m, ...m.te, check: { ...m.check, ...m.te.check } };
}

// Messages from the rules: the report and the code checker's errors.
const MSG = {
  en: {
    noNumber: (c) => `${c}() does not take a number. Write it once for each turn.`,
    range: 'Use a number from 1 to 20.',
    only: 'The rover only understands forward(), left() and right().',
    exact: 'Close. Computers are exact: capital letters and spaces count.',
    brackets: (w) => `Almost. Commands need brackets: ${w}()`,
    syntax: (n, raw) => `SyntaxError on line ${n}: "${raw}"`,
    reached: 'Reached the flag',
    sample: 'Collected the rock sample',
    firstRun: 'Right on the first run',
    runs: (n) => `Took ${n} runs (aim: the first run)`,
    lines: (n, best) => `Wrote ${n} line${n === 1 ? '' : 's'} of code (shortest: ${best})`,
    cmds: (n, best) => `Used ${n} commands (shortest: ${best})`,
  },
  te: {
    noNumber: (c) => `${c}() ki number ivvakoodadu. Prathi turn ki okkasari raayi.`,
    range: '1 nunchi 20 varaku number vaadu.',
    only: 'Rover ki forward(), left(), right() matrame ardham avutayi.',
    exact: 'Daadapu correct. Computers exact ga untayi: capital letters, spaces kuda lekka.',
    brackets: (w) => `Daadapu. Commands ki brackets kaavaali: ${w}()`,
    syntax: (n, raw) => `Line ${n} lo SyntaxError: "${raw}"`,
    reached: 'Flag daaka cherindi',
    sample: 'Rock sample teeskundi',
    firstRun: 'First run lone correct',
    runs: (n) => `${n} runs pattindi (target: first run)`,
    lines: (n, best) => `${n} line${n === 1 ? '' : 's'} code raasav (shortest: ${best})`,
    cmds: (n, best) => `${n} commands vaadav (shortest: ${best})`,
  },
};
const msg = (lang) => MSG[lang] || MSG.en;

const same = (a, b) => a[0] === b[0] && a[1] === b[1];

/** True when (x, y) is off the map or has a rock on it. */
export function blocked(m, x, y) {
  return x < 0 || y < 0 || x >= m.n || y >= m.n || m.rocks.some((r) => r[0] === x && r[1] === y);
}

/**
 * Run a program on a mission without animating it. Returns every step and how it ended.
 * Steps stop at the first crash, exactly as the rover would.
 * @param {string[]} cmds e.g. ['forward', 'left']
 */
export function simulate(m, cmds) {
  let s = { x: m.start[0], y: m.start[1], d: m.start[2] };
  let gotSample = false;
  const steps = [];
  for (const cmd of cmds) {
    const from = { ...s };
    if (cmd === 'left' || cmd === 'right') {
      s = { ...s, d: (s.d + (cmd === 'left' ? 3 : 1)) % 4 };
      steps.push({ cmd, from, to: { ...s }, event: 'turn' });
      continue;
    }
    const [dx, dy] = DIRS[s.d];
    const nx = s.x + dx;
    const ny = s.y + dy;
    if (blocked(m, nx, ny)) {
      const offMap = nx < 0 || ny < 0 || nx >= m.n || ny >= m.n;
      steps.push({ cmd, from, to: from, event: offMap ? 'offmap' : 'crash', hit: [nx, ny] });
      return { steps, end: from, reached: false, gotSample, crashed: true };
    }
    s = { ...s, x: nx, y: ny };
    const sample = !gotSample && same([nx, ny], m.sample);
    if (sample) gotSample = true;
    steps.push({ cmd, from, to: { ...s }, event: 'move', sample });
  }
  return { steps, end: s, reached: same([s.x, s.y], m.goal), gotSample, crashed: false };
}

/**
 * Parse the rover's language: one command per line, forward(n) allowed, # comments.
 * Returns { ok: true, cmds, lines } or { ok: false, error: { line, raw, message, hint, plainEnglish } }.
 */
export function parseProgram(src, lang = 'en') {
  const t = msg(lang);
  const cmds = [];
  let lines = 0;
  const all = String(src).split('\n');
  for (let i = 0; i < all.length; i++) {
    const raw = all[i].trim();
    if (!raw || raw.startsWith('#')) continue;
    lines++;
    const m = raw.match(/^(forward|left|right)\((\d*)\)$/);
    if (m) {
      if (m[2] && m[1] !== 'forward') return fail(t, i, raw, t.noNumber(m[1]));
      const k = m[2] ? Number(m[2]) : 1;
      if (k < 1 || k > 20) return fail(t, i, raw, t.range);
      for (let j = 0; j < k; j++) cmds.push({ cmd: m[1], line: i });
      continue;
    }
    const low = raw.toLowerCase().replace(/\s+/g, '');
    let hint = t.only;
    if (/^(forward|left|right)\(\d*\)$/.test(low)) hint = t.exact;
    else if (/^(forward|left|right)$/.test(low)) hint = t.brackets(low);
    return fail(t, i, raw, hint, /\s/.test(raw) && raw.split(/\s+/).length > 1);
  }
  return { ok: true, cmds, lines };
}

function fail(t, line, raw, hint, plainEnglish = false) {
  return { ok: false, error: { line, raw, message: t.syntax(line + 1, raw), hint, plainEnglish } };
}

/** The shortest program that collects the sample and reaches the flag (empty if impossible). */
export function shortestRoute(m) {
  const key = (s) => `${s.x},${s.y},${s.d},${s.k}`;
  const first = { x: m.start[0], y: m.start[1], d: m.start[2], k: 0, path: [] };
  const queue = [first];
  const seen = new Set([key(first)]);
  while (queue.length) {
    const s = queue.shift();
    if (s.k && same([s.x, s.y], m.goal)) return s.path;
    for (const cmd of COMMANDS) {
      let { x, y, d } = s;
      if (cmd === 'left') d = (d + 3) % 4;
      else if (cmd === 'right') d = (d + 1) % 4;
      else {
        x += DIRS[d][0];
        y += DIRS[d][1];
        if (blocked(m, x, y)) continue;
      }
      const next = { x, y, d, k: s.k || (same([x, y], m.sample) ? 1 : 0), path: [...s.path, cmd] };
      if (seen.has(key(next))) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return [];
}

/** Collapse repeats: ['forward','forward','left'] → [['forward', 2], ['left', 1]]. */
export function groups(cmds) {
  const out = [];
  for (const c of cmds) {
    if (out.length && out.at(-1)[0] === c) out.at(-1)[1]++;
    else out.push([c, 1]);
  }
  return out;
}

/** Lines of code a program needs when forward(n) is used for runs of forward. */
export const lineCount = (cmds) => groups(cmds).reduce((n, [c, k]) => n + (c === 'forward' ? 1 : k), 0);

/** The player's program written as Python. */
export function toPython(cmds, title = 'reach the flag on Mars') {
  const out = ['from rover import forward, left, right', '', `# ${title}`];
  for (const [c, k] of groups(cmds)) {
    if (c === 'forward') out.push(k > 1 ? `forward(${k})` : 'forward()');
    else for (let i = 0; i < k; i++) out.push(`${c}()`);
  }
  return out.join('\n');
}

/**
 * The mission report: what went well, as plain checks (no points or stars).
 * @param {{ cmds: string[], runs: number, lines: number }} run
 */
export function report(m, result, run, lang = 'en') {
  const t = msg(lang);
  const best = shortestRoute(m);
  const items = [
    { ok: result.reached, text: t.reached },
    { ok: result.gotSample, text: t.sample },
  ];
  if (m.mode === 'order') items.push({ ok: run.runs === 1, text: run.runs === 1 ? t.firstRun : t.runs(run.runs) });
  else if (m.mode === 'code') items.push({ ok: run.lines <= lineCount(best), text: t.lines(run.lines, lineCount(best)) });
  else items.push({ ok: run.cmds.length <= best.length, text: t.cmds(run.cmds.length, best.length) });
  return items;
}
