// The site's word list: short, plain meanings for words a beginner may not know.
//
// One list for the whole site. Games and lessons underline these words (js/words.js turns text
// into underlined words), and the Quick look panel (js/peek.js) uses them for [[linked words]]
// that have no topic of their own. Pure data and matching only: no DOM, so tests can check it.
//
// STATUS: draft. Written by Claude, to be reviewed by the owner before it counts as final.
//
// Each entry:
//   id      stable key
//   term    the word as a heading
//   short   one plain sentence (also the hover text)
//   more    optional second sentence with detail
//   example optional example from the game, shown in code style
//   match   phrases that count as this word in running text (case does not matter)
//   re      optional regular-expression source for patterns (like T+01)
//   see     optional CSS selector, inside the game, for "See it"
//   tags    where the word belongs (e.g. 'rover' lists it in Mission Control's Words list)
//   te      Telugish (Telugu in English letters): { term?, short, more?, match? }. Its match
//           phrases are found in text of either language, since Telugish keeps English tech words.

export const GLOSSARY = [
  {
    id: 'programming', term: 'Programming', tags: ['rover'],
    short: 'Telling a computer what to do by writing instructions for it.',
    more: 'Mission Control builds the full definition one mission at a time.',
    match: ['programming'],
    te: { short: 'Instructions raasi computer ki em cheyyalo cheppadam.', more: 'Mission Control prathi mission lo definition lo oka part build chestundi.' },
  },
  {
    id: 'mission-control', term: 'Mission Control', tags: ['rover'],
    short: 'The team on Earth that plans a space mission and sends commands to the spacecraft.',
    more: 'In this game, Mission Control is you.',
    match: ['mission control'],
    te: { short: 'Space mission ni plan chesi, spacecraft ki commands pampe Earth meeda unna team.', more: 'Ee game lo Mission Control nuvve.' },
  },
  {
    id: 'rover', term: 'Rover', tags: ['rover'],
    short: 'A robot vehicle that drives across the ground of another world, like the rovers sent to Mars.',
    more: 'It cannot think for itself. It only does what its program says.',
    match: ['rover'],
    te: { short: 'Vere graham meeda drive chese robot vehicle, Mars ki pampina rovers laaga.', more: 'Adi tanantata aalochinchadu. Daani program cheppindi matrame chestundi.' },
  },
  {
    id: 'rock-sample', term: 'Rock sample', tags: ['rover'],
    short: 'A small piece of rock a rover collects so scientists can study what Mars is made of.',
    more: 'In the game it is the blue crystal. Collecting it is a bonus.',
    match: ['rock sample'],
    te: { short: 'Mars denitho tayaru ayyindo scientists study cheyyadaniki rover collect chese chinna rock mukka.', more: 'Game lo adi blue crystal. Daanni collect cheyyadam bonus.' },
  },
  {
    id: 'square', term: 'Square', tags: ['rover'],
    short: 'The map is a grid of squares. forward() drives exactly one square.',
    match: ['square', 'squares'], see: '.kvx-stage',
    te: { short: 'Map squares tho unna oka grid. forward() exact ga okka square veltundi.' },
  },
  {
    id: 'command', term: 'Command', tags: ['rover'],
    short: 'One instruction the rover knows, like forward(). Each command does exactly one thing.',
    example: 'forward()   left()   right()',
    match: ['command', 'commands'], see: '.kvx-palette',
    te: { short: 'Rover ki telisina okka instruction, forward() laaga. Prathi command exact ga okka pani chestundi.' },
  },
  {
    id: 'program', term: 'Program', tags: ['rover'],
    short: 'A list of commands, in order. The computer runs them one by one, top to bottom.',
    match: ['program', 'programs'], see: '.kvx-program:not(.kvx-pool), .kvx-text, .kvx-code',
    te: { short: 'Order lo unna commands list. Computer vaatini paina nunchi kindaki okkokkati ga run chestundi.' },
  },
  {
    id: 'brackets', term: 'Brackets ( )', tags: ['rover'],
    short: 'The brackets after a command\'s name mean "run this command now".',
    more: 'Empty brackets mean the command needs no extra information.',
    example: 'forward()',
    match: ['forward()', 'left()', 'right()'],
    te: { short: 'Command peru tarvata unna brackets ante "ee command ni ippude run cheyyi" ani.', more: 'Khaali brackets ante aa command ki extra information avasaram ledu.' },
  },
  {
    id: 'argument', term: 'A number in the brackets', tags: ['rover'],
    short: 'A number inside the brackets gives the command extra information: forward(3) drives 3 squares.',
    more: 'Programmers call this extra information an argument.',
    example: 'forward(3)',
    match: ['forward(3)'],
    te: { term: 'Brackets lo number', short: 'Brackets lo number command ki extra information istundi: forward(3) ante 3 squares veltundi.', more: 'Programmers ee extra information ni argument antaru.' },
  },
  {
    id: 'telemetry', term: 'Telemetry', tags: ['rover'],
    short: 'The report a spacecraft sends home about what it did. Here it lists every step the rover took.',
    example: 'T+01  forward()',
    match: ['telemetry'], see: '.kvx-tele',
    te: { short: 'Spacecraft em chesindo intiki pampe report. Ikkada rover chesina prathi step list avutundi.' },
  },
  {
    id: 'mission-time', term: 'T+01', tags: ['rover'],
    short: 'Mission time. "T+" counts forward from the start: T+01 is the first command the rover ran, T+02 the second.',
    re: 'T\\+\\d+', match: [], see: '.kvx-log',
    te: { short: 'Mission time. "T+" start nunchi lekka pedutundi: T+01 rover run chesina modati command, T+02 rendodi.' },
  },
  {
    id: 'link', term: 'Link established', tags: ['rover'],
    short: 'The radio connection between Mission Control and the rover is working.',
    match: ['link established'],
    te: { short: 'Mission Control ki rover ki madhya radio connection pani chestondi.' },
  },
  {
    id: 'error', term: 'Error', tags: ['rover'],
    short: 'Something went wrong: here, the rover hit a rock or drove off the map.',
    more: 'The rover did exactly what the program said. The instructions were wrong.',
    match: ['error'],
    te: { short: 'Edo tappu jarigindi: ikkada rover rock ni guddindi leda map bayataki vellindi.', more: 'Rover program cheppindi exact ga chesindi. Instructions tappu.' },
  },
  {
    id: 'plain-english', term: 'Plain English', tags: ['rover'],
    short: 'Everyday language, the way people talk. This rover only understands its exact commands.',
    match: ['plain english'],
    te: { short: 'Manushulu maatlaade maamoolu language. Ee rover ki daani exact commands matrame ardham avutayi.' },
  },
  {
    id: 'line', term: 'One per line', tags: ['rover'],
    short: 'A line is one row of text in a program. Here each line holds one command.',
    match: ['per line'], see: '.kvx-text, .kvx-code',
    te: { term: 'Line ki okkati', short: 'Line ante program lo okka row text. Ikkada prathi line lo okka command untundi.', match: ['line ki'] },
  },
  {
    id: 'transmit', term: 'Transmit', tags: ['rover'],
    short: 'To send a message by radio. Mission Control transmits the program to the rover.',
    match: ['transmit', 'transmitting'],
    te: { short: 'Radio dwara message pampadam. Mission Control program ni rover ki transmit chestundi.' },
  },
  {
    id: 'signal', term: 'Signal', tags: ['rover'],
    short: 'The radio message travelling between Earth and Mars.',
    match: ['signal'],
    te: { short: 'Earth ki Mars ki madhya travel chese radio message.' },
  },
  {
    id: 'light-minute', term: 'Light-minute', tags: ['rover'],
    short: 'How far light travels in one minute: about 18 million km. Radio signals travel at the speed of light.',
    more: 'Mars is about 3 to 22 light-minutes from Earth, depending on where the two planets are, so a message takes that many minutes to arrive.',
    match: ['light-minutes', 'light-minute'],
    te: { short: 'Light okka minute lo velle dooram: daadapu 18 million km. Radio signals light speed lo veltayi.', more: 'Rendu grahalu ekkada unnayo daani batti Mars, Earth nunchi daadapu 3 nunchi 22 light-minutes dooram lo untundi. Message cheradaniki anni minutes padutundi.' },
  },
  {
    id: 'prediction', term: 'Prediction', tags: ['rover'],
    short: 'Your guess about what will happen, made before it happens.',
    more: 'Programmers predict what their code will do, then run it to check.',
    match: ['predict', 'prediction'],
    te: { short: 'Edaina jaragakamunde, em jarugutundo ani nee guess.', more: 'Programmers tama code em chestundo predict chesi, tarvata run chesi check chestaru.' },
  },
  {
    id: 'programming-language', term: 'Programming language', tags: ['rover'],
    short: 'A language with exact words and rules that a computer can follow. Python is one.',
    match: ['programming language'],
    te: { short: 'Computer follow cheyyagalige exact words, rules unna language. Python okati.' },
  },
  {
    id: 'python', term: 'Python', tags: ['rover'],
    short: 'A popular programming language, and the one this course teaches.',
    match: ['python'],
    te: { short: 'Oka popular programming language. Ee course nerpinchedi ide.' },
  },
  {
    id: 'comment', term: 'Comment (#)', tags: ['rover'],
    short: 'In Python, a line starting with # is a comment: a note for people. The computer skips it.',
    example: '# Mission 4: reach the flag on Mars',
    match: ['comment', 'comments'],
    te: { short: 'Python lo # tho start ayye line oka comment: manushula kosam note. Computer daanni skip chestundi.' },
  },
  // ---- Python course words
  {
    id: 'bug', term: 'Bug', tags: ['python'],
    short: 'A mistake in a program: a gap between what you meant and what you wrote.',
    match: ['bug', 'bugs'],
    te: { short: 'Program lo tappu: nuvvu anukunnadaaniki, raasinadaaniki madhya gap.' },
  },
  {
    id: 'algorithm', term: 'Algorithm', tags: ['python'],
    short: 'The step-by-step idea for solving a problem. A program is an algorithm written in a language a computer can run.',
    match: ['algorithm', 'algorithms'],
    te: { short: 'Oka problem ni solve chese step-by-step idea. Program ante computer run cheyagalige language lo raasina algorithm.' },
  },
  {
    id: 'processor', term: 'Processor', tags: ['python'],
    short: 'The part of the computer that carries out instructions, one after another.',
    match: ['processor', 'cpu'],
    te: { short: 'Instructions ni okadaani tarvata okati chese computer part.' },
  },
  {
    id: 'memory', term: 'Memory', tags: ['python'],
    short: 'Where the computer keeps values while a program runs.',
    match: ['memory'],
    te: { short: 'Program run avutunnappudu computer values ni daache chotu.' },
  },
  {
    id: 'interpreter', term: 'Interpreter', tags: ['python'],
    short: 'The program that reads your Python code and runs it.',
    match: ['python interpreter', 'interpreter', 'interpreted'],
    te: { short: 'Nee Python code ni chadivi run chese program.' },
  },
  {
    id: 'bytecode', term: 'Bytecode', tags: ['python'],
    short: 'A simpler form of your code that Python makes before running it.',
    match: ['bytecode'],
    te: { short: 'Run chese mundu Python nee code nunchi tayaru chese simple form.' },
  },
  {
    id: 'garbage-collection', term: 'Garbage collection', tags: ['python'],
    short: 'Python freeing memory that nothing uses any more, by itself.',
    match: ['garbage collection'],
    te: { short: 'Evaru vaadani memory ni Python tanantata free cheyyadam.' },
  },
  {
    id: 'variable', term: 'Variable', tags: ['python'],
    short: 'A name that points to a value in memory, like a name tag.',
    match: ['variable', 'variables'],
    te: { short: 'Memory lo oka value ni choopinche peru, name tag laaga.' },
  },
  {
    id: 'value', term: 'Value', tags: ['python'],
    short: 'A piece of data, like 2, 3.5 or "hello".',
    match: ['value', 'values'],
    te: { short: 'Oka data mukka, 2, 3.5 leda "hello" laaga.' },
  },
  {
    id: 'data-type', term: 'Data type', tags: ['python'],
    short: 'The kind of a value: int, float, str or bool. It decides what you can do with the value.',
    match: ['data type', 'data types'],
    te: { short: 'Value yokka rakam: int, float, str leda bool. Daanitho em cheyyagalavo adi decide chestundi.' },
  },
  {
    id: 'string', term: 'String', tags: ['python'],
    short: 'Text in quotes, like "hello". Python calls this type str.',
    match: ['string', 'strings'],
    te: { short: 'Quotes lo unna text, "hello" laaga. Python ee type ni str antundi.' },
  },
  {
    id: 'int', term: 'int', tags: ['python'],
    short: 'A whole number, like 7 or -3.',
    match: ['int', 'integer', 'integers'],
    te: { short: 'Poorthi number, 7 leda -3 laaga.' },
  },
  {
    id: 'float', term: 'float', tags: ['python'],
    short: 'A number with a decimal point, like 3.5.',
    match: ['float', 'floats'],
    te: { short: 'Decimal point unna number, 3.5 laaga.' },
  },
  {
    id: 'bool', term: 'bool', tags: ['python'],
    short: 'One of two values: True or False.',
    match: ['boolean', 'bool'],
    te: { short: 'Rendu values lo okati: True leda False.' },
  },
  {
    id: 'immutable', term: 'Immutable', tags: ['python'],
    short: 'Cannot be changed after it is made. Changing a string really makes a new string.',
    match: ['immutable'],
    te: { short: 'Tayaru ayyaka maarchalemu. String ni maarchinattu anipinchina, nijaniki kotta string tayaru avutundi.' },
  },
  {
    id: 'expression', term: 'Expression', tags: ['python'],
    short: 'A piece of code that works out to a value, like 2 + 3 or age > 18.',
    match: ['expression', 'expressions'],
    te: { short: 'Oka value ga maare code mukka, 2 + 3 leda age > 18 laaga.' },
  },
  {
    id: 'operator', term: 'Operator', tags: ['python'],
    short: 'A symbol that does something with values: + adds, == compares.',
    match: ['operator', 'operators'],
    te: { short: 'Values tho edo chese symbol: + add chestundi, == compare chestundi.' },
  },
  {
    id: 'condition', term: 'Condition', tags: ['python'],
    short: 'A question that is True or False, like age >= 18. if uses it to choose what runs.',
    match: ['condition', 'conditions'],
    te: { short: 'True leda False ayye prashna, age >= 18 laaga. Edi run avvaalo choose cheyyadaniki if daanni vaadutundi.' },
  },
  {
    id: 'loop', term: 'Loop', tags: ['python'],
    short: 'Code that runs the same block again and again. Python has for and while loops.',
    match: ['loop', 'loops'],
    te: { short: 'Ade block ni malli malli run chese code. Python lo for, while loops unnayi.' },
  },
  {
    id: 'indentation', term: 'Indentation', tags: ['python'],
    short: 'The spaces at the start of a line. In Python they show which lines belong inside an if, for or while.',
    match: ['indentation', 'indent', 'indented'],
    te: { short: 'Line modatlo unna spaces. Python lo ae lines if, for leda while lopala unnayo avi choopistayi.' },
  },
  {
    id: 'function', term: 'Function', tags: ['python'],
    short: 'A named piece of code you run by writing its name with brackets, like print().',
    match: ['function', 'functions'],
    te: { short: 'Peru tho unna code mukka. Peru tarvata brackets raaste run avutundi, print() laaga.' },
  },
  {
    id: 'input', term: 'Input', tags: ['python'],
    short: 'Data that goes into a program, like what the user types. input() asks for it.',
    match: ['input'],
    te: { short: 'Program loki velle data, user type chesedi laaga. input() daanni adugutundi.' },
  },
  {
    id: 'output', term: 'Output', tags: ['python'],
    short: 'What a program gives back, like text printed on the screen.',
    match: ['output'],
    te: { short: 'Program tirigi ichedi, screen meeda print ayye text laaga.' },
  },
  {
    id: 'syntax-error', term: 'SyntaxError', tags: ['python'],
    short: 'Python\'s error when code breaks the language\'s grammar, like a missing bracket. Python finds it before running anything.',
    match: ['syntaxerror', 'syntax error'],
    te: { short: 'Code language grammar ni break chesinappudu vache Python error, bracket miss ayinattu. Edi run cheyyakamunde Python daanni pattukuntundi.' },
  },
  {
    id: 'name-error', term: 'NameError', tags: ['python'],
    short: 'Python\'s error when you use a name it does not know, like a misspelt variable or Print with a capital P.',
    match: ['nameerror'],
    te: { short: 'Python ki teliyani peru vaadinappudu vache error, tappu spelling unna variable leda capital P tho Print laaga.' },
  },
  {
    id: 'type-error', term: 'TypeError', tags: ['python'],
    short: 'Python\'s error when an operation gets the wrong kind of value, like 2 + "3".',
    match: ['typeerror'],
    te: { short: 'Oka operation ki tappu rakam value vachinappudu vache Python error, 2 + "3" laaga.' },
  },
];

