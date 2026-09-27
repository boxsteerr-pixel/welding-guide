import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("installs the core update without downloading all step images first", async function() {
  const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  const handlers = new Map();
  let imageAttempts = 0;
  const cache = {
    async addAll() {},
    async put() {},
    async match() { return undefined; }
  };
  const context = {
    URL,
    Response,
    caches: {
      async open() { return cache; },
      async keys() { return []; }
    },
    fetch: async function(request) {
      const url = String(request);
      if (url.endsWith("index.html")) {
        return new Response('<img src="assets/missing-step.png">', { status: 200 });
      }
      if (url.includes("missing-step.png")) {
        imageAttempts += 1;
        throw new TypeError("image download failed");
      }
      return new Response("", { status: 200 });
    },
    self: {
      location: { href: "https://example.test/welding-guide/service-worker.js", origin: "https://example.test" },
      addEventListener: function(type, handler) { handlers.set(type, handler); },
      clients: { claim: async function() {} },
      skipWaiting: function() {}
    }
  };

  vm.runInNewContext(source, context, { filename: "service-worker.js" });
  let installPromise;
  handlers.get("install")({ waitUntil: function(promise) { installPromise = promise; } });

  await installPromise;
  assert.equal(imageAttempts, 0);
});

test("retries a transient step image download before completing installation", async function() {
  const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  const handlers = new Map();
  const cachedUrls = [];
  let imageAttempts = 0;
  const cache = {
    async addAll() {},
    async put(request) { cachedUrls.push(String(request)); },
    async match() { return undefined; }
  };
  const context = {
    URL,
    Response,
    caches: {
      async open() { return cache; },
      async keys() { return []; }
    },
    fetch: async function(request) {
      const url = String(request);
      if (url.endsWith("index.html")) {
        return new Response('<img src="assets/transient-step.png">', { status: 200 });
      }
      if (url.includes("transient-step.png")) {
        imageAttempts += 1;
        if (imageAttempts === 1) { throw new TypeError("temporary mobile network failure"); }
      }
      return new Response("image", { status: 200 });
    },
    self: {
      location: { href: "https://example.test/welding-guide/service-worker.js", origin: "https://example.test" },
      addEventListener: function(type, handler) { handlers.set(type, handler); },
      clients: { claim: async function() {} },
      skipWaiting: function() {}
    }
  };

  vm.runInNewContext(source, context, { filename: "service-worker.js" });
  let installPromise;
  handlers.get("install")({ waitUntil: function(promise) { installPromise = promise; } });

  await installPromise;
  imageAttempts = 0;
  let mediaCachePromise;
  handlers.get("message")({
    data: { type: "CACHE_MEDIA" },
    waitUntil: function(promise) { mediaCachePromise = promise; }
  });
  await mediaCachePromise;
  assert.equal(imageAttempts, 2);
  assert.equal(cachedUrls.some(function(url) { return url.includes("transient-step.png"); }), true);
});

test("renders visual step images with mobile-friendly lazy decoding", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const visualStepTemplate = html.match(/<img class="visual-step-img"[^>]+>/);
  assert.ok(visualStepTemplate, "visual step image template should exist");
  assert.match(visualStepTemplate[0], /loading="lazy"/);
  assert.match(visualStepTemplate[0], /decoding="async"/);
});

test("uses compact versioned files for visual procedure images", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const stepImages = Array.from(html.matchAll(/\bimage\s*:\s*(["'])(.*?)\1/g), function(match) {
    return match[2];
  });

  const optimizedImages = stepImages.filter(function(source) {
    return /^assets\/steps\/[^?]+\.webp\?v=1\.0\.23$/.test(source);
  });

  assert.equal(optimizedImages.length, 18, "all procedure steps should use compact versioned WebP files");
  assert.ok(Buffer.byteLength(html, "utf8") < 8 * 1024 * 1024, "the entry page must stay lightweight for mobile loading");
});

test("defers background media caching so it does not compete with the first opened step", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const pwaBlock = html.match(/navigator\.serviceWorker\.ready\.then\(function\(registration\) \{[\s\S]*?\}\)\.catch\(function\(\) \{\}\);/);
  assert.ok(pwaBlock, "PWA media cache block should exist");
  assert.match(pwaBlock[0], /window\.setTimeout/);
  assert.match(pwaBlock[0], /15000/);
});
