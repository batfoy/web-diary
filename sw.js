const CACHE_NAME = 'my-web-diary-v2.8';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './db.js',
  './purify.min.js',
  './manifest.json',
  './icon-192.png'
];

self.addEventListener('install', (event) => {
  // Немедленная активация нового Service Worker
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache).catch(err => {
          console.warn('Некоторые файлы не закэшировались (возможно, нет сети):', err);
        });
      })
  );
});

self.addEventListener('activate', (event) => {
  // Объединяем claim и очистку старого кэша в один Promise.all для надежности
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

self.addEventListener('fetch', (event) => {
  // Игнорируем не-GET запросы
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Если есть в кэше — отдаём сразу
        if (response) {
          return response;
        }
        // Если нет в кэше — пытаемся получить из сети
        return fetch(event.request).catch(() => {
          // Offline fallback: если сети нет и этого нет в кэше, отдаём главную страницу
          // Это позволяет PWA открываться даже без интернета
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          // Для остальных ресурсов (картинки, шрифты) просто возвращаем undefined (браузер обработает как ошибку сети)
        });
      })
  );
});