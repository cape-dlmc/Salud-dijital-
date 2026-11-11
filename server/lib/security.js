const crypto = require('crypto');
const config = require('../config');

// ---------- Contraseñas (scrypt, incluido en Node.js, sin dependencias) ----------
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, KEYLEN, SCRYPT).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function isHashed(value) {
  return typeof value === 'string' && value.startsWith('scrypt$');
}

function verifyPassword(pw, stored) {
  if (!isHashed(stored)) return false;
  const [, salt, hash] = stored.split('$');
  const test = crypto.scryptSync(String(pw), salt, KEYLEN, SCRYPT);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === test.length && crypto.timingSafeEqual(expected, test);
}

// Contraseña temporal legible para reseteos
function generateTempPassword() {
  return crypto.randomBytes(9).toString('base64url') + '#7';
}

// ---------- Sesiones con token opaco (en memoria) ----------
const sessions = new Map(); // token -> { userId, expires }

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expires: Date.now() + config.SESSION_TTL_MS });
  return { token, expires: sessions.get(token).expires };
}

function getSession(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  s.expires = Date.now() + config.SESSION_TTL_MS; // renovación por actividad
  return s;
}

function destroySession(token) {
  sessions.delete(token);
}

function destroyUserSessions(userId) {
  for (const [token, s] of sessions) {
    if (s.userId === userId) sessions.delete(token);
  }
}

// ---------- Bloqueo por intentos fallidos ----------
const failedLogins = new Map(); // username -> { count, lockedUntil }

function isLocked(username) {
  const f = failedLogins.get(username);
  return !!(f && f.lockedUntil && f.lockedUntil > Date.now());
}

function registerFailure(username) {
  const f = failedLogins.get(username) || { count: 0, lockedUntil: 0 };
  f.count += 1;
  if (f.count >= config.MAX_LOGIN_ATTEMPTS) {
    f.lockedUntil = Date.now() + config.LOGIN_LOCK_MS;
    f.count = 0;
  }
  failedLogins.set(username, f);
}

function clearFailures(username) {
  failedLogins.delete(username);
}

module.exports = {
  hashPassword, isHashed, verifyPassword, generateTempPassword,
  createSession, getSession, destroySession, destroyUserSessions,
  isLocked, registerFailure, clearFailures
};
