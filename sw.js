// Tempo — service worker.
// Guarda toda la app en el dispositivo al instalarla y desde entonces la sirve
// SOLO desde esa copia local: nunca pide nada a Internet.
const CACHE = 'tempo-v1';
// Imprescindibles: si falta alguno, no se instala.
const CORE = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];
// Fuentes: si faltara alguna, la app usa la del sistema y sigue funcionando sin conexión.
const FONTS = [
  './fonts/barlow_regular.ttf',
  './fonts/barlow_medium.ttf',
  './fonts/barlow_semibold.ttf',
  './fonts/barlow_bold.ttf',
  './fonts/barlowcond_medium.ttf',
  './fonts/barlowcond_semibold.ttf',
  './fonts/barlowcond_bold.ttf',
  './fonts/barlowcond_extrabold.ttf',
  './fonts/barlowcond_bolditalic.ttf',
  './fonts/barlowcond_extrabolditalic.ttf',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE).then(() => Promise.all(FONTS.map((f) => c.add(f).catch(() => {})))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      if (e.request.mode === 'navigate') return caches.match('./index.html');
      return new Response('', { status: 404 });
    })
  );
});
