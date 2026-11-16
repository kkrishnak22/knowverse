// Label placement, the way maps place place-names: the most important labels are placed
// first and any label that would overlap one already placed is left out. Callers fade
// labels in and out as the result changes, so nothing pops.
//
// Pure and DOM-free: tests/labels.test.js.

const CELL = 96; // px; boxes are bucketed into a grid so each test only looks at neighbours

/**
 * @param {{ x: number, y: number, w: number, h: number, priority: number, force?: boolean }[]} boxes
 *   Screen-space boxes (x, y = top-left). Higher priority wins. `force` boxes are always
 *   kept (the hovered or selected item) and still block lower-priority ones.
 * @param {number} [gap] Minimum clear space between two labels, in px.
 * @returns {boolean[]} For each input box, whether its label should be shown.
 */
export function placeLabels(boxes, gap = 4) {
  const order = boxes.map((_, i) => i).sort((a, b) => (boxes[b].force ? 1 : 0) - (boxes[a].force ? 1 : 0) || boxes[b].priority - boxes[a].priority || a - b);
  const grid = new Map();
  const shown = new Array(boxes.length).fill(false);
  const cellsOf = (b) => {
    const keys = [];
    for (let cx = Math.floor((b.x - gap) / CELL); cx <= Math.floor((b.x + b.w + gap) / CELL); cx++) {
      for (let cy = Math.floor((b.y - gap) / CELL); cy <= Math.floor((b.y + b.h + gap) / CELL); cy++) keys.push(cx * 73856093 + cy * 19349663);
    }
    return keys;
  };
  const overlaps = (a, b) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

  for (const i of order) {
    const b = boxes[i];
    const keys = cellsOf(b);
    if (!b.force && keys.some((k) => grid.get(k)?.some((o) => overlaps(b, o)))) continue;
    shown[i] = true;
    for (const k of keys) {
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(b);
    }
  }
  return shown;
}
