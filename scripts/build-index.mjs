// Scans content/ for Markdown notes and writes two files the site loads at startup:
//
//   content/index.json   the list of note paths (kept for tools and as a fallback)
//   content/bundle.json  every note's text in one file, so the site makes one request
//                        instead of one per note
//
// Run with `npm run index`, and by the GitHub Pages workflow on every push. The dev server
// (scripts/serve.mjs) builds the bundle fresh on each request, so local edits show at once
// and bundle.json is never committed.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/** Read every note. Returns { paths: [...], notes: { path: text } }, sorted by path. */
export async function readContent() {
  const files = (await walk(contentDir)).sort();
  const paths = files.map((f) => relative(contentDir, f).split(sep).join('/'));
  const texts = await Promise.all(files.map((f) => readFile(f, 'utf8')));
  return { paths, notes: Object.fromEntries(paths.map((p, i) => [p, texts[i]])) };
}

export const bundleJson = ({ notes }) => JSON.stringify({ generated: new Date().toISOString(), notes });

// Only write files when run directly, not when imported by the dev server.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const content = await readContent();
  await writeFile(join(contentDir, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), notes: content.paths }, null, 2) + '\n');
  await writeFile(join(contentDir, 'bundle.json'), bundleJson(content));
  console.log(`Indexed ${content.paths.length} notes → content/index.json, content/bundle.json`);
}
