// HABBY — Service Worker v3
// Precaches app shell, holds a tiny state blob for periodic-sync reminders,
// and fires browser notifications when the app is closed.
const CACHE = 'habby-v3-todos'
const STATE_CACHE = 'habby-state'
const ASSETS = ['/', '/index.html', '/css/style.css', '/js/main.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('habby-v') && k !== CACHE).map(k => caches.delete(k))
    )).then(() => clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) return
  if (e.request.url.includes('/habby-state')) {
    e.respondWith(
      caches.open(STATE_CACHE).then(c => c.match(e.request).then(r => r || Response.json({})))
    )
    return
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  )
})

// --- Periodic sync: daily reminder when app is closed ---
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'habby-reminder') {
    e.waitUntil(remindFromState())
  }
})

async function remindFromState() {
  try {
    const cache = await caches.open(STATE_CACHE)
    const res = await cache.match('/habby-state')
    if (!res) return
    const state = await res.json()
    const open = state.open || 0
    if (open <= 0) return

    // Only remind once per day
    const key = 'habby-notified-' + new Date().toISOString().slice(0, 10)
    const last = await caches.open(STATE_CACHE + '-meta')
    if (await last.match(key)) return

    await self.registration.showNotification('📌 Habby — ' + open + ' open', {
      body: open === 1 ? '1 task waiting for you.' : open + ' tasks waiting for you.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'habby-reminder',
      data: { url: '/' }
    })
    await last.put(key, new Response('1'))
  } catch (e) { /* noop */ }
}

// Handle notification clicks
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      if (cls.length > 0) {
        cls[0].focus()
      } else {
        clients.openWindow(e.notification.data && e.notification.data.url || '/')
      }
    })
  )
})
