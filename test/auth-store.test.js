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
