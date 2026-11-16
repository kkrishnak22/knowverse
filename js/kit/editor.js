// A light code editor for the Learn kit: a transparent <textarea> over a syntax-highlighted
// <pre>, with line numbers and a marker for the line Python is about to run.
// No dependencies; the same highlighter also renders read-only code (predict cards, scenes).

import { esc } from '../ui.js';

const KEYWORDS = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
const BUILTINS = new Set('print input len range int float str bool list dict set tuple type abs min max sum round sorted id isinstance enumerate zip open'.split(' '));

/** Highlight one line of Python → HTML. */
export function highlightLine(line) {
  let out = '';
  const re = /(#.*$)|("""|'''|"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|(.)/g;
  let m;
  while ((m = re.exec(line))) {
    const [tok, comment, str, num, word] = m;
    if (comment) out += `<span class="tk-c">${esc(comment)}</span>`;
    else if (str) out += `<span class="tk-s">${esc(str)}</span>`;
    else if (num) out += `<span class="tk-n">${esc(num)}</span>`;
    else if (word) {
      const next = line.slice(re.lastIndex).match(/^\s*\(/);
      const cls = KEYWORDS.has(word) ? 'tk-k' : BUILTINS.has(word) ? 'tk-b' : next ? 'tk-f' : '';
      out += cls ? `<span class="${cls}">${esc(word)}</span>` : esc(word);
    } else out += esc(tok);
  }
  return out;
}

export const highlight = (code) => code.split('\n').map(highlightLine);

/**
 * Create an editor. Returns { el, getValue, setValue, setActiveLine, setErrorLine, setReadOnly }.
 * `onChange(code)` fires on every edit.
 */
export function createEditor({ value = '', readOnly = false, onChange = () => {} } = {}) {
  const el = document.createElement('div');
  el.className = 'kv-editor';
  el.innerHTML = '<div class="kv-gutter"></div><div class="kv-code"><pre class="kv-hl" aria-hidden="true"></pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Python code"></textarea></div>';
  const gutter = el.querySelector('.kv-gutter');
  const pre = el.querySelector('.kv-hl');
  const ta = el.querySelector('textarea');
  let active = null;
  let errorLine = null;

  function render() {
    const lines = highlight(ta.value);
    pre.innerHTML = lines.map((l, i) => `<div class="kv-line${i + 1 === active ? ' active' : ''}${i + 1 === errorLine ? ' error' : ''}">${l || ' '}</div>`).join('');
    gutter.innerHTML = lines.map((_, i) => `<div class="${i + 1 === active ? 'active' : ''}${i + 1 === errorLine ? ' error' : ''}">${i + 1}</div>`).join('');
  }

  ta.value = value;
  ta.readOnly = readOnly;
  el.classList.toggle('readonly', readOnly);
  ta.addEventListener('input', () => {
    errorLine = null;
    render();
    onChange(ta.value);
  });
  ta.addEventListener('scroll', () => {
    pre.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
    gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !readOnly) {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: t } = ta;
      ta.setRangeText('    ', s, t, 'end');
      ta.dispatchEvent(new Event('input'));
    } else if (e.key === 'Enter' && !readOnly) {
      // Keep the indentation of the current line, and indent after a colon.
      const s = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
      const line = ta.value.slice(lineStart, s);
      let indent = line.match(/^\s*/)[0];
      if (/:\s*$/.test(line)) indent += '    ';
      if (indent) {
        e.preventDefault();
        ta.setRangeText('\n' + indent, s, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input'));
      }
    }
  });
  render();

  return {
    el,
    textarea: ta,
    getValue: () => ta.value,
    setValue(v) {
      ta.value = v;
      render();
    },
    setActiveLine(n) {
      if (active === n) return;
      active = n;
      render();
      const lineEl = pre.children[n - 1];
      if (lineEl && (lineEl.offsetTop < ta.scrollTop || lineEl.offsetTop > ta.scrollTop + ta.clientHeight - 24)) ta.scrollTop = lineEl.offsetTop - 40;
    },
    setErrorLine(n) {
      errorLine = n;
      render();
    },
  };
}
