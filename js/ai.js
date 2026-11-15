// The Knowledge Architect's model access. Uses the official Anthropic SDK (bundled into
// vendor/anthropic-sdk.js) straight from the browser with the key the owner saved in Settings.

import { vault, currentUniverse } from './store.js';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Recommended' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Faster, lower cost' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Fastest, lowest cost' },
  { id: 'claude-fable-5-2', label: 'Claude Fable 5.2', note: 'Most capable' },
];
export const modelLabel = (id) => MODELS.find((m) => m.id === id)?.label || id;

// Models that support routing a declined request to another model on the server.
const SERVER_FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-2']);

let sdk;
const loadSdk = () => (sdk ??= import('../vendor/anthropic-sdk.js').then((m) => m.default));

const NOTE_OPEN = '<note>';
const NOTE_CLOSE = '</note>';

/** Split a (possibly still streaming) reply into chat text and the note it carries. */
export function splitReply(text) {
  const start = text.indexOf(NOTE_OPEN);
  if (start < 0) {
    // Hide a partially streamed opening tag such as "<no".
    const lt = text.lastIndexOf('<');
    const partialTag = lt >= 0 && NOTE_OPEN.startsWith(text.slice(lt));
    return { chat: (partialTag ? text.slice(0, lt) : text).trim(), note: null, complete: false };
  }
  const end = text.indexOf(NOTE_CLOSE, start);
  const note = text.slice(start + NOTE_OPEN.length, end < 0 ? undefined : end).trim();
  const after = end < 0 ? '' : text.slice(end + NOTE_CLOSE.length);
  return { chat: (text.slice(0, start) + after).trim(), note, complete: end >= 0 };
}

export function buildSystemPrompt(draft, draftMarkdown) {
  const universe = currentUniverse().name;
  const index = vault.notes
    .filter((n) => n.id !== draft.noteId)
    .map((n) => `- ${n.title} (${n.type}${n.category && n.type !== 'category' ? `, ${n.category}` : ''})`)
    .join('\n');

  return `You are the Knowledge Architect for ${vault.name}, a personal knowledge multiverse made of separate universes, one per subject. You are working in the "${universe}" universe. Each universe is an Obsidian-style vault: each note is a Markdown file with YAML frontmatter, notes link to each other with [[wikilinks]], and the whole universe is displayed as an interactive graph. You are working with the vault's owner inside a drafting workspace. They give you raw information — rough notes, pasted fragments, things they have learned or observed — and together you shape it into one clear, well-structured note. They review and approve every note before it is published, so your job is to produce a draft they can trust and easily edit.

## How to work

The owner is the source of truth. Build the note from what they tell you: organise it, tighten the wording, fix the structure, and surface what is implied. Don't pad the note with ${universe} facts they didn't supply, because this vault is their reference and study base and an unverified claim that slips in is worse than a gap. When something important seems missing or looks wrong, say so in your reply and ask. If they ask you to fill a gap from your own knowledge, do it, and tell them which parts came from you so they can verify them.

Ask only when the answer would change the note, and no more than a couple of focused questions at a time. If you have enough to draft, draft — a concrete draft is easier for them to react to than a list of questions.

Keep your chat replies short: what you changed and what, if anything, you need from them. The note carries the content; don't repeat it in the chat.

## The note

The universe is a hierarchy: one hub, then categories, then topics, then subtopics. Frontmatter fields:
- title: the note's name, also what other notes use to link to it
- type: category, topic or subtopic
- category: the name of the category this note belongs to
- parent: the exact title of the note directly above it (a category for a topic, a topic for a subtopic)
- description: one plain sentence saying what the note covers
- tags: a few lowercase keywords

The body starts at "##" headings; the title is rendered from the frontmatter, so don't add a "#" heading. Choose sections that suit the material rather than forcing a template — a concept note, a how-to and a troubleshooting note are shaped differently. Link to another note with [[Exact Title]] where a reader would genuinely want to jump there, using titles from the vault index below or notes the owner says they plan to write. Callouts (> [!note], > [!tip], > [!warning]), tables, task lists and fenced code blocks all render.

## Output format

Whenever the note should change, put the complete updated note — frontmatter and body — inside <note></note> tags at the end of your reply. Always send the whole note, never a fragment or diff: the workspace replaces the draft with exactly what is between the tags. When you are only discussing or asking a question, leave the tags out and the draft stays as it is.

<note>
---
title: Example Title
type: topic
category: Example Category
parent: Example Category
description: One sentence saying what this note covers.
tags: [example, keywords]
---

## First section

Content…
</note>

## Vault index

Existing notes you can link to:
${index || '(the vault is empty)'}

## Current draft

This is the draft as it stands right now, including any edits the owner made by hand since your last reply:

${draftMarkdown}`;
}

