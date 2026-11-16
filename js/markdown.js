// A compact, dependency-free Markdown renderer with Obsidian-style extras:
// [[wikilinks]], [[target|alias]], > [!callout] blocks, task lists, tables, ==highlights==,
// plus ```kv-*``` fences for interactive Learn kit blocks.
// All text is HTML-escaped before any markup is added, so note content cannot inject HTML.

import { esc } from './ui.js';
import { resolve, slugify } from './store.js';

const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
const safeUrl = (u) => (/^(https?:\/\/|mailto:|#|\/|\.\.?\/)/i.test(u) ? u : '#');

function inline(text) {
  const codes = [];
  text = text.replace(/`([^`\n]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  text = esc(text);
  text = text.replace(/\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g, (_, target, anchor, alias) => {
    const note = resolve(unesc(target));
    const label = alias || target.trim();
    return note
      ? `<a class="wikilink" href="#/note/${encodeURI(note.id)}" data-note="${esc(note.id)}" title="Click for a quick look">${label}</a>`
      : `<span class="wikilink unresolved" data-term="${esc(unesc(target).trim())}" role="button" tabindex="0" title="Click for a quick look">${label}</span>`;
  });
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const href = safeUrl(unesc(url));
    const ext = /^https?:/i.test(href);
    return `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer" class="external"' : ''}>${label}</a>`;
  });
  text = text
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
  return text.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || '');
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

function renderList(items) {
  // items: [{ indent, ordered, text }] → nested <ul>/<ol>
  let html = '';
  const stack = [];
  for (const it of items) {
    while (stack.length && it.indent < stack.at(-1).indent) html += `</li></${stack.pop().tag}>`;
    if (stack.length && it.indent === stack.at(-1).indent) html += '</li>';
    if (!stack.length || it.indent > stack.at(-1).indent) {
      const tag = it.ordered ? 'ol' : 'ul';
      stack.push({ indent: it.indent, tag });
      html += `<${tag}>`;
    }
    const task = it.text.match(/^\[([ xX])\]\s+(.*)$/);
    html += task
      ? `<li class="task"><input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}> ${inline(task[2])}`
      : `<li>${inline(it.text)}`;
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}

/** Render Markdown → { html, headings: [{ level, text, id }] } */
export function renderMarkdown(src) {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const headings = [];
  const usedIds = new Map();
  let i = 0;

  const paragraphEnd = (l) => !l.trim() || /^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s|---+\s*$|\*\*\*+\s*$)/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code
    const fence = line.match(/^```\s*([\w+-]*)/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      // Learn kit blocks (```kv-lab, ```kv-watch, ```kv-predict…) become mount points that js/kit/blocks.js brings to life.
      if (/^kv-/.test(fence[1])) {
        out.push(`<div class="kv-block" data-kv="${esc(fence[1].slice(3))}" data-src="${esc(encodeURIComponent(buf.join('\n')))}"></div>`);
        continue;
      }
      out.push(`<pre${fence[1] ? ` data-lang="${esc(fence[1])}"` : ''}><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // Heading
    const hd = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (hd) {
      const level = hd[1].length;
      const text = hd[2].replace(/[*_`=~]|\[\[|\]\]/g, '');
      let id = `h-${slugify(text)}`;
      const n = usedIds.get(id) || 0;
      usedIds.set(id, n + 1);
      if (n) id += `-${n}`;
      headings.push({ level, text, id });
      out.push(`<h${level} id="${id}">${inline(hd[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(---+|\*\*\*+|___+)\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // Blockquote / callout
    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      const callout = buf[0].match(/^\[!(\w+)\][+-]?\s*(.*)$/);
      if (callout) {
        const kind = callout[1].toLowerCase();
        const title = callout[2] || kind[0].toUpperCase() + kind.slice(1);
        out.push(`<div class="callout callout-${esc(kind)}"><div class="callout-title">${inline(title)}</div>${renderMarkdown(buf.slice(1).join('\n')).html}</div>`);
      } else {
        out.push(`<blockquote>${renderMarkdown(buf.join('\n')).html}</blockquote>`);
      }
      continue;
    }

    // Table
    if (line.includes('|') && isTableSep(lines[i + 1])) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      const td = (tag, row) => row.map((c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c)}</${tag}>`).join('');
      out.push(`<div class="table-wrap"><table><thead><tr>${td('th', head)}</tr></thead><tbody>${rows.map((r) => `<tr>${td('td', r)}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    // List
    if (LIST.test(line)) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST);
        if (m) {
          items.push({ indent: m[1].replace(/\t/g, '  ').length, ordered: /\d/.test(m[2]), text: m[3] });
        } else if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length) {
          items.at(-1).text += ' ' + lines[i].trim(); // lazy continuation
        } else {
          break;
        }
        i++;
      }
      out.push(renderList(items));
      continue;
    }

    // Paragraph
    const buf = [line];
    i++;
    while (i < lines.length && !paragraphEnd(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${buf.map((l) => inline(l.trim())).join('<br>')}</p>`);
  }

  return { html: out.join('\n'), headings };
}
