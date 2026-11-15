// GitHub publishing: approved notes are committed as Markdown files through the REST API.
// The token lives only in this browser's localStorage and is sent only to api.github.com.

const api = (s, path, init = {}) =>
  fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${s.ghToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });

const repoPath = (s) => `/repos/${encodeURIComponent(s.ghOwner)}/${encodeURIComponent(s.ghRepo)}`;
const encodePath = (p) => p.split('/').filter(Boolean).map(encodeURIComponent).join('/');

function base64(text) {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function fail(res, what) {
  let detail = '';
  try {
    detail = (await res.json()).message || '';
  } catch {
    /* no JSON body */
  }
  const hint =
    res.status === 401 ? 'The token was rejected.' :
    res.status === 403 ? 'The token lacks permission (it needs Contents: read and write).' :
    res.status === 404 ? 'Repository, branch or path not found — or the token cannot see it.' : '';
  throw new Error(`${what} failed (${res.status}). ${hint} ${detail}`.trim());
}

export async function testConnection(s) {
  const res = await api(s, repoPath(s));
  if (!res.ok) await fail(res, 'Connection test');
  const repo = await res.json();
  return { name: repo.full_name, private: repo.private, canPush: Boolean(repo.permissions?.push), defaultBranch: repo.default_branch };
}

/** Create or update one file. `relPath` is relative to the configured content folder. */
export async function publishFile(s, relPath, content, message) {
  const path = encodePath(`${s.ghDir || 'content'}/${relPath}`);
  const branch = s.ghBranch || 'main';
  const url = `${repoPath(s)}/contents/${path}`;

  let sha;
  const existing = await api(s, `${url}?ref=${encodeURIComponent(branch)}`);
  if (existing.ok) sha = (await existing.json()).sha;
  else if (existing.status !== 404) await fail(existing, 'Reading the existing file');

  const res = await api(s, url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: base64(content), branch, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) await fail(res, 'Publishing');
  const out = await res.json();
  return { url: out.content?.html_url, commit: out.commit?.sha, updated: Boolean(sha) };
}
