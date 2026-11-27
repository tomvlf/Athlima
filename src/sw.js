/**
 * Browser service worker for offline app files, not a storage server. Cache navigation pages and an
 * allowed set of same-site assets; ignore provider traffic, /api/ paths and writes. Navigation
 * and manifests try the network first; other named assets try the cache first. Updates wait for existing app windows
 * to close so an active ride is not switched to new code mid-session.
 */

const cacheName = 'too-many-watts-shell-v4';
/**
 * Allow only same-origin JavaScript, CSS, PNG, SVG and web-manifest files outside /api/. Not every
 * resource, such as a photograph or external response, is eligible for this cache.
 */
const isAsset = url => url.origin === self.location.origin &&
    !url.pathname.startsWith('/api/') && /\.(?:js|css|png|svg|webmanifest)$/.test(url.pathname);

/**
 * Try to cache a successful response while returning the network response even if browser caching
 * fails. Cache failures are logged, not treated as successful offline storage.
 */
async function cacheResponse(request, response) {
    if(response.ok) {
        try {
            const cache = await caches.open(cacheName);
            await cache.put(request, response.clone());
        } catch(error) {
            console.warn('Too Many Watts offline caching unavailable; using the network response.', error);
        }
    }
    return response;
}

self.addEventListener('install', event => {
    event.waitUntil(caches.open(cacheName).then(async cache => {
        let manifest = null;
        try {
            const response = await fetch('/offline-assets.json');
            if(response.ok) manifest = await response.json();
        } catch {
            manifest = null;
        }
        const assets = manifest?.assets || ['/', '/mobile'];
        await cache.addAll(assets.filter(url => {
            try { return new URL(url, self.location.origin).origin === self.location.origin; }
            catch { return false; }
        }));
    }));
    // Updates wait for existing ride windows to close; never replace code mid-ride.
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        if(typeof caches.keys === 'function') {
            const names = await caches.keys();
            await Promise.all(names.filter(name => name.startsWith('too-many-watts-shell-') && name !== cacheName)
                .map(name => caches.delete(name)));
        }
        await self.clients.claim();
    })());
});

/**
 * Accept the page's loaded-asset list, filter it through the same-origin allowlist and report a
 * cache failure back to that page.
 */
self.addEventListener('message', event => {
    if(event.data?.type !== 'CACHE_ASSETS' || !Array.isArray(event.data.urls)) return;
    const urls = event.data.urls.filter(value => {
        try { return isAsset(new URL(value)); } catch { return false; }
    });
    event.waitUntil(caches.open(cacheName).then(async cache => {
        for(const url of urls) {
            if(!await cache.match(url)) {
                try { await cache.add(url); }
                catch { event.source?.postMessage({type: 'CACHE_ERROR'}); }
            }
        }
    }));
});

/**
 * For page navigation, fall back to a saved page only when the network fails. For eligible assets,
 * reuse a cached response before fetching and saving a new one.
 */
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if(event.request.method !== 'GET' || url.origin !== self.location.origin ||
       url.pathname.startsWith('/api/')) return;
    if(event.request.mode === 'navigate') {
        event.respondWith(fetch(event.request).then(response => cacheResponse(event.request, response))
            .catch(async () => (await caches.match(event.request)) ||
            (await caches.match('/')) || Response.error()));
    } else if(url.pathname.endsWith('.webmanifest')) {
        event.respondWith(fetch(event.request).then(response => cacheResponse(event.request, response))
            .catch(async () => (await caches.match(event.request)) || Response.error()));
    } else if(isAsset(url)) {
        event.respondWith(caches.match(event.request).catch(error => {
            console.warn('Too Many Watts offline cache unavailable; using the network.', error);
            return null;
        }).then(cached => cached || fetch(event.request).then(response => cacheResponse(event.request, response))));
    }
});
