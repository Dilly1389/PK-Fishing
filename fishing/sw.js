// PK Fishing service worker. Push notifications only - no offline caching or
// fetch interception, since the app relies on live Supabase reads and
// intercepting requests here would risk serving stale data instead.

self.addEventListener('install', () => {
  self.skipWaiting();
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
      icon: 'icon-192.png',
      badge: 'icon-192.png',
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
