# Knowverse engineering standards

These rules apply to every change, whoever or whatever writes it. They exist so the product
keeps feeling like one smooth app as it grows. If a rule gets in the way, change the rule here
first, with the reason; don't quietly work around it.

## 1. The bar

- **60 frames a second while the user is touching something.** A frame has 16 ms. Work that
  can't fit goes off the main thread, is spread across frames, or is computed ahead of time.
- **Zero work when nothing is happening.** An idle screen must not burn CPU or battery.
- **Never blank, never jumping.** Show what you have while more loads; fade changes in.
  Nothing pops, flashes or shifts layout under the pointer.
- **Motion is measured in milliseconds, not frames.** It must feel identical at 60 Hz and 120 Hz.
- **Every interaction can be interrupted.** A new input always wins over a running animation.

## 2. The engine (`js/engine/`)

Anything that moves, zooms or animates is built on these. Do not re-implement them.

| Module | Use it for | Never do instead |
| --- | --- | --- |
| `loop.js` (`frameLoop`) | Every animation. Register a ticker; return `ACTIVE`, `AMBIENT` or `IDLE`. | Call `requestAnimationFrame` or `setInterval` yourself. |
| `camera.js` | Pan, zoom, glide, fit, flick inertia. | Hand-rolled `lerp(x, target, 0.1)` per frame. |
| `labels.js` | Deciding which labels fit without overlapping. | Drawing every label and hoping. |

Rules that follow from the loop:

- A ticker receives `dt` in milliseconds. Use `easeFactor(dt, tau)` for easing.
- Return `ACTIVE` only while something is really changing; `AMBIENT` for decoration (twinkles,
  drifting particles); `IDLE` when there is nothing to draw.
- After changing state from outside a frame (input, new data), call `wake()`.
- Simulations run on a fixed time step, not once per frame.

## 2a. CSS motion

- **Animate only `transform` and `opacity`.** The graphics card runs those without repainting.
  Animating `box-shadow`, `filter`, `background`, `width`, `height`, `top` or `left` repaints (or
  re-lays-out) every frame and makes scrolling stutter, most of all on `infinite` animations.
  For a glow or ring that pulses, put the shadow on a `::after` and animate its scale and opacity
  (see `.guide` in `css/learn.css`).
- **Never write a bare `transition: 0.15s`.** It animates every property. Use
  `transition: var(--t-ui)` for hover and press states, or list the properties.
- No `backdrop-filter` or `filter` on elements inside a scrolling area.
- **Every scrolling area has a solid background** (or `will-change: scroll-position` when it sits
  on glass). Without one, Chrome repaints the content on every scroll frame on screens under
  150% scaling. The list of scrollers is in the "Scrolling" block of `css/styles.css`; add new
  ones there.
- **Measure in a real browser.** Add `?perf` to the URL (before the `#`) for the frame meter:
  it shows dropped frames overall and while scrolling, and names the script behind any long
  frame. A change that touches rendering is checked with it before it is called done.
- To audit a page, list `document.getAnimations()` and check that no `infinite` animation
  touches anything other than `transform` and `opacity`.

## 3. Components

Every screen (`js/views/`) and every lesson widget (`js/kit/`) has the same shape:

```js
export function mount(el, param) {
  // build DOM, start work
  return () => { /* undo everything */ };
}
```

- **The cleanup undoes everything the mount did**: listeners, observers, timers, tickers,
  network requests, GPU resources. A component that is mounted and unmounted 100 times must
  leave nothing behind.
- Add listeners with an `AbortController` signal so one `abort()` removes them all.
- Heavy work (Python, 3D, large data) starts only when the component scrolls into view:
  `whenVisible(el, start)` from `js/ui.js`.
- Build DOM with `h()` / `fill()` from `js/ui.js`. Never assign user or note text to
  `innerHTML`; note Markdown goes through `renderMarkdown`, which escapes it.

## 4. Reuse before writing

Before adding a helper, search for one. Shared code lives in exactly one place:

- DOM, icons, toast, modal, `esc`, `debounce`, `whenVisible` → `js/ui.js`
- Notes, links, search, settings, drafts, storage → `js/store.js`
- Camera, frame loop, label placement → `js/engine/`
- Colours, spacing, radii, shadows, motion curves → the `:root` variables in `css/styles.css`

Two copies of the same logic is a bug waiting to diverge. If a second use appears, move the
code to the shared place and use it from both.

## 5. Loading

- Load on demand. Code a screen doesn't need at startup is imported with `import()` when used.
- Large libraries (three.js, Pyodide, the Anthropic SDK) are never in the startup path.
- Don't fetch what isn't on screen.
- Nothing in `<head>` may block the first paint except the app's own CSS. Web fonts load
  asynchronously and every font stack includes its metric-matched fallback.
- Small graphs appear already laid out (`presettle: true`); only the large explorable maps
  animate into place.

## 6. Tests and the deploy gate

- `npm run check` must pass before every commit. The deploy workflow runs the same checks and
  refuses to publish if any fail.
- Logic that can be wrong without anyone noticing gets a test in `tests/`: parsing, maths,
  placement, state transitions. Keep such logic in pure functions (no DOM) so it is testable.
- A bug fix comes with a test that fails without the fix.
- Tests run on Node's built-in runner: no dependencies, under a second.

## 7. Definition of done

A change is finished when all of these are true:

1. `npm run check` passes.
2. It was exercised in the browser, including the unhappy paths (empty, slow, failed).
3. No console errors or warnings.
4. Nothing it started is left running after its screen closes.
5. It idles: the frame loop goes to `AMBIENT` or `IDLE` when the user stops.
6. Keyboard users can reach it, and it respects "reduce motion".
7. New shared pieces are documented here; one-off copies were not introduced.

## 8. Roadmap of the engine

Done: shared frame loop, camera physics (eased zoom, flick inertia, frame-rate independent),
map-style label placement, test suite and deploy gate, one bundled request for all notes
(`content/bundle.json`, built at deploy and served fresh by the dev server), non-blocking web
fonts with metric-matched fallbacks, and instant layout for small graphs (`presettle`).

Next, in order:

1. Build step (Vite): minified, fingerprinted, per-screen bundles.
2. Note bodies fetched on demand once the bundle grows past a few hundred KB.
3. GPU renderer for the graphs behind the existing draw interface.
4. Layout simulation in a worker, with positions precomputed at build time.
5. Semantic zoom: multiverse → universe → category → topic → note on one continuous map.
6. Component scope helper, UI kit and design tokens applied across views and lesson widgets.
