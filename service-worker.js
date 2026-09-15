/*
 * 操作工快速指导：GitHub Pages 子目录安全的离线缓存。
 * 日常发布只需改 index.html 内容，并将 APP_VERSION 递增后一起发布。
 */
const APP_VERSION = "1.0.3";
const CACHE_PREFIX = "operator-guide-";
const CACHE_NAME = CACHE_PREFIX + APP_VERSION;
const APP_ROOT = new URL("./", self.location.href);

/* 这些是离线重新打开手册所必需的核心资源，必须全部成功才会安装新版。 */
const CORE_ASSETS = [
  "",
  "index.html",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png"
].map(function(path) {
  return new URL(path, APP_ROOT).toString();
});

function isCacheable(response) {
  return response && response.ok && response.type !== "opaque";
}

async function addToCurrentCache(request, response) {
  if (isCacheable(response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

/* 从新版 index.html 发现同源图片、视频、音频等资源。内嵌 Base64 内容不需要额外缓存。 */
function discoverLocalAssets(html) {
  const urls = [];
  const attributePattern = /(?:src|poster|href)=["']([^"']+)["']/gi;
  let match;
  while ((match = attributePattern.exec(html))) {
    const value = match[1];
    if (!/^data:|^#|^javascript:/i.test(value)) { urls.push(value); }
  }
  const cssPattern = /url\(["']?([^"')]+)["']?\)/gi;
  while ((match = cssPattern.exec(html))) {
    const value = match[1];
    if (!/^data:|^#|^javascript:/i.test(value)) { urls.push(value); }
  }
  return Array.from(new Set(urls)).map(function(value) {
    try {
      const url = new URL(value, APP_ROOT);
      return url.origin === self.location.origin ? url.toString() : null;
    } catch (error) {
      return null;
    }
  }).filter(Boolean);
}

/* 非核心媒体逐项尽力缓存；其中任意文件失败都不能影响离线手册主体。 */
async function cacheDiscoveredAssets(cache) {
  try {
    const response = await fetch(new URL("index.html", APP_ROOT).toString(), { cache: "no-store" });
    if (!response.ok) { return; }
    const requests = discoverLocalAssets(await response.text());
    await Promise.all(requests.map(async function(url) {
      try {
        const asset = await fetch(url, { cache: "no-store" });
        if (isCacheable(asset)) { await cache.put(url, asset.clone()); }
      } catch (error) {
        /* 单个独立媒体失败时，保留已完成的核心离线版本。 */
      }
    }));
  } catch (error) {
    /* 核心资源已经成功缓存，媒体发现失败不阻止安装。 */
  }
}

async function networkFirst(request) {
  try {
    return await addToCurrentCache(request, await fetch(request));
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(request)) ||
      (await cache.match(new URL("index.html", APP_ROOT).toString())) ||
      (await cache.match(new URL("", APP_ROOT).toString()));
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) { return cached; }
  return addToCurrentCache(request, await fetch(request));
}

self.addEventListener("install", function(event) {
  event.waitUntil((async function() {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await cacheDiscoveredAssets(cache);
  })());
});

self.addEventListener("activate", function(event) {
  event.waitUntil((async function() {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(function(cacheName) {
      return cacheName.indexOf(CACHE_PREFIX) === 0 && cacheName !== CACHE_NAME
        ? caches.delete(cacheName)
        : undefined;
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("message", function(event) {
  if (event.data && event.data.type === "SKIP_WAITING") { self.skipWaiting(); }
});

self.addEventListener("fetch", function(event) {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) { return; }

  if (request.mode === "navigate" || request.destination === "document" || request.destination === "script" || request.destination === "style" || request.destination === "manifest") {
    event.respondWith(networkFirst(request));
    return;
  }
  if (request.destination === "image" || request.destination === "font" || request.destination === "video" || request.destination === "audio") {
    event.respondWith(cacheFirst(request));
  }
});
