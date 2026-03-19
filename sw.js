/* ═══════════════════════════════════════
   RizzUp Service Worker v6
   Cache-first · Offline ready · Auto-update
═══════════════════════════════════════ */
const CACHE = 'rizzup-v6';
const API_DOMAIN = 'api.anthropic.com';
const FONT_DOMAINS = ['fonts.googleapis.com','fonts.gstatic.com'];

const PRECACHE = [
  './app.html',
  './index.html',
  './manifest.json',
];

// ── INSTALL ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE.map(u => new Request(u, {cache:'reload'}))))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Precache failed:', err))
  );
});

// ── ACTIVATE ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1. API Anthropic → Network only, never cache
  if (url.hostname === API_DOMAIN) {
    e.respondWith(
      fetch(e.request).catch(() => new Response(
        JSON.stringify({error:'offline',message:'Hors-ligne — IA indisponible'}),
        {status:503, headers:{'Content-Type':'application/json'}}
      ))
    );
    return;
  }

  // 2. Fonts → Stale-while-revalidate
  if (FONT_DOMAINS.includes(url.hostname)) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const fresh = fetch(e.request).then(r => { cache.put(e.request, r.clone()); return r; }).catch(() => cached);
          return cached || fresh;
        })
      )
    );
    return;
  }

  // 3. HTML navigation → Network-first with cache fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => { caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; })
        .catch(() => caches.match(e.request).then(c => c || caches.match('./app.html')))
    );
    return;
  }

  // 4. Everything else → Cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (r.ok && e.request.method === 'GET') {
          caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        }
        return r;
      }).catch(() => new Response('Hors-ligne', {status:503}));
    })
  );
});

// ── MESSAGES ──
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'GET_VERSION') e.ports[0]?.postMessage({version:CACHE});
});