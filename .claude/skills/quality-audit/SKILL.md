---
name: quality-audit
description: Audit every Knowverse screen for the basics users notice but never ask for (heavy loading before a click, snapping panels, squeezed layouts, long lines, endless animation, contrast, tap targets, labels), at desktop and phone width, in both languages, then fix what it finds. Use after any feature or UI change, before calling work done, or when the owner asks to check quality.
---

# Quality audit

The checklist is `docs/QUALITY.md`; read it first. This skill runs all three of its layers and
reports one list, most serious first.

## 1. Tests

Run `npm run check`. A failing `tests/quality.test.js` rule is a finding (it names the rule).

## 2. Live audit on every screen

Start the dev server (`.claude/launch.json`, name `sn-universe`) and keep the browser pane
visible: some checks need eyes, and animations do not run in a hidden pane.

Open `http://localhost:4173/?audit#/` and run the audit on every route, at 1440×900 and at
375×812 (phone preset), in English and in Telugish (top bar switch):

```js
const { runAudit } = await import('/js/engine/audit.js');
const routes = ['#/', '#/graph', '#/note/programming/universe', '#/note/programming/python/variables',
  '#/learn', '#/learn/programming/python/what-is-a-program', '#/learn/programming/python/loops', '#/architect'];
const out = {};
for (const r of routes) {
  location.hash = r;
  await new Promise((res) => setTimeout(res, 2200));
  out[r] = runAudit().findings.map((f) => `${f.level} ${f.rule}: ${f.what} | ${f.where.join(' · ')}`);
}
out;
```

Add any new route from `ROUTES` in `js/app.js` to that list. Load timings (`perf.lcp`,
`perf.long-task`) only describe the first page opened; open a page directly to measure it.

## 2b. Scenario sweep (pages that have one)

Pages with a scripted visit in `SWEEPS` (`js/engine/sweep.js`) are played automatically: open
`http://localhost:4173/?sweep#/note/programming/universe` at each of 1920×1080, 1366×768,
1083×622 and 375×812 (resize the pane, then reload). It runs about 40 s; poll `window.__sweep`
until `done`, and every step must pass with no findings. A failing step names what broke.

When a bug is found by hand on such a page, add a step or an expectation for it to the sweep.

## 3. Interactions

For every control that opens or closes something (side panels, drawers, modules, tabs, the
checkpoint panel, word cards, the language switch), use it and confirm it moves rather than
snaps. When the pane is hidden, seek the animations instead of watching them:

```js
const anims = document.getAnimations();
anims.forEach((a) => { a.pause(); a.currentTime = 130; }); // read sizes mid-way, then a.finish()
```

Also check: closing panels lets content grow; nothing heavy appears in the network list before
the first click (`performance.getEntriesByType('resource')`); Esc closes what is open.

## 4. Eyes

Go through "Needs eyes" in `docs/QUALITY.md` screen by screen.

## 5. Report and fix

Report a table: rule · screen · what is wrong · fix. Fix every `fail` and every clear `warn`,
re-run the audit to show it is gone, and run `npm run check`. When a finding could have been
caught by a test or an audit rule, add that rule (in `tests/quality.test.js` or
`js/engine/audit.js`, plus a line in `docs/QUALITY.md`) so it can never come back silently.

End with a "Quality check" line: what was checked, and what could not be (for example, motion
not watched because the pane was hidden).
