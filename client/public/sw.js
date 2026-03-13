const CACHE_NAME = 'iknowball-v3'

// Install — cache offline fallback page
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.put('/offline.html', new Response(
      `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>I KNOW BALL</title>
<style>body{background:#0a0a0b;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}
h1{font-size:1.5rem;margin-bottom:.5rem}p{color:#888;font-size:.875rem}button{background:#e8552e;color:#fff;border:none;padding:.5rem 1.5rem;border-radius:.5rem;margin-top:1rem;cursor:pointer;font-size:.875rem}</style>
</head><body><div><h1>You're offline</h1><p>Check your connection and try again.</p><button onclick="location.reload()">Retry</button></div></body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )))
  )
  self.skipWaiting()
})

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch — network-first for everything, cache static assets only
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Skip non-GET and API requests
  if (request.method !== 'GET' || request.url.includes('/api/')) return

  // Navigation requests — network only, offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html'))
    )
    return
  }

  // Static assets (JS, CSS, images, fonts) — network first, cache fallback
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => caches.match(request))
    )
  }
})

// Push — show browser notification from push payload
self.addEventListener('push', (event) => {
  if (!event.data) return

  const { title, body, url } = event.data.json()
  event.waitUntil(
    self.registration.showNotification(title || 'I KNOW BALL', {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: url || '/results' },
    })
  )
})

// Notification click — open or focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/results'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
