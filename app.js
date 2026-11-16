'use strict';

/* Shared client helpers: API access, formatting, video cards, header state. */

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// Sample cards so the feed is not empty before anything is uploaded. They have
// no video file, so they cannot be liked or commented on.
const DEMO_VIDEOS = [{
    id: 'demo-1',
    title: 'A calm walk through the city',
    creator: 'Alex',
    views: 1200000,
    createdAt: daysAgo(2),
    tags: 'travel city walk',
    category: 'Trending',
    colorA: '#263c67',
    colorB: '#c34262',
    icon: '✦'
  },
  {
    id: 'demo-2',
    title: 'Weekend kitchen experiments',
    creator: 'Jordan',
    views: 842000,
    createdAt: daysAgo(5),
    tags: 'food cooking kitchen',
    category: 'Learning',
    colorA: '#874b25',
    colorB: '#e7a42b',
    icon: '◉'
  },
  {
    id: 'demo-3',
    title: 'How to make your own soundtrack',
    creator: 'Sam',
    views: 326000,
    createdAt: daysAgo(7),
    tags: 'music tutorial creative',
    category: 'Music',
    colorA: '#4b237a',
    colorB: '#2b9a9a',
    icon: '♫'
  },
  {
    id: 'demo-4',
    title: 'The ultimate desk setup tour',
    creator: 'Taylor',
    views: 213000,
    createdAt: daysAgo(14),
    tags: 'tech setup desk',
    category: 'Learning',
    colorA: '#1d5c55',
    colorB: '#91b33e',
    icon: '⌘'
  },
  {
    id: 'demo-5',
    title: 'Learning something new every day',
    creator: 'Morgan',
    views: 98000,
    createdAt: daysAgo(21),
    tags: 'education learning tips',
    category: 'Learning',
    colorA: '#7b2c57',
    colorB: '#e16493',
    icon: '◆'
  },
  {
    id: 'demo-6',
    title: 'Late night gaming highlights',
    creator: 'Riley',
    views: 671000,
    createdAt: daysAgo(30),
    tags: 'gaming highlights fun',
    category: 'Gaming',
    colorA: '#252d73',
    colorB: '#d72970',
    icon: '♟'
  }
];

const Api = {
  async request(path, options = {}) {
    const response = await fetch(path, options);
    let data = {};
    try {
      data = await response.json();
    } catch {
      /* an empty or non-JSON body */
    }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  },
  get(path) {
    return this.request(path);
  },
  post(path, body) {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  }
};

let meCache = null;

function getMe(force = false) {
  if (!meCache || force) {
    meCache = Api.get('/api/me').then(data => data.user).catch(() => null);
  }
  return meCache;
}

function watchUrl(id) {
  return `/watch?id=${encodeURIComponent(id)}`;
}

function signInUrl() {
  return `/signin?next=${encodeURIComponent(location.pathname + location.search)}`;
}

function formatCount(value) {
  const n = Number(value) || 0;
  const short = (size, suffix) => `${(n / size).toFixed(1).replace(/\.0$/, '')}${suffix}`;
  if (n >= 1e9) return short(1e9, 'B');
  if (n >= 1e6) return short(1e6, 'M');
  if (n >= 1e3) return short(1e3, 'K');
  return String(n);
}

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (!then || Number.isNaN(then)) return 'just now';
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

async function allVideos() {
  try {
    const data = await Api.get('/api/videos');
    return data.videos.concat(DEMO_VIDEOS);
  } catch {
    return DEMO_VIDEOS.slice();
  }
}

async function toggleLike(video, button) {
  const user = await getMe();
  if (!user) {
    location.href = signInUrl();
    return null;
  }
  button.disabled = true;
  try {
    const result = await Api.post(`/api/videos/${encodeURIComponent(video.id)}/like`);
    video.liked = result.liked;
    video.likes = result.likes;
    button.textContent = result.liked ? '♥ Liked' : '♡ Like';
    button.classList.toggle('liked', result.liked);
    return result;
  } catch (error) {
    console.error(error);
    button.textContent = '♡ Like';
    return null;
  } finally {
    button.disabled = false;
  }
}

function videoCard(video) {
  const card = document.createElement('article');
  card.className = 'video-card';

  const thumb = document.createElement('div');
  thumb.className = 'video-thumb';

  const link = document.createElement('a');
  link.className = 'thumb-link';
  link.href = watchUrl(video.id);
  link.setAttribute('aria-label', video.title);

  if (video.streamUrl) {
    const preview = document.createElement('video');
    preview.src = `${video.streamUrl}#t=0.5`;
    preview.preload = 'metadata';
    preview.muted = true;
    preview.playsInline = true;
    link.appendChild(preview);
  } else {
    const demo = document.createElement('div');
    demo.className = 'demo-thumb';
    demo.style.setProperty('--thumb-a', video.colorA || 'var(--color-primary)');
    demo.style.setProperty('--thumb-b', video.colorB || 'var(--color-link)');
    demo.textContent = video.icon || '▶';
    link.appendChild(demo);

    const badge = document.createElement('span');
    badge.className = 'badge thumb-badge';
    badge.textContent = 'Sample';
    thumb.appendChild(badge);
  }

  thumb.appendChild(link);

  const title = document.createElement('h3');
  const titleLink = document.createElement('a');
  titleLink.href = link.href;
  titleLink.textContent = video.title;
  title.appendChild(titleLink);

  const meta = document.createElement('div');
  meta.className = 'video-meta';
  const views = Number(video.views) || 0;
  meta.textContent = `${video.creator} · ${formatCount(views)} view${views === 1 ? '' : 's'} · ${timeAgo(video.createdAt)}`;

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  if (video.streamUrl) {
    const like = document.createElement('button');
    like.className = `icon-btn ${video.liked ? 'liked' : ''}`;
    like.textContent = video.liked ? '♥ Liked' : '♡ Like';
    like.onclick = () => toggleLike(video, like);
    actions.appendChild(like);
  }

  const watch = document.createElement('a');
  watch.className = 'icon-btn';
  watch.href = link.href;
  watch.textContent = video.streamUrl ? '▢ Watch & comment' : '▢ Open';
  actions.appendChild(watch);

  card.append(thumb, title, meta, actions);
  return card;
}

async function updateAuthLinks() {
  const user = await getMe();
  document.querySelectorAll('[data-signin]').forEach((element) => {
    element.classList.toggle('hidden', Boolean(user));
  });
  document.querySelectorAll('[data-account]').forEach((element) => {
    element.classList.toggle('hidden', !user);
    if (user) element.textContent = user.username;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateAuthLinks);
} else {
  updateAuthLinks();
}
