// HABBY — Service Worker
const CACHE = 'habby-v1'
const ASSETS = ['/', '/index.html', '/css/style.css', '/js/main.js']

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim())
})

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) return
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  )
})

// Handle notification clicks
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      if (cls.length > 0) {
        cls[0].focus()
      } else {
        clients.openWindow('/')
      }
    })
  )
})
