const DEMO_VIDEOS = [{
    id: 'demo-1',
    title: 'A calm walk through the city',
    creator: 'Alex',
    views: '1.2M views',
    age: '2 days ago',
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
    views: '842K views',
    age: '5 days ago',
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
    views: '326K views',
    age: '1 week ago',
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
    views: '213K views',
    age: '2 weeks ago',
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
    views: '98K views',
    age: '3 weeks ago',
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
    views: '671K views',
    age: '1 month ago',
    tags: 'gaming highlights fun',
    category: 'Gaming',
    colorA: '#252d73',
    colorB: '#d72970',
    icon: '♟'
  }
];

function safeJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function getUploads() {
  return safeJSON('youchill_uploads', []);
}

function allVideos() {
  return getUploads().concat(DEMO_VIDEOS);
}

function liked(id) {
  return !!safeJSON('youchill_likes', {})[id];
}

function toggleLike(id) {
  const likes = safeJSON('youchill_likes', {});
  likes[id] = !likes[id];
  localStorage.setItem('youchill_likes', JSON.stringify(likes));
  return likes[id];
}

function updateAuthLinks() {
  const user = localStorage.getItem('youchill_current_user');
  document.querySelectorAll('[data-signin]').forEach(el => el.classList.toggle('hidden', !!user));
  document.querySelectorAll('[data-account]').forEach(el => {
    el.classList.toggle('hidden', !user);
    if (user) el.textContent = user;
  });
}

function videoCard(video, fileMap) {
  const card = document.createElement('article');
  card.className = 'video-card';
  const thumb = document.createElement('div');
  thumb.className = 'video-thumb';
  const record = fileMap?.get(video.id);
  let objectUrl = null;

  if (record?.thumbnail) {
    const image = document.createElement('img');
    objectUrl = URL.createObjectURL(record.thumbnail);
    image.src = objectUrl;
    image.alt = `${video.title} thumbnail`;
    image.onload = () => URL.revokeObjectURL(objectUrl);
    thumb.appendChild(image);
  } else if (record?.file) {
    const player = document.createElement('video');
    player.controls = true;
    player.preload = 'metadata';
    objectUrl = URL.createObjectURL(record.file);
    player.src = objectUrl;
    player.addEventListener('emptied', () => URL.revokeObjectURL(objectUrl), {
      once: true
    });
    thumb.appendChild(player);
  } else if (video.sourceUrl) {
    const player = document.createElement('video');
    player.controls = true;
    player.preload = 'metadata';
    player.src = video.sourceUrl;
    player.onerror = () => {
      thumb.replaceChildren();
      const note = document.createElement('div');
      note.className = 'demo-thumb';
      note.textContent = 'External video';
      thumb.appendChild(note);
    };
    thumb.appendChild(player);
  } else {
    const demo = document.createElement('div');
    demo.className = 'demo-thumb';
    demo.style.setProperty('--thumb-a', video.colorA || 'var(--color-primary)');
    demo.style.setProperty('--thumb-b', video.colorB || 'var(--color-link)');
    demo.textContent = video.icon || '▶';
    thumb.appendChild(demo);
  }

  const title = document.createElement('h3');
  title.textContent = video.title;
  const meta = document.createElement('div');
  meta.className = 'video-meta';
  meta.textContent = `${video.creator || video.uploadedBy} · ${video.views || 'New upload'} · ${video.age || 'Just now'}`;
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const like = document.createElement('button');
  like.className = `icon-btn ${liked(video.id) ? 'liked' : ''}`;
  const setLike = () => {
    like.textContent = toggleLike(video.id) ? '♥ Liked' : '♡ Like';
    like.classList.toggle('liked', liked(video.id));
  };
  like.textContent = liked(video.id) ? '♥ Liked' : '♡ Like';
  like.onclick = setLike;
  const watch = document.createElement('a');
  watch.className = 'icon-btn';
  watch.href = `/watch?id=${encodeURIComponent(video.id)}`;
  watch.textContent = '▢ Watch & comment';
  actions.append(like, watch);
  card.append(thumb, title, meta, actions);
  return card;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('youchill_video_storage', 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('videos', {
        keyPath: 'id'
      });
      store.createIndex('id', 'id', {
        unique: true
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getFileMap() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction('videos').objectStore('videos').getAll();
      req.onsuccess = () => resolve(new Map(req.result.map(x => [x.id, x])));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return new Map();
  }
}

function appPrefix() {
  const knownRoutes = ['/upload', '/signin', '/account', '/channels', '/chat', '/watch', '/tests.html'];
  const path = location.pathname;
  const route = knownRoutes.find(item => path === item || path.startsWith(`${item}/`));
  if (route) return path.slice(0, path.indexOf(route));
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

function appUrl(route = '/') {
  const prefix = appPrefix();
  return `${location.origin}${prefix}${route === '/' ? '/' : route}`;
}

function goToApp(route = '/') {
  location.assign(appUrl(route));
}

function rememberSignInReturn() {
  sessionStorage.setItem('youchill_return_after_signin', location.href);
}

document.querySelectorAll('[data-signin]').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    rememberSignInReturn();
    goToApp('/signin');
  });
});

updateAuthLinks();
