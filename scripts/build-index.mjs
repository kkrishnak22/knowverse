// Scans content/ for Markdown notes and writes content/index.json.
// The site reads this manifest to discover notes. Runs locally (npm run index)
// and in the GitHub Pages workflow on every push, so published notes appear automatically.
import { readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const contentDir = resolve(fileURLToPath(new URL('../content', import.meta.url)));

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.toLowerCase().endsWith('.md')) out.push(full);
  }
  return out;
}

const notes = (await walk(contentDir))
  .map((f) => relative(contentDir, f).split(sep).join('/'))
  .sort();

await writeFile(
  join(contentDir, 'index.json'),
  JSON.stringify({ generated: new Date().toISOString(), notes }, null, 2) + '\n',
);
console.log(`Indexed ${notes.length} notes → content/index.json`);
