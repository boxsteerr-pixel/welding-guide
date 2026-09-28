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

test("includes daily 5MM guide-wheel gap lubrication with both reference images", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const item = html.match(/\{ id: "guide-wheel-gap-lubrication",[\s\S]*?mediaVideos: \[\] \}/);

  assert.ok(item, "guide-wheel lubrication maintenance item should exist");
  assert.match(item[0], /title: "入出口导向轮5MM缝隙润滑"/);
  assert.match(item[0], /purposeHighlight: "入出口共有4个导向杆"/);
  assert.match(item[0], /frequency: "1次\/日"/);
  assert.match(item[0], /assets\/steps\/guide-wheel-gap-lubrication-1\.webp\?v=1\.0\.24/);
  assert.match(item[0], /assets\/steps\/guide-wheel-gap-lubrication-2\.webp\?v=1\.0\.24/);
  assert.match(html, /class="purpose-highlight"/, "maintenance purpose highlights should have a dedicated red style");
});

test("includes damaged and normal references for protective-gas nozzle cleaning", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const item = html.match(/\{ id: "gas-nozzle",[\s\S]*?mediaVideos: \[\] \}/);

  assert.ok(item, "protective-gas nozzle maintenance item should exist");
  const damaged = item[0].indexOf("assets/steps/gas-nozzle-damaged.webp?v=1.0.27");
  const normal = item[0].indexOf("assets/steps/gas-nozzle-normal.webp?v=1.0.27");
  assert.ok(damaged >= 0 && normal > damaged, "damaged nozzle image should precede the normal nozzle image");
});

test("adds temporary manual scrap handling steps for double-shear belt faults", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const start = html.indexOf('{ id: "double-shear-belt"');
  const end = html.indexOf('{ id: "laser-chiller-switch"', start);
  const item = html.slice(start, end);

  assert.ok(start >= 0 && end > start, "double-shear belt fault item should exist");
  assert.match(item, /productionAllowed: "视情况"/);
  assert.match(item, /皮带失效或打滑时，可先将电磁阀插头拔掉，暂时人工处理废料。/);
  const beltCheck = item.indexOf('assets/steps/double-shear-belt-step-0.webp?v=1.0.26');
  const valveGroup = item.indexOf('assets/steps/double-shear-belt-step-1.webp?v=1.0.25');
  const connector = item.indexOf('assets/steps/double-shear-belt-step-2.webp?v=1.0.25');
  assert.ok(beltCheck >= 0 && valveGroup > beltCheck && connector > valveGroup, "reference images should follow the supplied order");
  assert.match(html, /版本：V1\.0\.28/, "visible page version should match the deployed cache version");
});

test("removes the four retired fault entries", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  ["welding-car", "centering", "clamping-table-short-stroke", "leveling-roll"].forEach(function(id) {
    assert.doesNotMatch(html, new RegExp('id: "' + id + '"'), id + " should not remain in the fault list");
  });
});

test("uses only existing fault entries in the home common-treatment list", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const commonList = html.match(/var common = \[([^\]]+)\];/);
  const faultIds = new Set(Array.from(html.matchAll(/\{ id: "([^"]+)"/g), function(match) { return match[1]; }));

  assert.ok(commonList, "home common-treatment list should exist");
  Array.from(commonList[1].matchAll(/"([^"]+)"/g), function(match) { return match[1]; }).forEach(function(id) {
    assert.ok(faultIds.has(id), "home common-treatment item " + id + " must exist in faultItems");
  });
});

test("defers background media caching so it does not compete with the first opened step", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const pwaBlock = html.match(/navigator\.serviceWorker\.ready\.then\(function\(registration\) \{[\s\S]*?\}\)\.catch\(function\(\) \{\}\);/);
  assert.ok(pwaBlock, "PWA media cache block should exist");
  assert.match(pwaBlock[0], /window\.setTimeout/);
  assert.match(pwaBlock[0], /15000/);
});
