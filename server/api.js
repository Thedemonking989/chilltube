'use strict';

// JSON API: accounts, video upload + streaming, likes, comments, chat.

const fs = require('fs');
const path = require('path');
const store = require('./store');
const auth = require('./auth');

const MAX_UPLOAD = 300 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.mp4', '.webm', '.ogv', '.ogg', '.m4v']);
const MIME_BY_EXT = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.ogg': 'video/ogg'
};
const CATEGORIES = ['Trending', 'Music', 'Gaming', 'Learning', 'Live', 'Comedy'];

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function fail(res, status, message) {
  json(res, status, { error: message });
}

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > limit) {
        reject(Object.assign(new Error('That request is too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Malformed request.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function headerValue(req, name) {
  try {
    return decodeURIComponent(req.headers[name] || '').trim();
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------- accounts */

function validUsername(username) {
  return /^[a-zA-Z0-9_-]{3,20}$/.test(username);
}

async function createAccount(req, res) {
  const body = await readJson(req);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (!validUsername(username)) {
    return fail(res, 400, 'Usernames are 3–20 letters, numbers, dashes or underscores.');
  }
  if (password.length < 6) {
    return fail(res, 400, 'Passwords need at least 6 characters.');
  }
  if (store.findUserByName(username)) {
    return fail(res, 409, 'That username is already taken.');
  }

  const user = store.addUser(username, auth.hashPassword(password));
  res.setHeader('Set-Cookie', auth.sessionCookie(user.id));
  return json(res, 201, { user: store.publicUser(user) });
}

async function signIn(req, res) {
  const body = await readJson(req);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const user = store.findUserByName(username);

  if (!user || !auth.verifyPassword(password, user.password)) {
    return fail(res, 401, 'Wrong username or password.');
  }
  res.setHeader('Set-Cookie', auth.sessionCookie(user.id));
  return json(res, 200, { user: store.publicUser(user) });
}

/* --------------------------------------------------------------- videos */

async function uploadVideo(req, res, user) {
  if (!user) return fail(res, 401, 'Sign in to upload a video.');

  const title = headerValue(req, 'x-title').slice(0, 120);
  const description = headerValue(req, 'x-description').slice(0, 2000);
  const tags = headerValue(req, 'x-tags').slice(0, 200);
  const requested = headerValue(req, 'x-category');
  const category = CATEGORIES.includes(requested) ? requested : CATEGORIES[0];
  const original = headerValue(req, 'x-filename') || 'video.mp4';
  const ext = (path.extname(original) || '.mp4').toLowerCase();
  const contentType = String(req.headers['content-type'] || '');

  if (!title) return fail(res, 400, 'Give your video a title.');
  if (!ALLOWED_EXT.has(ext)) return fail(res, 400, 'Upload an MP4, WebM or Ogg video file.');
  if (!contentType.startsWith('video/')) return fail(res, 400, 'That file does not look like a video.');

  const id = store.newId();
  const filename = `${id}${ext}`;
  const target = store.mediaPath(filename);

  let size = 0;
  let tooBig = false;

  try {
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(target);
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };

      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_UPLOAD) {
          tooBig = true;
          out.destroy();
          req.destroy();
          finish(new Error('too large'));
        }
      });
      req.on('aborted', () => {
        out.destroy();
        finish(new Error('aborted'));
      });
      req.on('error', (error) => {
        out.destroy();
        finish(error);
      });
      out.on('finish', () => finish());
      out.on('error', (error) => finish(error));
      req.pipe(out);
    });
  } catch (error) {
    fs.promises.unlink(target).catch(() => {});
    return fail(
      res,
      tooBig ? 413 : 400,
      tooBig ? 'That video is too large (300 MB maximum).' : 'Upload failed, please try again.'
    );
  }

  if (size === 0) {
    fs.promises.unlink(target).catch(() => {});
    return fail(res, 400, 'The uploaded file was empty.');
  }

  const video = store.addVideo({
    id,
    title,
    description,
    tags,
    category,
    filename,
    mime: MIME_BY_EXT[ext],
    size,
    userId: user.id,
    username: user.username,
    createdAt: new Date().toISOString(),
    views: 0,
    likes: []
  });

  return json(res, 201, { video: store.publicVideo(video, user.id) });
}

