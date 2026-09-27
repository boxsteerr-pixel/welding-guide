import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("does not install a new cache when a discovered step image cannot be cached", async function() {
  const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  const handlers = new Map();
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

  await assert.rejects(installPromise, /image download failed/);
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
  assert.equal(imageAttempts, 2);
  assert.equal(cachedUrls.some(function(url) { return url.includes("transient-step.png"); }), true);
});
