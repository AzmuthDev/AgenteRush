# Reskin + Painel Admin para Config do Instagram Bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Tânios edit the Instagram comment-trigger word and DM reply message from a password-protected `/admin` page in Rush_verso, consumed live by the n8n workflow, and refine the site's visual polish without changing its synth-terminal identity.

**Architecture:** A new `config-store.js` module persists `{ triggerWord, dmMessage }` to `data/instagram-config.json` on disk. `server.js` (plain Node `http`, no framework) grows five routes: a public API-key-gated read for n8n, and four cookie-session-gated admin routes backed by a new `auth-store.js` in-memory session module. A static `admin.html` + `js/admin.js` give Tânios the login/edit UI. The n8n workflow `Instagram Bot - Comentário para DM` (`b6OQ8092uERKTaoD`) gets a new HTTP Request node that fetches this config on every incoming comment, replacing its two hardcoded values. CSS/markup cleanup in `index.html`/`css/style.css` is independent of the backend work.

**Tech Stack:** Node.js 20 built-ins only (`http`, `fs`, `crypto`, `path`) — no new npm dependencies, matching the existing Dockerfile which never runs `npm install`. Tests use Node's built-in `node:test` + `node:assert/strict` + global `fetch`. n8n changes via the `update_workflow` / `get_workflow_details` / `list_credentials` / `execute_workflow` MCP tools already granted access to workflow `b6OQ8092uERKTaoD`.

**Spec:** [docs/superpowers/specs/2026-10-13-reskin-admin-instagram-config-design.md](../specs/2026-10-13-reskin-admin-instagram-config-design.md)

## Global Constraints

