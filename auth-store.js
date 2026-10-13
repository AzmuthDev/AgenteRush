const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

// Hashing both sides yields fixed-length digests, so timingSafeEqual never
// sees mismatched lengths and the comparison time does not leak the password length.
function checkPassword(candidate, expected) {
  if (typeof candidate !== 'string' || typeof expected !== 'string') {
    return false;
  }
  return crypto.timingSafeEqual(sha256(candidate), sha256(expected));
}

function createSessionStore({ ttlMs = DEFAULT_TTL_MS, now = Date.now } = {}) {
  const sessions = new Map();

  function createSession() {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, now() + ttlMs);
    return token;
  }

  function validateSession(token) {
    const expiresAt = sessions.get(token);
    if (expiresAt === undefined) {
      return false;
    }
    if (now() >= expiresAt) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  function revokeSession(token) {
    sessions.delete(token);
  }

  return { createSession, validateSession, revokeSession };
}

module.exports = { createSessionStore, checkPassword };
