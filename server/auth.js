'use strict';

// Password hashing and stateless session cookies (HMAC signed). The signing key
// is generated once and kept in the data directory so sessions survive restarts.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const COOKIE = 'yc_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

let cachedSecret = null;

function secret() {
  if (cachedSecret) return cachedSecret;
  const file = path.join(store.DATA_DIR, 'session.key');
  try {
    cachedSecret = fs.readFileSync(file, 'utf8').trim();
  } catch {
    cachedSecret = '';
  }
  if (!cachedSecret) {
    cachedSecret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function signToken(userId) {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + SESSION_MS })
  ).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

function readToken(token) {
  const [payload, mac] = String(token || '').split('.');
  if (!payload || !mac) return null;
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  const given = Buffer.from(mac);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data.uid : null;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function currentUser(req) {
  const userId = readToken(parseCookies(req)[COOKIE]);
  return userId ? store.findUserById(userId) : null;
}

function sessionCookie(userId) {
  const maxAge = Math.floor(SESSION_MS / 1000);
  return `${COOKIE}=${signToken(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

module.exports = {
  hashPassword,
  verifyPassword,
  currentUser,
  sessionCookie,
  clearCookie
};
