#!/usr/bin/env node
'use strict';

// YouChill application server: static pages plus the JSON API.

const http = require('http');
const path = require('path');
const { handleApi } = require('./api');
const { serveStatic } = require('./static');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad request');
  }

  try {
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    console.error('[youchill] request failed:', req.method, url.pathname, error);
    if (res.headersSent) {
      res.end();
      return;
    }
    const status = error.status || 500;
    const body = JSON.stringify({ error: status === 500 ? 'Server error' : error.message });
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[youchill] listening on http://${HOST}:${PORT}`);
  console.log(`[youchill] source root: ${path.resolve(__dirname, '..')}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