function streamVideo(req, res, id) {
  const video = store.findVideo(id);
  if (!video) return fail(res, 404, 'Video not found.');

  const file = store.mediaPath(video.filename);
  let stats;
  try {
    stats = fs.statSync(file);
  } catch {
    return fail(res, 404, 'The video file is missing.');
  }

  const total = stats.size;
  const base = {
    'Content-Type': video.mime || 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store'
  };
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, Object.assign({ 'Content-Length': total }, base));
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file).pipe(res);
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
  if (!match) {
    res.writeHead(416, Object.assign({ 'Content-Range': `bytes */${total}` }, base));
    return res.end();
  }

  let start = match[1] === '' ? NaN : Number(match[1]);
  let end = match[2] === '' ? NaN : Number(match[2]);

  if (Number.isNaN(start)) {
    // Suffix range: last N bytes.
    start = Math.max(total - (Number.isNaN(end) ? 0 : end), 0);
    end = total - 1;
  } else if (Number.isNaN(end) || end >= total) {
    end = total - 1;
  }

  if (start >= total || start > end) {
    res.writeHead(416, Object.assign({ 'Content-Range': `bytes */${total}` }, base));
    return res.end();
  }

  res.writeHead(206, Object.assign({
    'Content-Range': `bytes ${start}-${end}/${total}`,
    'Content-Length': end - start + 1
  }, base));
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(file, { start, end }).pipe(res);
}

/* -------------------------------------------------------------- comments */

async function postComment(req, res, videoId, user) {
  if (!user) return fail(res, 401, 'Sign in to comment.');
  if (!store.findVideo(videoId)) return fail(res, 404, 'Video not found.');

  const body = await readJson(req);
  const text = String(body.text || '').trim().slice(0, 1000);
  if (!text) return fail(res, 400, 'Write a comment first.');

  const comment = store.addComment({
    id: store.newId(),
    videoId,
    userId: user.id,
    username: user.username,
    text,
    createdAt: new Date().toISOString()
  });
  return json(res, 201, { comment });
}

/* ------------------------------------------------------------------ chat */

async function postChat(req, res, user) {
  if (!user) return fail(res, 401, 'Sign in to join the conversation.');

  const body = await readJson(req);
  const text = String(body.text || '').trim().slice(0, 500);
  if (!text) return fail(res, 400, 'Write something first.');

  const message = store.addChat({ userId: user.id, username: user.username, text });
  return json(res, 201, { message });
}

/* ---------------------------------------------------------------- router */

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1);
  const [resource, id, action] = parts;
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  const user = auth.currentUser(req);

  if (resource === 'me' && method === 'GET') {
    return json(res, 200, { user: store.publicUser(user) });
  }
  if (resource === 'signup' && method === 'POST') return createAccount(req, res);
  if (resource === 'signin' && method === 'POST') return signIn(req, res);
  if (resource === 'signout' && method === 'POST') {
    res.setHeader('Set-Cookie', auth.clearCookie());
    return json(res, 200, { ok: true });
  }

  if (resource === 'videos') {
    if (!id && method === 'GET') {
      return json(res, 200, {
        videos: store.listVideos().map((video) => store.publicVideo(video, user && user.id))
      });
    }
    if (!id && method === 'POST') return uploadVideo(req, res, user);
    if (id && !action && method === 'GET') {
      const video = store.findVideo(id);
      if (!video) return fail(res, 404, 'Video not found.');
      return json(res, 200, { video: store.publicVideo(video, user && user.id) });
    }
    if (id && action === 'stream') return streamVideo(req, res, id);
    if (id && action === 'view' && method === 'POST') {
      const video = store.bumpViews(id);
      if (!video) return fail(res, 404, 'Video not found.');
      return json(res, 200, { views: video.views });
    }
    if (id && action === 'like' && method === 'POST') {
      if (!user) return fail(res, 401, 'Sign in to like videos.');
      const video = store.toggleLike(id, user.id);
      if (!video) return fail(res, 404, 'Video not found.');
      const likes = (video.likes || []).length;
      return json(res, 200, { likes, liked: video.likes.includes(user.id) });
    }
    if (id && action === 'comments') {
      if (method === 'GET') return json(res, 200, { comments: store.listComments(id) });
      if (method === 'POST') return postComment(req, res, id, user);
    }
  }

  if (resource === 'chat') {
    if (method === 'GET') {
      return json(res, 200, { messages: store.listChat(url.searchParams.get('since')) });
    }
    if (method === 'POST') return postChat(req, res, user);
  }

  if (resource === 'channels' && method === 'GET') {
    return json(res, 200, { channels: store.listChannels() });
  }

  return fail(res, 404, 'Not found.');
}

module.exports = { handleApi };
