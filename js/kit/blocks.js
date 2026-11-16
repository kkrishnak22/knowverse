// The kit registry. Markdown fences named ```kv-<kind> render as placeholders
// (<div class="kv-block" data-kv="<kind>">); hydrate() turns them into live components.
// Any view that renders Markdown — the Lesson view, the Documentation viewer — can call it,
// so one asset works everywhere it is used.
//
// To add a new reusable piece: write mountX(el, src) → cleanup, and register it here.

import { mountLab } from './lab.js';
import { mountPredict, mountQuiz } from './predict.js';
import { mountMachine } from './machine.js';
import { mountRobot } from './robot.js';
import { mountTea } from './tea.js';

export const KIT = {
  lab: (el, src) => mountLab(el, src, { mode: 'lab' }),
  watch: (el, src) => mountLab(el, src, { mode: 'watch' }),
  predict: mountPredict,
  quiz: mountQuiz,
  machine: mountMachine,
  robot: mountRobot,
  tea: mountTea,
};

/** Mount every kit block inside `root`. Returns a function that tears them all down. */
export function hydrate(root) {
  const cleanups = [];
  for (const el of root.querySelectorAll('.kv-block[data-kv]')) {
    if (el.dataset.mounted) continue;
    const mount = KIT[el.dataset.kv];
    if (!mount) {
      el.classList.add('kv-unknown');
      el.textContent = `Unknown block “kv-${el.dataset.kv}”.`;
      continue;
    }
    el.dataset.mounted = '1';
    let src = '';
    try {
      src = decodeURIComponent(el.dataset.src || '');
    } catch {
      src = el.dataset.src || '';
    }
    try {
      cleanups.push(mount(el, src));
    } catch (err) {
      console.error(err);
      el.textContent = `This block couldn’t start: ${err.message}`;
    }
  }
  return () => cleanups.forEach((c) => c?.());
}
