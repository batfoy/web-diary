// === 🚀 SERVICE WORKER: Офлайн-режим и кэширование ===
// Последнее обновление: 2026-11-08
// Стратегия: stale-while-revalidate (кэш + фоновое обновление)
// ВАЖНО: при каждом релизе меняй CACHE_VERSION!

const CACHE_VERSION = 'v2.95';
const CACHE_NAME = `my-web-diary-${CACHE_VERSION}`;

const urlsToCache = [
    './index.html',
    './style.css',
    './script.js',
    './db.js',
    './purify.min.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',      // ← для установки PWA
    './bg-landscape.webp', // ← фоны (если есть у тебя)
    './bg-perry.webp'      // ← фоны (если есть у тебя)
];

// === INSTALL: кэшируем файлы при первой установке ===
self.addEventListener('install', (event) => {
    self.skipWaiting();
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache:', CACHE_NAME);
                return cache.addAll(urlsToCache).catch(err => {
                    console.warn('Некоторые файлы не закэшировались:', err);
                });
            })
    );
});

// === ACTIVATE: удаляем старые кэши, забираем контроль над вкладками ===
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});

// === FETCH: стратегия stale-while-revalidate ===
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(event.request);
            
            const networkPromise = fetch(event.request).then((response) => {
                if (response.ok) {
                    cache.put(event.request, response.clone())
                        .catch(err => console.warn('Cache put failed:', err));
                }
                return response;
            }).catch(() => null);

            if (cached) {
                event.waitUntil(networkPromise);
                return cached;
            }
            
            return (await networkPromise) ||
                   (event.request.mode === 'navigate' ? caches.match('./index.html') : null);
        })
    );
});