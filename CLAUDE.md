# Knowverse — notes for Claude

A static knowledge-multiverse site: no build step, plain ES modules, served as-is (GitHub Pages).

## Quality bar (read first)

`docs/ENGINEERING.md` is the standard for every change. The short version:

- Anything that animates uses the shared engine in `js/engine/` (`frameLoop`, camera, label placement). Never call `requestAnimationFrame` directly or ease with a per-frame `lerp`.
- Every `mount()` returns a cleanup that undoes everything it started.
- Reuse before writing: check `js/ui.js`, `js/store.js`, `js/engine/` and the CSS variables first. Never keep two copies of the same logic.
- `npm run check` (syntax + tests) must pass before a commit; the deploy is blocked if it fails. Logic that can be silently wrong gets a test in `tests/`.
- Verify in the browser, and confirm the screen goes idle when the user stops.

## Conventions

- Vanilla JS modules; DOM built with `h()` / `fill()` from `js/ui.js`. Icons live in `js/ui.js` (`icons`).
- Screens are in `js/views/` and export `mount(el, param) → cleanup` and optionally `update(param)`. Routes are in `js/app.js` (`ROUTES`).
- Notes are Markdown with flat YAML frontmatter in `content/<universe>/…`. Hierarchy: hub → category → topic → subtopic, via `parent:`. After adding or removing notes run `npm run index`.
- Third-party code is bundled into `vendor/` with esbuild (`npm run vendor`, `npm run vendor:three`). Pyodide is the exception: it loads from jsDelivr at runtime (too large to vendor).
- CSS: `css/styles.css` (app), `css/multiverse.css` (home), `css/learn.css` (Learn + kit), `css/rover.css` (the Mission Control game). Design tokens are the `:root` variables in `styles.css`.

## Learn

Read `docs/LEARN_PLAN.md` first. In short:

- Lessons are subtopic notes with `lesson: true` and `order:`; courses are categories; modules are topics.
- ```` ```kv-<kind> ```` fences in Markdown become kit components (`js/kit/blocks.js` registry). Add a new reusable piece as `mountX(el, src) → cleanup` and register it there.
- Everything visual runs off the tracer's steps (`js/kit/python.js`): `{ line, event, frames: [{ name, vars: [[name, objId]] }], heap: { objId: { kind, repr, items? } }, out }`.
- Lesson content is drafted by Claude and reviewed by the owner: keep `status: draft` until they approve it. Don't add facts you aren't sure of.
- Follow "Rules for every lesson" in the plan: plain words, a picture or game under each key sentence, nothing autoplays, picture left and code right, hover text, linked words.
- Out of scope: XP, tiers, daily missions, leaderboards.

## Run locally

`npm install` then `npm start` → http://localhost:4173. Learn is at `#/learn`.
