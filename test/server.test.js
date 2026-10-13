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

test('a malformed Cookie header does not crash the server (unauthenticated DoS regression)', async () => {
  // A deliberately malformed %-escape sequence (truncated) used to throw an
  // uncaught URIError from decodeURIComponent inside parseCookies, killing
  // the whole process. Any route that reads cookies is affected; logout is
  // exercised here.
  const res = await fetch(`${baseUrl}/api/admin/logout`, {
    method: 'POST',
    headers: { Cookie: 'foo=%E0%A4%A' }
  });
  assert.equal(res.status, 200);

  // Also hits the GET route that reads the session cookie via requireValidSession.
  const res2 = await fetch(`${baseUrl}/api/admin/instagram-config`, {
    headers: { Cookie: 'rush_admin_session=abc; bad=%E0%A4%A' }
  });
  assert.equal(res2.status, 401);

  // Prove the server process is still alive and serving normal requests.
  const followUp = await fetch(`${baseUrl}/api/instagram-config`, {
    headers: { 'x-api-key': 'n8n-shared-key' }
  });
  assert.equal(followUp.status, 200);
});

test('GET /data/* is blocked, so the raw config file cannot bypass the API-key gate', async () => {
  const dataDir = path.join(__dirname, '..', 'data');
  const configFilePath = path.join(dataDir, 'instagram-config.json');
  await fs.promises.mkdir(dataDir, { recursive: true });

  let backup = null;
  try {
    backup = await fs.promises.readFile(configFilePath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const marker = JSON.stringify({ triggerWord: 'LEAKED_MARKER_VALUE', dmMessage: 'leak' });
  await fs.promises.writeFile(configFilePath, marker, 'utf8');

  try {
    const res = await fetch(`${baseUrl}/data/instagram-config.json`);
    assert.notEqual(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes('LEAKED_MARKER_VALUE'));
  } finally {
    if (backup === null) {
      await fs.promises.rm(configFilePath, { force: true });
    } else {
      await fs.promises.writeFile(configFilePath, backup, 'utf8');
    }
  }
});
