// Service worker de InOut Mail: recibe los avisos de correo nuevo
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  var title = data.title || "InOut Mail";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/192",
      data: { url: data.url || "/inbox" },
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/inbox";
  event.waitUntil(
    (async function () {
      var all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (var i = 0; i < all.length; i++) {
        var c = all[i];
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) {
            try {
              await c.navigate(url);
            } catch (e) {}
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
