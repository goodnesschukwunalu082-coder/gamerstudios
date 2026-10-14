const CACHE_NAME = 'gamer-studio-shell-v17';
const APP_SHELL = [
  './index.html',
  './dashboard.html',
  './manifest.webmanifest',
  './gamer-studio-mark.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('gamer-studio-shell-') && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) {
    console.error('Received a push notification without a payload.');
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (error) {
    console.error('Received an invalid push notification payload:', error);
    return;
  }

  if (payload.type !== 'direct_message' || !payload.senderId || !payload.senderName || !payload.body) {
    console.error('Received an incomplete direct-message push notification.');
    return;
  }

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (clients.some((client) => client.focused)) return;

    const appIcon = new URL('./gamer-studio-mark.svg', self.registration.scope).href;
    await self.registration.showNotification(payload.senderName, {
      body: payload.body,
      icon: appIcon,
      badge: appIcon,
      tag: payload.messageId || `direct-message-${payload.senderId}`,
      data: { senderId: payload.senderId },
      renotify: true
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const senderId = event.notification.data?.senderId;
  const appURL = new URL('./index.html', self.registration.scope);
  if (senderId) appURL.searchParams.set('chat', senderId);

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const scopePath = new URL(self.registration.scope).pathname;
    const appClient = clients.find((client) => (
      new URL(client.url).origin === appURL.origin
      && new URL(client.url).pathname === appURL.pathname
      && new URL(client.url).pathname.startsWith(scopePath)
    ));
    if (appClient) {
      await appClient.focus();
      if (senderId) appClient.postMessage({ type: 'OPEN_DIRECT_MESSAGE', senderId });
      return;
    }
    await self.clients.openWindow(appURL.href);
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET'
    || url.origin !== self.location.origin
    || url.pathname.includes('/.netlify/functions/')
  ) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const appShell = await caches.match('./index.html');
          if (appShell) return appShell;
        }
        return Response.error();
      })
  );
});