- No new npm dependencies — Node built-ins only (Dockerfile has no `npm install` step).
- `ADMIN_PASSWORD` and `INSTAGRAM_CONFIG_API_KEY` are read from environment variables, never hardcoded, never logged, never echoed back in any response body.
- Admin session cookie `rush_admin_session` is `HttpOnly`, `SameSite=Strict`, `Path=/`, and `Secure` when `NODE_ENV=production`.
- `data/` (the config JSON file's directory) must be excluded from git and documented as needing a persistent volume in Coolify at `/app/data`.
- The synth-terminal 2112 visual identity (starfield, VU meters, red/gold/cyan palette, audio engine) is preserved and refined, not replaced.
- No link to `/admin` appears anywhere in the public-facing pages.
- The n8n workflow's Facebook Graph API tokens (already present in node parameters) are left untouched — out of scope, already flagged to the stakeholder separately.

## Review Focus

- A DM message saved with a `"` or newline in it must not corrupt the JSON body `Enviar_DM` sends to the Graph API — the n8n expression must `JSON.stringify()` the value, not interpolate it raw into a hand-written JSON template. (Task 6)
- `ADMIN_PASSWORD` or `INSTAGRAM_CONFIG_API_KEY` left unset in the deployment must fail closed (503 on the routes that need it), never silently accept any password or any/no API key. (Task 3)
- A session cookie must stop working immediately after `/api/admin/logout` — reusing the old cookie value must return 401, not a stale-but-valid session. (Task 3)
- An empty or whitespace-only `triggerWord`/`dmMessage` submitted to the admin API must be rejected server-side with 400, independent of whatever the admin UI's own form validation does. (Task 1, Task 3)
- A malformed or missing JSON body on `POST /api/admin/login` or `POST /api/admin/instagram-config` must return 400, not crash the request handler or hang the connection. (Task 3)

---

## Task 1: Instagram config store

**Files:**
- Create: `config-store.js`
- Test: `test/config-store.test.js`

**Interfaces:**
- Produces: `createConfigStore(filePath: string) -> { read(): Promise<{triggerWord: string, dmMessage: string, updatedAt: string}>, write({triggerWord, dmMessage}): Promise<{triggerWord, dmMessage, updatedAt}> }`
- Produces: `DEFAULT_CONFIG = { triggerWord: 'portal', dmMessage: 'Olá! Vi seu comentário no post. Acesse o link aqui: https://portalrushbrasil.com.br' }`
- `write()` rejects with `new Error('INVALID_CONFIG')` when `triggerWord` or `dmMessage`, after `.trim()`, is an empty string.
- `read()` creates the file (and parent directory) seeded with `DEFAULT_CONFIG` plus `updatedAt: new Date().toISOString()` the first time it's called against a path that doesn't exist yet.

- [ ] **Step 1: Write the failing tests**

```js
// test/config-store.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createConfigStore, DEFAULT_CONFIG } = require('../config-store.js');

function tempPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rush-config-')), 'instagram-config.json');
}

test('read() seeds default config when file does not exist', async () => {
  const store = createConfigStore(tempPath());
  const config = await store.read();
  assert.equal(config.triggerWord, DEFAULT_CONFIG.triggerWord);
  assert.equal(config.dmMessage, DEFAULT_CONFIG.dmMessage);
  assert.ok(config.updatedAt);
});

test('write() then read() round-trips trimmed values and bumps updatedAt', async () => {
  const store = createConfigStore(tempPath());
  const written = await store.write({ triggerWord: '  novapalavra  ', dmMessage: '  Oi! ' });
  assert.equal(written.triggerWord, 'novapalavra');
  assert.equal(written.dmMessage, 'Oi!');
  const read = await store.read();
  assert.equal(read.triggerWord, 'novapalavra');
  assert.equal(read.dmMessage, 'Oi!');
});

test('write() rejects an empty triggerWord', async () => {
  const store = createConfigStore(tempPath());
  await assert.rejects(() => store.write({ triggerWord: '   ', dmMessage: 'ok' }), /INVALID_CONFIG/);
});

test('write() rejects an empty dmMessage', async () => {
  const store = createConfigStore(tempPath());
  await assert.rejects(() => store.write({ triggerWord: 'ok', dmMessage: '' }), /INVALID_CONFIG/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/config-store.test.js`
Expected: FAIL — `Cannot find module '../config-store.js'`

- [ ] **Step 3: Implement `config-store.js`**

Implement `createConfigStore(filePath)` and `DEFAULT_CONFIG` per the Interfaces block above, using `fs.promises` (`mkdir(..., {recursive: true})`, `readFile`, `writeFile`) and `JSON.parse`/`JSON.stringify`. `read()` catches the file-not-found error specifically (`err.code === 'ENOENT'`) and seeds the default; any other read/parse error propagates.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/config-store.test.js`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add config-store.js test/config-store.test.js
git commit -m "feat: add Instagram config store with JSON file persistence"
```

---

## Task 2: Admin session store

**Files:**
- Create: `auth-store.js`
- Test: `test/auth-store.test.js`

**Interfaces:**
- Produces: `createSessionStore({ ttlMs?: number, now?: () => number }) -> { createSession(): string, validateSession(token: string): boolean, revokeSession(token: string): void }`
- Produces: `checkPassword(candidate: string, expected: string): boolean` — constant-time comparison via SHA-256 digest + `crypto.timingSafeEqual`, returns `false` (never throws) for non-string input or mismatched lengths.
- `createSession()` returns a 64-character lowercase hex string (`crypto.randomBytes(32).toString('hex')`).

- [ ] **Step 1: Write the failing tests**

```js
// test/auth-store.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSessionStore, checkPassword } = require('../auth-store.js');

test('createSession returns a 64-char hex token that validates immediately', () => {
  const store = createSessionStore({});
  const token = store.createSession();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(store.validateSession(token), true);
});

test('validateSession returns false for an unknown token', () => {
  const store = createSessionStore({});
  assert.equal(store.validateSession('not-a-real-token'), false);
});

test('validateSession returns false once the token expires', () => {
  let fakeNow = 1000;
  const store = createSessionStore({ ttlMs: 500, now: () => fakeNow });
  const token = store.createSession();
  fakeNow += 1000;
  assert.equal(store.validateSession(token), false);
});

test('revokeSession invalidates a previously valid token', () => {
  const store = createSessionStore({});
  const token = store.createSession();
  store.revokeSession(token);
  assert.equal(store.validateSession(token), false);
});

test('checkPassword matches only the exact expected string', () => {
  assert.equal(checkPassword('senha-certa', 'senha-certa'), true);
  assert.equal(checkPassword('senha-errada', 'senha-certa'), false);
});

test('checkPassword returns false (not throw) for mismatched lengths or non-strings', () => {
  assert.equal(checkPassword('a', 'muito-mais-longa'), false);
  assert.equal(checkPassword(undefined, 'senha-certa'), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/auth-store.test.js`
Expected: FAIL — `Cannot find module '../auth-store.js'`

- [ ] **Step 3: Implement `auth-store.js`**

Implement per the Interfaces block. `createSessionStore` keeps a `Map<token, expiresAtMs>` closed over the factory call; `validateSession` must also delete the entry if it's found but expired (lazy cleanup), not just return false.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/auth-store.test.js`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add auth-store.js test/auth-store.test.js
git commit -m "feat: add admin session store with constant-time password check"
```

---

## Task 3: Server routes for config + admin auth

**Files:**
- Modify: `server.js`
- Test: `test/server.test.js`
- Modify: `README.md`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createConfigStore` from `config-store.js` (Task 1); `createSessionStore`, `checkPassword` from `auth-store.js` (Task 2).
- Produces (HTTP contract, all JSON unless noted):
  - `GET /api/instagram-config` — header `x-api-key` must equal `process.env.INSTAGRAM_CONFIG_API_KEY` (read at request time). Missing env var → 503. Missing/wrong header → 401. Match → 200 `{ triggerWord, dmMessage }`.
  - `POST /api/admin/login` — body `{ password }`. Missing env var `ADMIN_PASSWORD` → 503. Malformed JSON body → 400. Wrong password → 401 `{ error: "invalid_password" }`. Correct → 200 `{ ok: true }` + `Set-Cookie: rush_admin_session=<token>; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200` (append `; Secure` when `process.env.NODE_ENV === 'production'`).
  - `POST /api/admin/logout` — reads `rush_admin_session` cookie, revokes it if present, responds 200 `{ ok: true }`, and sets the cookie with `Max-Age=0` to clear it client-side.
  - `GET /api/admin/instagram-config` — valid session cookie required, else 401. Valid → 200 full config including `updatedAt`.
  - `POST /api/admin/instagram-config` — valid session cookie required, else 401. Body `{ triggerWord, dmMessage }`; malformed JSON → 400; empty/whitespace-only fields → 400 `{ error: "invalid_input" }`; otherwise persists via `configStore.write()` and returns 200 with the new config.
  - `GET /admin` — serves `admin.html` from disk the same way the existing static handler serves other files (no auth at the HTTP-GET-the-HTML level; the page itself calls the authed JSON endpoints).
- Produces: `module.exports = { server, PORT }`; the `server.listen(...)` call only runs when `require.main === module`, so tests can `require('../server.js')` without binding the real port.
- Config file location: `path.join(process.env.RUSH_DATA_DIR || __dirname, 'data', 'instagram-config.json')`, so tests can redirect it via `RUSH_DATA_DIR`.

- [ ] **Step 1: Write the failing tests**

```js
// test/server.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.RUSH_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-server-'));
process.env.ADMIN_PASSWORD = 'correct-horse-battery';
process.env.INSTAGRAM_CONFIG_API_KEY = 'n8n-shared-key';

const { server } = require('../server.js');
let baseUrl;

before(() => new Promise((resolve) => {
  server.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

after(() => new Promise((resolve) => server.close(resolve)));

test('GET /api/instagram-config without key is 401; with key is 200 with defaults', async () => {
  const noKey = await fetch(`${baseUrl}/api/instagram-config`);
  assert.equal(noKey.status, 401);

  const withKey = await fetch(`${baseUrl}/api/instagram-config`, {
    headers: { 'x-api-key': 'n8n-shared-key' }
  });
  assert.equal(withKey.status, 200);
  const body = await withKey.json();
  assert.equal(body.triggerWord, 'portal');
});

test('login rejects wrong password and accepts the right one with a session cookie', async () => {
  const wrong = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'nope' })
  });
  assert.equal(wrong.status, 401);

  const right = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'correct-horse-battery' })
  });
  assert.equal(right.status, 200);
  assert.match(right.headers.get('set-cookie') || '', /rush_admin_session=/);
});

test('admin config GET/POST require a valid session; reject empty fields; logout revokes it', async () => {
  const unauth = await fetch(`${baseUrl}/api/admin/instagram-config`);
  assert.equal(unauth.status, 401);

  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'correct-horse-battery' })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const badSave = await fetch(`${baseUrl}/api/admin/instagram-config`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ triggerWord: '   ', dmMessage: 'oi' })
  });
  assert.equal(badSave.status, 400);

  const goodSave = await fetch(`${baseUrl}/api/admin/instagram-config`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ triggerWord: 'novapalavra', dmMessage: 'Nova mensagem' })
  });
  assert.equal(goodSave.status, 200);

  const publicRead = await fetch(`${baseUrl}/api/instagram-config`, {
    headers: { 'x-api-key': 'n8n-shared-key' }
  });
  assert.equal((await publicRead.json()).triggerWord, 'novapalavra');

  await fetch(`${baseUrl}/api/admin/logout`, { method: 'POST', headers: { Cookie: cookie } });
  const afterLogout = await fetch(`${baseUrl}/api/admin/instagram-config`, { headers: { Cookie: cookie } });
  assert.equal(afterLogout.status, 401);
});

test('malformed JSON body on login returns 400, not a crash', async () => {
  const res = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json'
  });
  assert.equal(res.status, 400);
});

test('routes fail closed with 503 when their required env var is unset', async () => {
  const savedKey = process.env.INSTAGRAM_CONFIG_API_KEY;
  delete process.env.INSTAGRAM_CONFIG_API_KEY;
  const noKeyConfigured = await fetch(`${baseUrl}/api/instagram-config`, {
    headers: { 'x-api-key': 'anything' }
  });
  assert.equal(noKeyConfigured.status, 503);
  process.env.INSTAGRAM_CONFIG_API_KEY = savedKey;

  const savedPassword = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  const noPasswordConfigured = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'anything' })
  });
  assert.equal(noPasswordConfigured.status, 503);
  process.env.ADMIN_PASSWORD = savedPassword;
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/server.test.js`
Expected: FAIL (routes don't exist yet — 404s instead of the expected statuses)

- [ ] **Step 3: Implement the routes in `server.js`**

Add near the top: `const { createConfigStore } = require('./config-store.js');`, `const { createSessionStore, checkPassword } = require('./auth-store.js');`, instantiate `const configStore = createConfigStore(path.join(process.env.RUSH_DATA_DIR || __dirname, 'data', 'instagram-config.json'));` and `const sessionStore = createSessionStore();`.

Add a local `readJsonBody(req)` helper (returns a `Promise` that resolves to the parsed object or rejects on invalid JSON) and a `parseCookies(req)` helper (splits `req.headers.cookie` on `;`/`=`), then wire the five routes described in the Interfaces block ahead of the existing static-file fallback. Wrap each handler's body-parsing/write calls in `try/catch` so a parse or validation failure responds with the documented status instead of throwing. At the bottom, replace the unconditional `server.listen(...)` block with:

```js
module.exports = { server, PORT };

if (require.main === module) {
  server.listen(PORT, () => { /* existing console.log block */ });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/server.test.js`
Expected: PASS (5/5)

- [ ] **Step 5: Add the test script, gitignore the data dir, and document the new env vars**

In `package.json`, add `"test": "node --test test/"` to `scripts`. In `.gitignore`, add a `data/` line. In `README.md`, add a section documenting `ADMIN_PASSWORD`, `INSTAGRAM_CONFIG_API_KEY`, and that `/app/data` must be a persistent Coolify volume or the saved trigger word/message reset on every redeploy.

- [ ] **Step 6: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS (all tests across Task 1–3)

- [ ] **Step 7: Commit**

```bash
git add server.js package.json .gitignore README.md test/server.test.js
git commit -m "feat: add admin auth and Instagram config API routes to server.js"
```

---

## Task 4: Admin UI page

**Files:**
- Create: `admin.html`
- Create: `js/admin.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `GET /api/admin/instagram-config`, `POST /api/admin/login`, `POST /api/admin/instagram-config`, `POST /api/admin/logout` (Task 3).
- No exports consumed by later tasks.

- [ ] **Step 1: Build `admin.html`**

A minimal page reusing `css/style.css` (link the same stylesheet) with two sections toggled by `js/admin.js`: a `#login-view` (password `<input type="password">` + submit button + `#login-error` message area) and a `#config-view` (`#trigger-word` text input, `#dm-message` textarea, save button, `#save-status` message area, logout button). Both sections share the existing `.modal-card`-style visual language (dark panel, red accent border) rather than introducing a new component language. Link `css/style.css` and `js/admin.js?v=2112`.

- [ ] **Step 2: Implement `js/admin.js`**

On `DOMContentLoaded`: call `GET /api/admin/instagram-config`; show `#config-view` pre-filled on 200, show `#login-view` on 401. Wire the login form's submit to `POST /api/admin/login` (on success, re-run the same config fetch-and-show; on 401, set `#login-error` text to "Senha incorreta"). Wire the save button to `POST /api/admin/instagram-config` with the two field values (on 200, set `#save-status` to "Salvo às " + current time; on 400, show the validation error). Wire the logout button to `POST /api/admin/logout` then show `#login-view`.

- [ ] **Step 3: Add admin-specific styles to `css/style.css`**

Add an `.admin-shell`/`.admin-card` block reusing existing CSS custom properties (`--bg-panel`, `--border-glow`, `--star-red`, etc.) so the page matches the terminal aesthetic without duplicating color values.

- [ ] **Step 4: Manual verification in the browser**

Start the app with `preview_start`, navigate to `/admin`. Confirm: wrong password shows the error and does not reveal the config form; correct password shows the form with the current `triggerWord`/`dmMessage`; saving new values and reloading the page shows the new values persisted; logout returns to the login form.

- [ ] **Step 5: Commit**

```bash
git add admin.html js/admin.js css/style.css
git commit -m "feat: add admin page for editing Instagram trigger word and DM message"
```

---

## Task 5: Visual reskin of the public chat

**Files:**
- Modify: `css/style.css`
- Modify: `index.html`

**Interfaces:** None — purely presentational, no consumers.

- [ ] **Step 1: Remove dead CSS and the unused font**

In `css/style.css`: drop `Cinzel` from the `@import` URL (keep `Orbitron`, `Rajdhani`, `Space Grotesk`, `JetBrains Mono`). Delete the rule blocks for `.terminal-sidebar`, `.sidebar-title`, `.sidebar-scrollable`, `.preset-section`, `.preset-category-label`, `.prompt-card*`, `.sidebar-footer`, `.lyrics-quote-box`, `.lyrics-author` — none have a matching element in `index.html`.

- [ ] **Step 2: Tone down the scanline overlay and tidy mobile header spacing**

Reduce `.scanline-overlay`'s `opacity` (currently `0.7`) to `0.35` and lower the two gradient layers' alpha values proportionally. In the `@media (max-width: 900px)` block, verify `.header-actions` buttons don't overlap the brand title at 360px width (add `flex-wrap: wrap` or reduce `.btn-icon` size at that breakpoint if they do), and check `.welcome-hero` at that width: reduce `.hero-starman` size and `.hero-title` font-size there if they crowd the `.hero-pills` row.

- [ ] **Step 3: Improve long-message readability**

In `.message-bubble`, increase the margin between consecutive markdown blocks (`p + p`, `p + h3`, etc.) slightly beyond the current flat `10px`, and raise `blockquote`'s background/border contrast a touch so quoted Rush lyrics stand out against long answers without looking like an error state.

- [ ] **Step 4: Add the Portal Rush Brasil credit link**

In `index.html`, add a small `<footer class="footer-credit">` after `.input-dock` (inside `.chat-workspace`, below the existing structure) with a link: `<a href="https://portalrushbrasil.com.br/" target="_blank" rel="noopener">Portal Rush Brasil</a>`. Style `.footer-credit` in `css/style.css` to sit quietly (small, muted color, centered) and not compete with the input dock.

- [ ] **Step 5: Manual verification in the browser**

Start the app with `preview_start`. At desktop width: confirm no visual regression in header, chat bubbles, welcome hero, input dock, and that the footer credit link is visible and opens the blog in a new tab. Emulate mobile width (375px) and confirm the header and welcome hero no longer overlap/crowd and the layout has no horizontal scroll.

- [ ] **Step 6: Commit**

```bash
git add css/style.css index.html
git commit -m "style: refine typography, remove dead CSS, add Portal Rush Brasil credit"
```

---

## Task 6: Wire dynamic config into the n8n Instagram workflow

**Files:**
- Create: `docs/superpowers/specs/n8n-workflow-backup-b6OQ8092uERKTaoD.json` (snapshot for rollback)
- No repo code changes beyond the backup file — the live change is applied directly to the n8n workflow via MCP tools.

**Interfaces:**
- Consumes: the deployed `GET /api/instagram-config` endpoint from Task 3, live at `https://agenterush.portalrushzine.com/api/instagram-config`.

- [ ] **Step 1: Snapshot the current workflow for rollback**

Call `get_workflow_details` (workflowId `b6OQ8092uERKTaoD`, `detailLevel: "full"`) and save the `workflow` object verbatim to `docs/superpowers/specs/n8n-workflow-backup-b6OQ8092uERKTaoD.json`. Commit it alone first:

```bash
git add docs/superpowers/specs/n8n-workflow-backup-b6OQ8092uERKTaoD.json
git commit -m "docs: snapshot Instagram bot workflow before dynamic-config rewire"
```

- [ ] **Step 2: Get the user to create a Header Auth credential in n8n**

Ask the user (or Tânios) to create an n8n credential of type **Header Auth** — name suggestion "Rush Verso Config API Key" — with header name `X-Api-Key` and value equal to whatever they set `INSTAGRAM_CONFIG_API_KEY` to in the Coolify environment variables for the Rush_verso service. This keeps the key out of the workflow's plain node parameters (the same mistake already present elsewhere in this workflow with the Facebook tokens — not repeating it here). Wait for confirmation it's created.

- [ ] **Step 3: Find the credential's id**

Call `list_credentials` and locate the credential by the name used in Step 2; note its `id` for Step 4.

- [ ] **Step 4: Apply the atomic workflow update**

Call `update_workflow` with `workflowId: "b6OQ8092uERKTaoD"` and `versionName: "Config dinâmica via Rush_verso"`, with this `operations` array (in order):

1. `addNode` — name `Config_RushVerso`, type `n8n-nodes-base.httpRequest`, typeVersion `4.5`, position `[-1060, 560]`, parameters `{ url: "https://agenterush.portalrushzine.com/api/instagram-config", authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", options: {} }`.
2. `setNodeCredential` — nodeName `Config_RushVerso`, credentialName `httpHeaderAuth`, credentialId from Step 3.
3. `removeConnection` — source `Webhook_Instagram`, target `Validar_Comentário`.
4. `addConnection` — source `Webhook_Instagram`, target `Config_RushVerso`.
5. `addConnection` — source `Config_RushVerso`, target `Validar_Comentário`.
6. `setNodeParameter` — nodeName `Validar_Comentário`, path `/conditions/conditions/2/rightValue`, value `={{ $('Config_RushVerso').item.json.triggerWord.toLowerCase().trim() }}`.
7. `setNodeParameter` — nodeName `Enviar_DM`, path `/jsonBody`, value:
   ```
   ={{ JSON.stringify({ recipient: { comment_id: $json.body.entry[0].changes[0].value.id }, message: { text: $('Config_RushVerso').item.json.dmMessage } }) }}
   ```
   (building the whole body with `JSON.stringify` in the expression, rather than hand-written JSON text with an interpolated value, so a `dmMessage` containing `"` or newlines can't break the request.)

- [ ] **Step 5: Validate the result**

Call `get_workflow_details` again (detailLevel `full`) and confirm: `Config_RushVerso` exists with the credential attached; `Webhook_Instagram` connects only to `Config_RushVerso`; `Config_RushVerso` connects to `Validar_Comentário`; the two `setNodeParameter` values match what was sent.

- [ ] **Step 6: Safe dry run without a live Facebook call**

Call `update_workflow` with a single `setNodeDisabled` operation (nodeName `Enviar_DM`, disabled `true`). Then call `execute_workflow` (workflowId `b6OQ8092uERKTaoD`, executionMode `manual`, triggerNodeName `Webhook_Instagram`, inputs matching a synthetic comment payload: `webhookData.body` shaped like `{ entry: [{ id: "page-id", changes: [{ field: "comments", value: { id: "comment-id", text: "<current triggerWord>", from: { id: "someone-else-id" } } }] }] }`). Confirm the execution shows `Config_RushVerso` returning the live config and `Validar_Comentário` evaluating to true. Then call `update_workflow` again with `setNodeDisabled` (nodeName `Enviar_DM`, disabled `false`) to restore it.

- [ ] **Step 7: Confirm with the user before leaving it live**

Report the validated change and ask the user to confirm the workflow should stay active as updated (it already is, since `update_workflow` edits the live workflow directly) — this is a production automation change, so get an explicit go-ahead before considering the task done, not just before starting it.
