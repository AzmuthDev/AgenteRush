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