/** Turn stored chat history into API messages: text only, strictly alternating, starting with the user. */
export function toApiMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.error || m.offline) continue;
    let content = m.content;
    if (m.role === 'assistant') {
      const { chat, note } = splitReply(content);
      content = [chat, note != null && '[You updated the draft note here. Its current version is in the system prompt.]'].filter(Boolean).join('\n\n');
    }
    if (!content.trim()) continue;
    if (out.length && out.at(-1).role === m.role) out.at(-1).content += '\n\n' + content;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

/**
 * Stream one Architect turn. Calls onText with each text delta and resolves with the full reply text.
 * Throws an Error with a user-readable message on failure.
 */
export async function streamArchitect({ settings, system, messages, onText, signal }) {
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey: settings.aiKey, dangerouslyAllowBrowser: true });
  const model = settings.aiModel || 'claude-opus-5-5';
  const params = {
    model,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { effort: settings.aiEffort || 'medium' },
    system,
    messages,
  };

  try {
    const stream = SERVER_FALLBACK.has(model)
      ? client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal })
      : client.messages.stream(params, { signal });
    stream.on('text', onText);
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new Error('The model declined this request. Try rephrasing, or switch model in Settings.');
    }
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { text, truncated: message.stop_reason === 'max_tokens' };
  } catch (err) {
    if (signal?.aborted || err instanceof Anthropic.APIUserAbortError) {
      const abort = new Error('Stopped');
      abort.aborted = true;
      throw abort;
    }
    if (err instanceof Anthropic.AuthenticationError) throw new Error('The API key was rejected. Check it in Settings.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error(`This API key cannot use ${modelLabel(model)}. Pick another model in Settings.`);
    if (err instanceof Anthropic.NotFoundError) throw new Error(`Model "${model}" was not found for this API key. Pick another model in Settings.`);
    if (err instanceof Anthropic.RateLimitError) throw new Error('Rate limit reached. Wait a moment and send again.');
    if (err instanceof Anthropic.APIConnectionError) throw new Error('Could not reach the Anthropic API. Check your connection and try again.');
    if (err instanceof Anthropic.APIError) throw new Error(`The API returned an error (${err.status ?? 'unknown'}): ${err.message}`);
    throw err;
  }
}

/**
 * Stand-in used when no API key is configured, so the whole workflow can be tried.
 * It does not rewrite anything — it only files the owner's text into a skeleton.
 */
export function offlineArchitect(draft, text) {
  const lines = text.split(/\n+/).map((l) => l.replace(/^[\s\-*•\d.)]+/, '').trim()).filter(Boolean);
  const bullets = lines.map((l) => `- ${l}`).join('\n');
  let body = draft.body.trim();
  if (!body) {
    body = `## Description\n\n${lines[0] || 'Description'}\n\n## Notes\n\n${bullets}\n\n## Open questions\n\n- [ ] What is still missing from this note?`;
  } else if (/^## Notes\s*$/m.test(body)) {
    body = body.replace(/(^## Notes\s*\n(?:(?!^## ).*\n?)*)/m, (section) => section.trimEnd() + '\n' + bullets + '\n\n');
  } else {
    body += `\n\n## Notes\n\n${bullets}`;
  }
  const untitled = !draft.title || draft.title === 'Untitled note';
  return {
    reply:
      '**Offline demo mode.** No API key is configured, so I only filed your message into the draft\'s Notes section without rewriting or structuring it. Add an Anthropic API key in **Settings** to work with the real Architect.',
    fields: {
      title: untitled ? (lines[0] || 'Untitled note').split(/\s+/).slice(0, 6).join(' ').replace(/[.:;,]+$/, '') : draft.title,
      body: body.trim(),
    },
  };
}
