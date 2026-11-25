# Quality checklist

The basics nobody asks for but everyone notices. Every change is checked against this list
before it is called done. It has three layers, so nothing depends on someone remembering:

| Layer | What it checks | How to run it |
|---|---|---|
| **Tests** (`tests/quality.test.js`) | Rules that can be read from the source | `npm run check` (blocks the deploy) |
| **Live audit** (`js/engine/audit.js`) | Rules that need the real page | Add `?audit` before the `#`, e.g. `/?audit#/learn` |
| **Scenario sweep** (`js/engine/sweep.js`) | Plays a page like a visitor (empty Run, crash, win, demo, language, Esc) and audits every step | `?sweep` before the `#`, at 1920×1080, 1366×768, 1083×622 and 375×812 |
| **Eyes** (the list at the end) | Taste and flow, which no script can judge | `/quality-audit` walks every screen |

Rule names (like `load.heavy-before-ask`) are the same in the tests, the audit panel and here.

## Loading

- **load.heavy-before-ask**: nothing heavy downloads before the visitor asks for it. Big
  features (the 3D game, Python) show a light cover or start on intent: Play, a click, or the
  pointer reaching for them (`whenWanted` in `js/ui.js`). This is the "facade" or
  "import on interaction" pattern from web.dev. Pointing at the button may fetch early.
- **load.page-weight**: under 1.5 MB before the first click.
- **perf.lcp**: the main content appears within 2.5 s (Core Web Vitals "good").
- **perf.layout-shift**: total layout shift under 0.1 (Core Web Vitals "good").
- **perf.long-task**: no script freezes the page for more than 200 ms.

## Layout

- **layout.overflow-x**: no page ever scrolls sideways, at 375 px or 1600 px.
- **layout.squeezed**: when panels close, content grows into the room. Main content uses at
  least 60% of its area on wide screens.
- **layout.line-length**: running text stays near 80 letters a line (`max-width: 66ch` in this
  font); labs, games, code and tables take the full width.

## Motion (docs/ENGINEERING.md §2a and §2b)

- **motion.snap**: open/close states move (fade and resize); `display: none` on a state class
  snaps and is not allowed.
- **motion.costly-loop**: anything that loops forever moves only `transform` or `opacity`.
- **motion.busy**: no more than three things animate on their own; "do this next" pulses play a
  few times and rest.
- **motion.unasked-3d**: no 3D scene or canvas runs inside reading content before it is asked for.
- **motion.reduce**: "reduce motion" in the system settings is honoured everywhere.

## Interaction and words

- **ui.overlap**: floating things (messages, legends, button groups) never cover each other. Check at the
  sizes people really use (1366×768, 1920×1080 and phone), because overlaps depend on width.
- **ui.message-where-looking**: a message about something the player did appears next to it (an
  empty program gets its note under the program), not somewhere they are not looking.
- **ui.invisible-blocker**: nothing invisible covers the page and catches clicks. A dialog stops
  catching clicks the moment it starts to close (`.backdrop:not(.in)` in `css/styles.css`).
- **copy.plural**: a count agrees with its word ("1 category"). Use `count(n, word)` from `js/ui.js`.
- **load.kit-on-demand**: a lesson block's code loads only on pages that contain it
  (`js/kit/blocks.js`); checked in `tests/quality.test.js`.

## Accessibility (WCAG 2.2 AA)

- **a11y.name**: every button, link and field has a name a screen reader can say.
- **a11y.alt**: every image has alt text (empty `alt=""` for decoration).
- **a11y.contrast**: text contrast at least 4.5:1 (3:1 for large text). The dim token
  `--text-3` passes on every background; never invent a dimmer grey.
- **a11y.target-size**: on phones, tap targets at least 24×24 px (we aim for 32).

## Needs eyes (no script can judge these)

Walk each screen at desktop (1440 px) and phone (375 px) width with the browser pane visible:

- **First impression**: is it obvious what this page is and what to do first?
- **Every press answers**: hover, pressed and focus states on everything you can click.
- **Things leave the way they came**: a panel that slides in from the left slides out left.
- **Empty, loading and error states**: each has words that say what is happening and what to do.
- **Nothing jumps** while you read or after you click.
- **State is remembered** across a reload: open panels, tabs, language, progress.
- **Both languages**: switch to Telugish and look again.
- **Keyboard**: Tab reaches everything in a sensible order; Esc closes what is open.

## Sources

- web.dev, "Lazy load third-party resources with facades" and "Best practices for embeds"
  (import on interaction).
- web.dev, Core Web Vitals thresholds: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
- W3C, WCAG 2.2: contrast 1.4.3, target size 2.5.8, animation from interactions 2.3.3.
