// Predict-then-run: the student commits to an answer before seeing it, then runs the real code.
// Block syntax:
//   ```kv-predict
//   x = 5
//   y = x
//   x = 7
//   print(y)
//   ---
//   ? What does this print?
//   - 7
//   + 5            (the correct option starts with +)
//   - An error
//   > Why: y was stuck on 5. Moving x to 7 doesn't move y.
//   ```

import { h, icon } from '../ui.js';
import { highlight } from './editor.js';
import { trace } from './python.js';

export function parsePredict(src) {
  const [codePart, ...rest] = String(src).split(/^---\s*$/m);
  const quiz = { code: codePart.replace(/\s+$/, ''), question: 'What happens when this runs?', options: [], explain: '' };
  for (const line of rest.join('\n').split('\n')) {
    const m = line.match(/^([?+\->])\s?(.*)$/);
    if (!m) continue;
    if (m[1] === '?') quiz.question = m[2];
    else if (m[1] === '>') quiz.explain += (quiz.explain ? ' ' : '') + m[2];
    else quiz.options.push({ text: m[2], correct: m[1] === '+' });
  }
  return quiz;
}

const inline = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

export function mountPredict(el, src) {
  const q = parsePredict(src);
  let answered = false;
  const result = h('div', { class: 'kv-predict-result' });
  const runOut = h('pre', { class: 'kv-predict-out hidden' });

  const options = q.options.map((o) => h('button', { class: 'kv-option', type: 'button', onclick: () => choose(o, btn(o)) }, h('span', { html: inline(o.text) })));
  const btn = (o) => options[q.options.indexOf(o)];

  async function choose(o, b) {
    if (answered) return;
    answered = true;
    options.forEach((x, i) => {
      x.disabled = true;
      if (q.options[i].correct) x.classList.add('correct');
    });
    if (!o.correct) b.classList.add('wrong');
    result.innerHTML = `<div class="kv-verdict ${o.correct ? 'ok' : 'no'}">${o.correct ? 'Nice — you predicted it.' : 'Not quite — that’s a common guess.'}</div>${q.explain ? `<p>${inline(q.explain)}</p>` : ''}`;
    const run = h('button', { class: 'btn small-btn', type: 'button', onclick: async () => {
      run.disabled = true;
      run.textContent = 'Running…';
      try {
        const r = await trace(q.code);
        const out = r.steps.at(-1)?.out || '';
        runOut.textContent = (out || '(nothing printed)') + (r.error ? `\n${r.error.type}: ${r.error.message}` : '');
      } catch (err) {
        runOut.textContent = `Couldn’t start Python: ${err.message}`;
      }
      runOut.classList.remove('hidden');
      run.remove();
    } }, icon('play'), 'Run it for real');
    result.append(run, runOut);
  }

  el.classList.add('kv-predict');
  el.replaceChildren(
    h('div', { class: 'kv-predict-head' }, icon('sparkles'), 'Predict, then run'),
    h('pre', { class: 'kv-static-code', html: highlight(q.code).map((l) => `<div>${l || ' '}</div>`).join('') }),
    h('p', { class: 'kv-question' }, q.question),
    h('div', { class: 'kv-options' }, options),
    result,
  );
  return () => {};
}

// ---------- Quiz: plain questions and answers (no code) ----------
//   ```kv-quiz
//   ? In what order does a computer run the steps of a program?
//   + From top to bottom, one at a time
//   - All at the same time
//   > Why: the computer finishes one step before it starts the next.
//
//   ? Next question…
//   ```

export function parseQuiz(src) {
  const questions = [];
  for (const line of String(src).split('\n')) {
    const m = line.match(/^([?+\->])\s?(.*)$/);
    if (!m) continue;
    if (m[1] === '?') questions.push({ question: m[2], options: [], explain: '' });
    else if (!questions.length) continue;
    else if (m[1] === '>') questions.at(-1).explain += (questions.at(-1).explain ? ' ' : '') + m[2];
    else questions.at(-1).options.push({ text: m[2], correct: m[1] === '+' });
  }
  return questions;
}

export function mountQuiz(el, src) {
  const questions = parseQuiz(src);
  let right = 0;
  let answered = 0;
  const score = h('span', { class: 'kv-quiz-score' });
  const cards = questions.map((q, qi) => {
    const result = h('div', { class: 'kv-predict-result' });
    const options = q.options.map((o) => h('button', { class: 'kv-option', type: 'button', title: 'Click to choose this answer', onclick: () => {
      options.forEach((b, i) => {
        b.disabled = true;
        if (q.options[i].correct) b.classList.add('correct');
      });
      if (!o.correct) options[q.options.indexOf(o)].classList.add('wrong');
      else right++;
      answered++;
      result.innerHTML = `<div class="kv-verdict ${o.correct ? 'ok' : 'no'}">${o.correct ? 'Correct.' : 'Not quite.'}</div>${q.explain ? `<p>${inline(q.explain)}</p>` : ''}`;
      score.textContent = `${right} of ${answered} correct`;
    } }, h('span', { html: inline(o.text) })));
    return h('div', { class: 'kv-quiz-q' }, h('p', { class: 'kv-question' }, h('span', { class: 'kv-quiz-n' }, qi + 1), q.question), h('div', { class: 'kv-options' }, options), result);
  });
  el.classList.add('kv-predict', 'kv-quiz');
  el.replaceChildren(h('div', { class: 'kv-predict-head' }, icon('message'), 'Check yourself', score), ...cards);
  return () => {};
}
