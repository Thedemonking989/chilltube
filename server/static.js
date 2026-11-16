'use strict';

// Serves the site itself: flat files at the repo root plus one folder per page.
// Responses are uncached so edits to the source show up on the next load.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2'
};

// The shipped HTML used to link /theme.css while the file is themes.css.
const ALIASES = new Map([['/theme.css', '/themes.css']]);

const BLOCKED = ['/server', '/.data'];

function resolveFile(pathname) {
  for (const prefix of BLOCKED) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return null;
  }

  const normalized = ALIASES.get(pathname) || pathname;
  const candidate = path.resolve(ROOT, `.${normalized}`);
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return null;

  const candidates = [candidate];
  if (!path.extname(candidate)) {
    candidates.push(path.join(candidate, 'index.html'));
    candidates.push(`${candidate}.html`);
  }

  for (const file of candidates) {
    try {
      const stats = fs.statSync(file);
      if (stats.isDirectory()) {
        const index = path.join(file, 'index.html');
        if (fs.existsSync(index)) return index;
        continue;
      }
      if (stats.isFile()) return file;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

function notFound(res) {
  const body = [
    '<!doctype html><meta charset="utf-8"><title>Not found</title>',
    '<style>body{font-family:Arial,Helvetica,sans-serif;text-align:center;padding:60px}</style>',
    '<h1>404</h1><p>That page does not exist.</p><p><a href="/">Back to YouChill</a></p>'
  ].join('');
  res.writeHead(404, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Method not allowed');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad request');
  }

  const file = resolveFile(pathname);
  if (!file) return notFound(res);

  let body;
  try {
    body = fs.readFileSync(file);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Could not read that file');
  }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  if (req.method === 'HEAD') return res.end();
  return res.end(body);
}

module.exports = { serveStatic };
