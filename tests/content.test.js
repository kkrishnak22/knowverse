import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, serializeNote, slugify } from '../js/store.js';
import { renderMarkdown } from '../js/markdown.js';

test('frontmatter: flat keys, arrays, booleans and quoted strings', () => {
  const { data, body } = parseFrontmatter('---\ntitle: "A: B"\ntype: topic\ntags: [one, two]\nplaceholder: true\n---\n\n## Heading\n\nText');
  assert.equal(data.title, 'A: B');
  assert.equal(data.type, 'topic');
  assert.deepEqual(data.tags, ['one', 'two']);
  assert.equal(data.placeholder, true);
  assert.equal(body, '## Heading\n\nText');
});

test('frontmatter: a file without it is all body', () => {
  const { data, body } = parseFrontmatter('Just text');
  assert.deepEqual(data, {});
  assert.equal(body, 'Just text');
});

test('serialize → parse round-trips a note', () => {
  const fields = { title: 'Topic: One', type: 'topic', category: 'Cat A', parent: 'Cat A', description: 'About it.', tags: ['a', 'b'], body: '## Notes\n\n- item' };
  const { data, body } = parseFrontmatter(serializeNote(fields));
  assert.equal(data.title, fields.title);
  assert.equal(data.category, fields.category);
  assert.deepEqual(data.tags, fields.tags);
  assert.equal(body, fields.body);
});

test('slugify makes URL-safe ids', () => {
  assert.equal(slugify('Topic Title A1'), 'topic-title-a1');
  assert.equal(slugify('  AI & ML!  '), 'ai-ml');
  assert.equal(slugify(''), 'untitled');
});

test('markdown: headings get ids and are reported for the outline', () => {
  const { html, headings } = renderMarkdown('## First\n\n## First\n\n### Sub');
  assert.deepEqual(headings.map((h) => [h.level, h.id]), [[2, 'h-first'], [2, 'h-first-1'], [3, 'h-sub']]);
  assert.match(html, /<h2 id="h-first">First<\/h2>/);
});

test('markdown: note content cannot inject HTML or scripts', () => {
  const hostile = '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))\n\n**bold <b onclick=x>**';
  const { html } = renderMarkdown(hostile);
  assert.ok(!/<script/i.test(html), 'no script tag');
  assert.ok(!/<img/i.test(html), 'no raw img tag');
  assert.ok(!/href="javascript:/i.test(html), 'no javascript: link');
  assert.ok(!/<b onclick/i.test(html), 'no raw attributes');
});

test('markdown: code is escaped and not formatted', () => {
  const { html } = renderMarkdown('```js\nconst a = "<b>" && **x**;\n```\n\nInline `<i>` here');
  assert.match(html, /<pre data-lang="js"><code>const a = &quot;&lt;b&gt;&quot; &amp;&amp; \*\*x\*\*;<\/code><\/pre>/);
  assert.match(html, /<code>&lt;i&gt;<\/code>/);
});

test('markdown: lists nest, tasks render as checkboxes, tables render', () => {
  const { html } = renderMarkdown('- a\n  - b\n- [x] done\n\n| H1 | H2 |\n| --- | :-: |\n| c | d |');
  assert.match(html, /<ul><li>a<ul><li>b<\/li><\/ul><\/li><li class="task"><input type="checkbox" disabled checked> done<\/li><\/ul>/);
  assert.match(html, /<table><thead><tr><th>H1<\/th><th style="text-align:center">H2<\/th><\/tr><\/thead>/);
});

test('markdown: an unresolved wikilink is marked, not linked', () => {
  const { html } = renderMarkdown('See [[No Such Note|label]].');
  assert.match(html, /<span class="wikilink unresolved"[^>]*>label<\/span>/);
});
