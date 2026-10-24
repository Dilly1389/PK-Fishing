// PK Fishing service worker. Push notifications, plus map tiles only - the
// app otherwise relies on live Supabase reads and intercepting requests here
// would risk serving stale data instead, so nothing else is cached.

self.addEventListener('install', () => {
  self.skipWaiting();
});

// Cache-first for map tiles, so a venue or pin-drop map still shows tiles
// you've already viewed even with no signal - logging already works
// offline, the map tiles themselves were the one piece that didn't.
const MAP_TILE_HOSTS = ['tile.openstreetmap.org', 'server.arcgisonline.com', 'tile.opentopomap.org'];
const TILE_CACHE = 'pk-fishing-map-tiles-v1';

function isMapTileRequest(url) {
  return MAP_TILE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
}

self.addEventListener('fetch', (event) => {
  let url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return;
  }
  if (event.request.method !== 'GET' || !isMapTileRequest(url)) return;

  event.respondWith(
    caches.open(TILE_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch (e) {
        return cached || Response.error();
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'PK Fishing', body: 'You have a new notification', url: 'https://pksport.co.za/fishing' };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (e) {
    // Not JSON - fall back to the defaults above rather than failing silently
    if (event.data) data.body = event.data.text() || data.body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      // The large icon shown in the notification body - full colour, opaque
      // background, this is the actual logo.
      icon: 'icon-192.png?v=3',
      // Android renders "badge" (the small status-bar icon) as a plain white
      // silhouette using only the image's alpha channel, ignoring colour -
      // icon-192.png's fully opaque square background used to make that
      // silhouette a solid white SQUARE. This is a transparent-background
      // cutout of the same logo mark, so the silhouette is actually recognisable.
      badge: 'badge-icon.png',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || 'https://pksport.co.za/fishing';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
