/* 오늘선생·오늘학생 공용 서비스워커 — 푸시 알림 전용 (캐싱 안 함) */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', function(e){
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch(err) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || '오늘';
  const opts = {
    body: d.body || '',
    icon: d.icon || './icon-student.png',
    badge: d.icon || './icon-student.png',
    tag: d.tag || 'oneul',
    renotify: true,
    data: { url: d.url || './' }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(list){
      for (const c of list) {
        if (c.url.indexOf(url.replace('./','')) >= 0 && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
