// The kit registry. Markdown fences named ```kv-<kind> render as placeholders
// (<div class="kv-block" data-kv="<kind>">); hydrate() turns them into live components.
// Any view that renders Markdown — the Lesson view, the Documentation viewer — can call it,
// so one asset works everywhere it is used.
//
// Each kind's code is loaded only when a page actually contains that block, so a page without
// the game never downloads the game (docs/QUALITY.md, load.heavy-before-ask).
//
// To add a new reusable piece: write mountX(el, src) → cleanup, and register a loader here.

// Blocks that switch language by themselves (the rover game redraws its own words in place).
// A page changing language keeps these alive instead of restarting them.
export const SELF_TRANSLATING = new Set(['rover']);

export const KIT = {
  lab: () => import('./lab.js').then((m) => (el, src) => m.mountLab(el, src, { mode: 'lab' })),
  watch: () => import('./lab.js').then((m) => (el, src) => m.mountLab(el, src, { mode: 'watch' })),
  predict: () => import('./predict.js').then((m) => m.mountPredict),
  quiz: () => import('./predict.js').then((m) => m.mountQuiz),
  machine: () => import('./machine.js').then((m) => m.mountMachine),
  robot: () => import('./robot.js').then((m) => m.mountRobot),
  tea: () => import('./tea.js').then((m) => m.mountTea),
  rover: () => import('./rover.js').then((m) => m.mountRover),
};

/** Mount every kit block inside `root`. Returns a function that tears them all down. */
export function hydrate(root) {
  let alive = true;
  const cleanups = [];
  for (const el of root.querySelectorAll('.kv-block[data-kv]')) {
    if (el.dataset.mounted) continue;
    const load = KIT[el.dataset.kv];
    if (!load) {
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
    load()
      .then((mount) => {
        if (!alive) return; // the page changed while the code was loading
        try {
          const cleanup = mount(el, src);
          el.__kvCleanup = cleanup; // lets a view keep or release one block on its own
          cleanups.push(cleanup);
        } catch (err) {
          console.error(err);
          el.textContent = `This block couldn’t start: ${err.message}`;
        }
      })
      .catch((err) => {
        el.textContent = `This block couldn’t load: ${err.message}. Check your connection and reload.`;
      });
  }
  return () => {
    alive = false;
    cleanups.forEach((c) => c?.());
  };
}
