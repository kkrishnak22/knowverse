# Content standard

`docs/ENGINEERING.md` is the bar for code. This is the bar for what students read. A page is not
"done" until it meets every point below and the owner has approved it (`status: published`).

The reference page is **What is a program?** (`content/programming/python/what-is-a-program.md`
and its Telugish version `what-is-a-program.te.md`). When in doubt, copy its shape.

## 1. Truth first

- Every fact is one we are sure of. If a fact is not common knowledge, check it against an
  official source (python.org docs, the ServiceNow docs) before writing it.
- Code in a lesson must run and print exactly what the lesson says it prints.
- Keep `status: draft` until the owner has read and approved the page.

## 2. Plain words

- One idea per sentence. State it, then show it. No selling lines ("watch your code come alive").
- Bold the word being defined the first time it appears.
- Short paragraphs: three sentences at most.

## 3. A thing to try under every key sentence

Each key sentence gets a picture, a lab or a question right under it, so it is learnt by doing:

| Kit block | Use it for |
|---|---|
| `kv-machine` | Watching the computer run lines one at a time |
| `kv-lab` | Changing real Python and watching memory change |
| `kv-predict` | "What happens when this runs?" before the student runs it |
| `kv-robot`, `kv-tea`, `kv-rover` | Ordering and planning instructions as a game |

Nothing plays by itself: the student clicks, and a caption says what to click next.

## 4. The lesson shape

The intro (before the first `##`) holds the main interactive picture and one line on how to use
it. Then the tabs, with these exact headings in every language:

- `## See`: the idea, an analogy (`> [!analogy]`) and the common wrong idea (`> [!mistake]`).
- `## Play`: two to four things to try, ending with at least one `kv-predict`.
- `## Remember`: a one-breath recap (`> [!recap]`) and three short bullets.
- `## Explain`: how to answer it in an interview (`> [!interview]`), plus one likely follow-up.
- `## Exam`: (when ready) 2-mark and 10-mark answers.

## 5. Words a beginner may not know

- Every such word is in `js/glossary.js` with an English and a Telugish meaning. Lesson text is
  underlined automatically wherever a glossary word appears (once per lesson).
- Link other topics with `[[Topic]]` (or `[[Topic|label]]`) so Quick look can explain them.

## 6. Telugish

- Every page gets a Telugish version next to it: `<name>.te.md`, with `title` and `description`
  in its frontmatter and the translated body.
- Telugish is Telugu written in English letters, the way people talk: keep the English tech words
  students will meet (program, loop, variable, Run). Never translate code, output or error names.
- Keep the same `##` headings (See, Play, …) and the same kit blocks in the same order, with the
  code unchanged. `tests/i18n.test.js` fails if a translation drifts from its English page.
- Telugish is drafted by Claude and reviewed by the owner, like everything else.

## Checklist for a page

- [ ] Every fact checked; every code sample runs as described
- [ ] One thing to try under each key sentence
- [ ] See / Play / Remember / Explain filled in
- [ ] New words added to `js/glossary.js` (English and Telugish)
- [ ] `<name>.te.md` written and `npm run check` passes
- [ ] Owner approved → `status: published`