export const BY_ID = new Map(GLOSSARY.map((g) => [g.id, g]));

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordy = /\w/;

// One regular expression for every phrase, longest first, so "forward(3)" wins over "forward()"
// and "programming language" over "programming". Phrases that start or end with a letter only
// match whole words ("program" never matches inside "programming").
const ALTERNATIVES = GLOSSARY.flatMap((g) => [
  ...[...g.match, ...(g.te?.match || [])].map((p) => ({ id: g.id, len: p.length, src: `${wordy.test(p[0]) ? '(?<![\\w-])' : ''}${escape(p)}${wordy.test(p[p.length - 1]) ? '(?![\\w-])' : ''}` })),
  ...(g.re ? [{ id: g.id, len: 100, src: `(?<![\\w-])${g.re}(?![\\w-])` }] : []),
]).sort((a, b) => b.len - a.len);
const PATTERN = new RegExp(ALTERNATIVES.map((a) => `(${a.src})`).join('|'), 'gi');

/**
 * Split text into plain pieces and glossary words. Each word is marked once per `seen` set, so a
 * paragraph (or a whole log) underlines a word the first time only.
 * @returns {Array<{ text: string, id?: string }>}
 */
export function findTerms(text, seen = new Set()) {
  const out = [];
  let last = 0;
  PATTERN.lastIndex = 0;
  for (const m of text.matchAll(PATTERN)) {
    const id = ALTERNATIVES[m.slice(1).findIndex((g) => g !== undefined)].id;
    if (seen.has(id)) continue;
    seen.add(id);
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], id });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** A word's heading and meaning in a language (Telugish falls back to English where missing). */
export function wordText(g, lang = 'en') {
  const te = lang === 'te' ? g.te || {} : {};
  return { term: te.term || g.term, short: te.short || g.short, more: te.more ?? g.more };
}

/** The entry for a word or phrase, if the glossary has one. */
export function lookupTerm(word) {
  const w = String(word).trim().toLowerCase();
  return BY_ID.get(w) || GLOSSARY.find((g) => g.term.toLowerCase() === w || g.match.includes(w)) || null;
}
