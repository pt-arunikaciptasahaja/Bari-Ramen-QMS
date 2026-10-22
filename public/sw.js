/* Push only: never cache tickets, staff sessions, or private API responses. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* Show a safe fallback. */ }
  const stale = typeof data.expiresAt === 'number' && Date.now() > data.expiresAt;
  const url = typeof data.url === 'string' && /^\/ticket#t=[a-f0-9]{64}$/.test(data.url) ? data.url : '/ticket';
  event.waitUntil(self.registration.showNotification(stale ? 'Periksa antrean Bari Ramen' : data.title || 'Bari Ramen', {
    body: stale ? 'Status antrean mungkin sudah berubah. Buka tiket untuk melihat informasi terbaru.' : data.body || 'Ada pembaruan untuk antrean Anda. Silakan buka tiket.',
    icon: '/pwa-icon?v=bari-logo-1', badge: '/pwa-icon?v=bari-logo-1', tag: data.tag || 'bari-ticket',
    data: { url }, vibrate: [180, 80, 180],
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url;
  const url = new URL(typeof target === 'string' && /^\/ticket#t=[a-f0-9]{64}$/.test(target) ? target : '/ticket', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    const existing = windows.find(client => client.url === url);
    if (existing) return existing.focus();
    return self.clients.openWindow(url);
  }));
});
