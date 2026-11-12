/**
 * Panorama Water Tank Monitor — Notification Service Worker
 * Supports Desktop Browsers and Android Chrome background/foreground notifications.
 */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const payload = event.data;
  if (payload && payload.type === 'SHOW_NOTIFICATION' && payload.title) {
    event.waitUntil(
      self.registration.showNotification(payload.title, payload.options || {})
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = (event.notification && event.notification.data) || {};
  const targetUrl = data.url || './#/alerts';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus().then((focused) => {
            if (focused && 'postMessage' in focused) {
              focused.postMessage({
                type: 'PANORAMA_NOTIFICATION_CLICK',
                data,
              });
            }
            return focused;
          });
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

