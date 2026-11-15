# Knowverse

A knowledge multiverse. The home page is a map of universes (ServiceNow, Programming, AI & ML, …); each universe has its own Obsidian-style knowledge graph, documentation viewer and AI workspace for writing notes through conversation.

The site is a static app with no build step. Universes are listed in `content/multiverse.json`; each universe's notes are Markdown files in `content/<universe-id>/`.

## Run it locally

```bash
npm install
npm start
```

Then open http://localhost:4173.

## What's inside

| Area | What it does |
| --- | --- |
| **Multiverse** (`#/`) | Map of every universe as a spiral galaxy, built on the same graph engine as the universes themselves. Drag to pan, scroll to zoom, click or zoom in on a universe to open its panel, double-click or press Enter Universe to go in. |
| **Knowledge graph** (`#/u/<universe>`) | Force-directed graph of every note. Zoom, pan, drag nodes, hover to highlight connections, filter clusters from the legend, click a node for a preview, double-click to open it. |
| **Documentation** (`#/note/…`) | Note tree, rendered article, local graph, outline, backlinks and related topics. |
| **AI Knowledge Architect** (`#/architect`) | Chat with Claude to turn raw information into a structured note. Each note moves through Draft → In review → Approved → Published. |
| **Search** (`Ctrl K`) | Full-text search and quick commands. |

## Notes

Each note is a Markdown file with frontmatter:

```markdown
---
title: Topic Title
type: topic            # hub | category | topic | subtopic
category: Category Name
parent: Category Name  # title of the note directly above
description: One sentence about the note.
tags: [keyword, another]
---

## Section

Body text. Link other notes with [[Note Title]] or [[Note Title|custom label]].
```

`parent` builds the hierarchy; `[[wikilinks]]` build the cross-links. Both become edges in the graph.

`content/index.json` lists the notes the site loads. Regenerate it after adding or removing files by hand:

```bash
npm run index
```

The current notes are generic placeholders (`placeholder: true`). To regenerate them: `npm run seed`.

## Settings

Open **Settings** (gear icon) to add:

- **Anthropic API key** — enables the Architect. Without it the workspace runs in an offline demo mode that only files your text into a skeleton.
- **GitHub repository + token** — makes *Publish* commit the note to `content/` in your repo. Use a fine-grained personal access token limited to that repository with *Contents: Read and write*.

Both are stored only in your browser's localStorage.

## Publishing to GitHub Pages

`.github/workflows/deploy.yml` rebuilds the index and deploys the site on every push to `main`. In the repository, set **Settings → Pages → Source** to **GitHub Actions**. After that, a note published from the Architect appears on the live site a minute or so later.

## Project layout

```
index.html            app shell
css/styles.css        theme
js/app.js             routing, command palette, settings
js/store.js           vault, link graph, search, local storage
js/graph.js           canvas force-graph engine
js/markdown.js        Markdown + wikilink renderer
js/ai.js              Architect prompt and Claude streaming
js/github.js          GitHub commits
js/views/             multiverse, graph, docs and architect screens
content/              the notes
scripts/              dev server, index builder, placeholder seeder
vendor/               bundled Anthropic SDK (npm run vendor)
```

## Adding a universe

Add an entry to `content/multiverse.json` (id, name, icon, colours, position) and, optionally, edges to other universes. Its notes go in `content/<id>/`. A universe with no notes shows as empty until its first note is published.
