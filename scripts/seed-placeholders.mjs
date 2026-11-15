// Generates generic placeholder notes (Category / Topic Title / Subtopic) so the
// graph and viewer have structure to show before real content exists.
// Every generated note carries `placeholder: true`. Delete content/ and re-run to regenerate.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const contentDir = resolve(fileURLToPath(new URL('../content/servicenow', import.meta.url)));
const today = new Date().toISOString().slice(0, 10);
const HUB = 'ServiceNow Universe';

// Deterministic pseudo-random so the layout is stable between runs.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const notes = [];
const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
const topicCounts = [5, 6, 4, 5, 6, 4];

letters.forEach((L, ci) => {
  const category = `Category ${L}`;
  const dir = slug(category);
  const topics = [];
  for (let t = 1; t <= topicCounts[ci]; t++) {
    const topic = `Topic Title ${L}${t}`;
    const subs = [];
    const subCount = Math.floor(rand() * 4); // 0–3
    for (let s = 1; s <= subCount; s++) {
      const sub = `Subtopic ${L}${t}.${s}`;
      subs.push(sub);
      notes.push({ path: `${dir}/${slug(sub)}.md`, title: sub, type: 'subtopic', category, parent: topic, children: [] });
    }
    topics.push(topic);
    notes.push({ path: `${dir}/${slug(topic)}.md`, title: topic, type: 'topic', category, parent: category, children: subs });
  }
  notes.push({ path: `${dir}/${dir}.md`, title: category, type: 'category', category, parent: HUB, children: topics });
});
notes.push({ path: 'universe.md', title: HUB, type: 'hub', category: '', parent: '', children: letters.map((L) => `Category ${L}`) });

// Cross-links between topics in different categories.
const topics = notes.filter((n) => n.type === 'topic');
for (const n of topics) {
  n.related = [];
  const count = rand() < 0.55 ? 1 : rand() < 0.5 ? 2 : 0;
  for (let i = 0; i < count; i++) {
    const other = pick(topics);
    if (other !== n && other.category !== n.category && !n.related.includes(other.title)) n.related.push(other.title);
  }
}

const childHeading = { hub: 'Categories', category: 'Topics', topic: 'Subtopics' };

function render(n) {
  const fm = [
    '---',
    `title: ${n.title}`,
    `type: ${n.type}`,
    n.category && `category: ${n.category}`,
    n.parent && `parent: ${n.parent}`,
    'description: Description placeholder — a one-line summary of this note goes here.',
    `tags: [placeholder, tag-${n.type}]`,
    'status: placeholder',
    'placeholder: true',
    `updated: ${today}`,
    '---',
  ].filter(Boolean);

  const body = [
    '> [!info] Placeholder',
    '> This note only demonstrates structure. Real content will be created in the AI Knowledge Architect.',
    '',
    '## Description',
    '',
    'Description placeholder. A short overview of the subject, why it matters, and where it fits will be written here.',
    '',
    '## Notes',
    '',
    '- Notes placeholder',
    '- Notes placeholder',
    '- Notes placeholder',
  ];
  if (n.children.length) {
    body.push('', `## ${childHeading[n.type]}`, '', ...n.children.map((c) => `- [[${c}]]`));
  }
  if (n.related?.length) {
    body.push('', '## Related', '', ...n.related.map((r) => `- [[${r}]]`));
  }
  return fm.join('\n') + '\n\n' + body.join('\n') + '\n';
}

for (const n of notes) {
  const file = join(contentDir, n.path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, render(n));
}
console.log(`Wrote ${notes.length} placeholder notes to content/servicenow/`);
