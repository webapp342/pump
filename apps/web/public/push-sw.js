/* Pump — minimal iOS PWA push worker (no precache; Serwist hangs on iOS install). */
"use strict";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  var payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload = { body: event.data.text() };
    }
  }

  var title = (payload.title && String(payload.title).trim()) || "Pump";
  var body = (payload.body && String(payload.body).trim()) || "You have a new update.";
  var url = (payload.url && String(payload.url).trim()) || "/";
  var tag = (payload.tag && String(payload.tag).trim()) || "pump-notification";
  var iconUrl = new URL((payload.icon && String(payload.icon).trim()) || "/pwa/icon-192.png", self.location.origin).href;

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body: body,
        tag: tag,
        icon: iconUrl,
        badge: iconUrl,
        data: { url: url },
      })
      .catch(function () {
        return self.registration.showNotification(title, { body: body, tag: tag, data: { url: url } });
      })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  var targetUrl =
    event.notification.data && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windows) {
      for (var i = 0; i < windows.length; i++) {
        var client = windows[i];
        if ("focus" in client) {
          return client.focus().then(function () {
            if ("navigate" in client && typeof client.navigate === "function") {
              return client.navigate(targetUrl);
            }
          });
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
