'use strict';

// Tiny JSON-backed store. The app is small enough that keeping everything in
// memory and writing an atomic snapshot is simpler (and safer) than running a
// database service for it. Uploaded video files live next to the snapshot.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', '.data'));
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_PATH = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(MEDIA_DIR, { recursive: true });

const EMPTY = { users: [], videos: [], comments: [], chat: [], chatSeq: 0 };

const db = read();

function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return Object.assign(structuredClone(EMPTY), parsed);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[youchill] could not read the data snapshot, starting empty:', error.message);
    }
    return structuredClone(EMPTY);
  }
}

function persist() {
  const temp = `${DB_PATH}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db));
  fs.renameSync(temp, DB_PATH);
}

function newId() {
  return crypto.randomBytes(9).toString('hex');
}

/* ---------------------------------------------------------------- users */

function findUserById(id) {
  return db.users.find((user) => user.id === id) || null;
}

function findUserByName(username) {
  const key = String(username || '').toLowerCase();
  return db.users.find((user) => user.username.toLowerCase() === key) || null;
}

function addUser(username, password) {
  const user = {
    id: newId(),
    username,
    password,
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  persist();
  return user;
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username, createdAt: user.createdAt };
}

/* --------------------------------------------------------------- videos */

function listVideos() {
  return db.videos.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function findVideo(id) {
  return db.videos.find((video) => video.id === id) || null;
}

function addVideo(video) {
  db.videos.push(video);
  persist();
  return video;
}

function bumpViews(id) {
  const video = findVideo(id);
  if (!video) return null;
  video.views = (video.views || 0) + 1;
  persist();
  return video;
}

function toggleLike(videoId, userId) {
  const video = findVideo(videoId);
  if (!video) return null;
  video.likes = video.likes || [];
  const index = video.likes.indexOf(userId);
  if (index >= 0) video.likes.splice(index, 1);
  else video.likes.push(userId);
  persist();
  return video;
}

function mediaPath(filename) {
  return path.join(MEDIA_DIR, filename);
}

function publicVideo(video, viewerId) {
  const likes = video.likes || [];
  return {
    id: video.id,
    title: video.title,
    description: video.description || '',
    tags: video.tags || '',
    category: video.category || 'Trending',
    createdAt: video.createdAt,
    views: video.views || 0,
    likes: likes.length,
    liked: Boolean(viewerId) && likes.includes(viewerId),
    creator: video.username,
    creatorId: video.userId,
    streamUrl: `/api/videos/${video.id}/stream`
  };
}

/* ------------------------------------------------------------- comments */

function listComments(videoId) {
  return db.comments
    .filter((comment) => comment.videoId === videoId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

function addComment(comment) {
  db.comments.push(comment);
  persist();
  return comment;
}

/* ----------------------------------------------------------------- chat */

function listChat(since) {
  const threshold = Number(since) || 0;
  return threshold ? db.chat.filter((message) => message.seq > threshold) : db.chat.slice(-100);
}

function addChat({ userId, username, text }) {
  db.chatSeq = (db.chatSeq || 0) + 1;
  const message = {
    seq: db.chatSeq,
    userId,
    username,
    text,
    createdAt: new Date().toISOString()
  };
  db.chat.push(message);
  if (db.chat.length > 500) db.chat.splice(0, db.chat.length - 500);
  persist();
  return message;
}

/* ------------------------------------------------------------- channels */

function listChannels() {
  const channels = new Map();
  for (const video of db.videos) {
    const entry = channels.get(video.userId) || { creator: video.username, videos: 0, views: 0 };
    entry.videos += 1;
    entry.views += video.views || 0;
    channels.set(video.userId, entry);
  }
  return [...channels.values()].sort((a, b) => b.videos - a.videos);
}

module.exports = {
  DATA_DIR,
  MEDIA_DIR,
  persist,
  newId,
  findUserById,
  findUserByName,
  addUser,
  publicUser,
  listVideos,
  findVideo,
  addVideo,
  bumpViews,
  toggleLike,
  mediaPath,
  publicVideo,
  listComments,
  addComment,
  listChat,
  addChat,
  listChannels
};
