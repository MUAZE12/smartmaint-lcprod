// ============================================================
// SmartMaint — L.C PROD · Service Worker
// ------------------------------------------------------------
// Strategy (bumped via VERSION constant when assets change):
//   • App shell (HTML routes): network-first, fallback to cache
//     then to /offline.html
//   • Static assets (/_next/static/, /logo.png, manifest):
//     cache-first (immutable & version-hashed by Next.js)
//   • Whisper model files (Supabase Storage /models/* OR local
//     /models/*): cache-first, large but immutable → cache once,
//     forever offline-available
//   • Supabase REST / Realtime: network-only (we want fresh data;
//     offline mutations are deferred to a later sprint with an
//     IndexedDB write queue)
// Bumping VERSION purges old caches on activate.
// ============================================================

const VERSION = 'smartmaint-v2';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const MODEL_CACHE = `${VERSION}-whisper`;

// Files always precached so the app loads offline.
const PRECACHE_URLS = [
    '/',
    '/offline.html',
    '/manifest.webmanifest',
    '/logo.png',
];

// ── INSTALL — precache the shell ────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// ── ACTIVATE — purge old caches ─────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(k => !k.startsWith(VERSION))
                    .map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── FETCH — strategy dispatcher ─────────────────────────────
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return; // never cache mutations
    const url = new URL(req.url);

    // 1. Whisper model files — cache forever (huge, immutable)
    if (isModelFile(url)) {
        event.respondWith(cacheFirst(req, MODEL_CACHE));
        return;
    }

    // 2. Supabase API — stale-while-revalidate for GET so the app can
    //    show the last-known snapshot when offline. Realtime WebSocket
    //    (wss://) is not caught by fetch, so we don't touch it. Auth
    //    endpoints stay network-only so stale sessions don't linger.
    if (url.hostname.endsWith('.supabase.co') && !isSupabaseModel(url)) {
        if (url.pathname.startsWith('/auth/')) return; // network-only
        if (req.method === 'GET' && url.pathname.startsWith('/rest/')) {
            event.respondWith(supabaseSwr(req));
            return;
        }
        return; // pass through everything else
    }

    // 3. Next.js immutable static assets
    if (url.pathname.startsWith('/_next/static/') || isStaticAsset(url.pathname)) {
        event.respondWith(cacheFirst(req, STATIC_CACHE));
        return;
    }

    // 4. HTML navigation requests — network-first w/ offline fallback
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
        event.respondWith(networkFirstWithOfflineFallback(req));
        return;
    }

    // 5. Everything else — stale-while-revalidate
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
});

// ── strategies ──────────────────────────────────────────────

async function cacheFirst(req, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
    } catch (err) {
        return new Response('Offline — ressource non disponible', { status: 503 });
    }
}

async function networkFirstWithOfflineFallback(req) {
    try {
        const res = await fetch(req);
        // Cache successful HTML for offline replay
        if (res.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(req, res.clone());
        }
        return res;
    } catch {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        const offline = await caches.match('/offline.html');
        return offline || new Response('Offline', { status: 503 });
    }
}

async function staleWhileRevalidate(req, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req)
        .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached); // on error, fall back to whatever we had
    return cached || fetchPromise;
}

/** Stale-while-revalidate specifically for Supabase REST reads. Uses a
 *  dedicated cache bucket so we can wipe it independently. Adds a warning
 *  header when serving stale so the client-side hook can display a badge. */
async function supabaseSwr(req) {
    const cache = await caches.open(`${VERSION}-supabase-rest`);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req)
        .then(res => {
            // Only cache 200 GETs. Supabase sometimes returns 206 partial
            // content with Range which is never cache-safe.
            if (res.ok && res.status === 200) {
                cache.put(req, res.clone());
            }
            return res;
        })
        .catch(() => {
            if (cached) {
                const stale = new Response(cached.body, {
                    status: cached.status,
                    statusText: cached.statusText,
                    headers: new Headers(cached.headers),
                });
                stale.headers.set('X-Smartmaint-Stale', '1');
                return stale;
            }
            return new Response(JSON.stringify({ error: 'Offline — pas de cache disponible' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
            });
        });
    return cached ? Promise.resolve(cached).then(async c => {
        // Kick off the revalidation but don't wait for it.
        fetchPromise.catch(() => {});
        return c;
    }) : fetchPromise;
}

// ── detectors ───────────────────────────────────────────────

function isStaticAsset(pathname) {
    return /\.(png|jpe?g|svg|gif|webp|ico|woff2?|ttf|otf|eot|css|js|json|webmanifest)$/i.test(pathname);
}

/** Whisper model file — either local /models/ OR remote on Supabase Storage. */
function isModelFile(url) {
    if (url.pathname.startsWith('/models/')) return true;
    if (url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/v1/object/public/models/')) return true;
    return false;
}

function isSupabaseModel(url) {
    return url.hostname.endsWith('.supabase.co')
        && url.pathname.includes('/storage/v1/object/public/models/');
}

// ── Message channel: clear caches on demand ─────────────────
self.addEventListener('message', (event) => {
    if (event.data === 'CLEAR_CACHES') {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
    }
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
