const CACHE_NAME = "handover-app-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // The document shell is required for offline launches. Optional files are
      // cached independently so one missing icon cannot abort the whole install.
      await cache.add(new Request("/", { cache: "reload" }));
      await Promise.allSettled(
        APP_SHELL.slice(1).map((url) =>
          cache.add(new Request(url, { cache: "reload" })),
        ),
      );
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    }),
  );
});

function offlineResponse(request) {
  if (request.mode === "navigate") {
    return new Response(
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>英文交班报告生成器</title>
    <style>
      body{margin:0;padding:32px;font:17px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#17324d;background:#f3f7fb}
      main{max-width:520px;margin:15vh auto;padding:28px;border-radius:18px;background:#fff;box-shadow:0 12px 35px #17324d1a}
      h1{font-size:22px;margin:0 0 12px}p{margin:0}
    </style>
  </head>
  <body><main><h1>暂时无法打开</h1><p>当前设备还没有完整的离线缓存。请联网打开一次网页，等待页面显示后再重试。</p></main></body>
</html>`,
      {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }

  return new Response("", {
    status: 503,
    statusText: "Offline",
  });
}

async function cachedResponse(request) {
  const exactMatch = await caches.match(request, { ignoreSearch: true });
  if (exactMatch) return exactMatch;
  if (request.mode === "navigate") {
    return (await caches.match("/", { ignoreSearch: true })) || null;
  }
  return null;
}

async function networkFirst(event) {
  const { request } = event;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const copy = response.clone();
      event.waitUntil(
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, copy))
          .catch(() => undefined),
      );
      return response;
    }

    return (await cachedResponse(request)) || response || offlineResponse(request);
  } catch {
    return (await cachedResponse(request)) || offlineResponse(request);
  }
}

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    requestUrl.origin !== self.location.origin
  ) {
    return;
  }

  // networkFirst always resolves to a Response, never null/undefined.
  event.respondWith(networkFirst(event));
});
