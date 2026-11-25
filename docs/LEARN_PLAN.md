# Knowverse Learn — plan

Learn turns Knowverse universes into interactive courses. The first course is **Python**, in the Programming universe.

## Problem

Engineering students learn concepts from text and lectures they can't picture. They forget them, and they can't explain them in exams or interviews. Teachers don't have time to make visual material. Colleges don't prepare students for placements.

## Who it's for

1. **Students first** — complete beginners learning Python, on laptops or college lab PCs.
2. **Teachers later** — the reusable kit becomes a library they can project in class.

## Success

- The visuals and interactions are smooth and high quality — it should feel like playing, because the interaction itself is fun (not because of points).
- **The test:** a complete beginner plays through Module 0 alone, enjoys it, and can then explain how code runs in their own words. Watch 5 real beginners use it.

## Decisions

| Topic | Decision |
|---|---|
| Where it lives | Inside Knowverse. A **Learn** mode in every universe; universes without a course show "coming soon". |
| First course | Python, starting from zero (what is a program?). |
| Core feature | **Live Lab**: type code, watch it come alive in 3D. |
| Content | AI drafts each lesson; the owner reviews it (`status: draft` until reviewed). |
| Budget | Claude Pro only. Nothing in Learn needs an API key. The future AI tutor uses the student's own Anthropic API key (billed separately from Claude Pro). |
| Hosting | GitHub Pages (already set up). |
| Theme | Dark, but redesigned and more polished across all of Knowverse. |
| Out of scope | XP, tiers, daily missions, leaderboards, mobile-first design. |

## How it maps onto the project

Courses are ordinary notes, so they follow the vault's hierarchy and show up in the graph and docs too:

```
content/programming/universe.md                 hub     "Programming Universe"
content/programming/python/python.md            category = a course   ("Python")
content/programming/python/module-0-….md        topic    = a module
content/programming/python/variables.md         subtopic = a lesson   (lesson: true, order: 5)
```

Lesson frontmatter adds `lesson: true` and `order: <n>`. The body:

~~~markdown
```kv-lab              ← the stage at the top (before the first ## heading)
age = 20
```

Intro text.

## See        ← tabs: See · Play · Remember · Explain · Exam (missing ones show "coming soon")
## Play
## Remember
## Explain
## Exam
~~~

## The kit (reusable pieces)

Build once, reuse in every lesson. Any view that renders Markdown can host kit blocks — the lesson page and the docs viewer both do.

| Piece | File | Block |
|---|---|---|
| Python in the browser + tracer (records every step: line, names, objects, output) | `js/kit/python.js` | — |
| 3D memory scene (names, objects, arrows, function frames, lists) | `js/kit/memoryScene.js` | — |
| Code editor (highlighting, active/error line) | `js/kit/editor.js` | — |
| Live Lab (editable, live re-run) | `js/kit/lab.js` | ` ```kv-lab ` |
| Watch scene (read-only, click to run each line, narrated by `# comments`) | `js/kit/lab.js` | ` ```kv-watch ` |
| Predict-then-run | `js/kit/predict.js` | ` ```kv-predict ` |
| The computer reads your program (2D: processor, memory, screen; one click per small step) | `js/kit/machine.js` | ` ```kv-machine ` |
| Robot game (drag instruction cards into a program, run one step at a time) | `js/kit/robot.js` | ` ```kv-robot ` |
| Tea game (steps given in the wrong order; drag to reorder; a kitchen robot does each step literally) | `js/kit/tea.js` | ` ```kv-tea ` |
| Mission Control (Mars rover in 3D: four missions unlock the definition of programming; Parsons ordering, plain English failing, predict-then-observe under a signal delay; ends with the player's program in Python) | `js/kit/rover.js`, `js/kit/rover/` | ` ```kv-rover ` |
| Tooltips for the whole app (any `title` becomes a designed tooltip) | `js/tooltip.js` | — |
| Questions and answers (no code) | `js/kit/predict.js` | ` ```kv-quiz ` |
| Quick look panel for linked words (`[[word]]`), with "currently unavailable" for missing topics | `js/peek.js` | — |
| Underlined words: dotted underline, hover meaning, word card beside the word, "See it", Words list; one shared word list (draft, owner reviews) | `js/glossary.js`, `js/words.js` | tests/glossary.test.js |
| Language switch: English / Telugish (top bar), one { en, te } table per screen, game re-renders in place | `js/i18n.js`, `js/kit/rover/strings.js` | tests/i18n.test.js |
| Registry | `js/kit/blocks.js` | — |

Block options go on the first lines: `#! title: …`, `#! inputs: Ravi | 19`.

Lesson callouts: `> [!analogy]`, `> [!mistake]`, `> [!recap]`, `> [!interview]`, `> [!exam]`.

## Rules for every lesson (from the owner's review)

- **Plain words only.** State the idea in one short sentence with a clear conclusion. No selling sentences ("watch your code come alive").
- **Every key sentence gets a picture or a game right under it**, so it is remembered by doing, then questions and answers.
- **Nothing plays by itself.** The student clicks; a pulsing button and a caption say what to click next.
- **Picture, playground or game on the left; code on the right.**
- **Hover text** on every part that can be named.
- **Link words** with `[[...]]` so the quick look panel can explain them, even if the topic doesn't exist yet.
- Collapse and expand: side panels and the notes tree in Docs, modules on the course map.

## Milestones

**M1 — Foundation (done)**
- Learn route, course map, lesson page with tabs, lesson strip, progress (this browser).
- Kit: Pyodide + tracer, 3D memory scene, editor, Live Lab, watch scenes, predict.
- Content: Module 0 (4 lessons) and Module 1 (6 lessons), drafted for review.

**M2 — Polish and the computer view**
- **Computer view** in the memory scene: zoom out to CPU, RAM chip and screen (labelled as a simplified model).
- Kit Gallery page (`#/kit`): every piece on its own — later the teacher library.
- Light up completed lessons in the knowledge graph (the roadmap).

**M3 — More interaction patterns**
- Fix-the-bug and drag-to-build blocks.
- Flowchart scene for conditions and loops.
- Recap cards that come back for revision.

**Placeholders (shown as "coming soon")**
- Ask — AI tutor (student's own API key).
- Squad — collaborative learning (needs accounts and a backend).
- Placements — interview practice, aptitude, resume, micro projects.
- University exams — syllabus mapping, previous-year questions.
- Regional languages.

## Reviewing a drafted lesson

1. Open it in Learn (`#/learn/…`) and play every lab and predict card.
2. Check facts, wording and the interview answers.
3. Change `status: draft` to `status: published`.
4. Try it with a real beginner and note where they got stuck.
