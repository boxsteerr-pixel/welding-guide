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

  assert.equal(optimizedImages.length, 17, "all procedure steps should use compact versioned WebP files");
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

test("includes the dedicated tool image for guide-wheel slag cleaning", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const item = html.match(/\{ id: "guide-wheel",[\s\S]*?mediaVideos: \[\] \}/);

  assert.ok(item, "guide-wheel slag cleaning maintenance item should exist");
  assert.match(item[0], /assets\/steps\/guide-wheel-cleaning-tool\.webp\?v=1\.0\.29/);
});

test("adds per-shift welding-car underside and rail inspection with supplied images", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const item = html.match(/\{ id: "welding-car-underside-check",[\s\S]*?mediaVideos: \[\] \}/);

  assert.ok(item, "welding-car underside inspection maintenance item should exist");
  assert.match(item[0], /title: "焊接小车底部检查"/);
  assert.match(item[0], /frequency: "1次\/班"/);
  assert.match(item[0], /将焊接小车开到操作侧，检查小车底部及两侧轨道。/);
  assert.match(item[0], /如有异物，及时清理。/);
  const location = item[0].indexOf("assets/steps/welding-car-underside-check-1.webp?v=1.0.31");
  const inspection = item[0].indexOf("assets/steps/welding-car-underside-check-2.webp?v=1.0.31");
  assert.ok(location >= 0 && inspection > location, "supplied inspection images should remain in order");
});

test("includes damaged and normal references for protective-gas nozzle cleaning", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const item = html.match(/\{ id: "gas-nozzle",[\s\S]*?mediaVideos: \[\] \}/);

  assert.ok(item, "protective-gas nozzle maintenance item should exist");
  const damaged = item[0].indexOf("assets/steps/gas-nozzle-damaged.webp?v=1.0.27");
  const normal = item[0].indexOf("assets/steps/gas-nozzle-normal.webp?v=1.0.27");
  assert.ok(damaged >= 0 && normal > damaged, "damaged nozzle image should precede the normal nozzle image");
});

test("adds QCDS weld-imaging troubleshooting steps in the supplied order", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const start = html.indexOf('{ id: "qcds-weld-imaging"');
  const end = html.indexOf('{ id: "feed-roll-position"', start);
  const item = html.slice(start, end);

  assert.ok(start >= 0 && end > start, "QCDS weld-imaging fault item should exist before feed-roll positioning");
  const curve = item.indexOf('assets/steps/qcds-weld-imaging-step-1.webp?v=1.0.30');
  const alarm = item.indexOf('assets/steps/qcds-weld-imaging-step-2.webp?v=1.0.30');
  const camera = item.indexOf('assets/steps/qcds-weld-imaging-step-3.webp?v=1.0.30');
  assert.ok(curve >= 0 && alarm > curve && camera > alarm, "QCDS weld-imaging images should follow the supplied order");
});

test("replaces only the last clamp-platform procedure image", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const start = html.indexOf("function attachClampPlatformSteps()");
  const end = html.indexOf("function renderMaintenance()", start);
  const steps = html.slice(start, end);

  assert.ok(start >= 0 && end > start, "clamp-platform procedure should exist");
  assert.match(steps, /clamp-platform-step-1\.webp\?v=1\.0\.23/);
  assert.match(steps, /clamp-platform-step-5\.webp\?v=1\.0\.23/);
  assert.match(steps, /clamp-platform-step-6\.webp\?v=1\.0\.32/);
  assert.equal((steps.match(/image: '/g) || []).length, 6, "clamp-platform procedure should retain all six steps");
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
  const worker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  const release = worker.match(/const APP_VERSION = "([^"]+)"/);
  assert.ok(release, "worker should declare its release version");
  assert.ok(html.includes("版本：V" + release[1] + "<br>"), "visible page version should match the deployed cache version");
});

test("removes the four retired fault entries", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  ["welding-car", "centering", "clamping-table-short-stroke", "leveling-roll"].forEach(function(id) {
    assert.doesNotMatch(html, new RegExp('id: "' + id + '"'), id + " should not remain in the fault list");
  });
});

test("does not show the retired forced-pull warning in secondary scrap cleaning", async function() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /卡死废边不得强拉，应通知点检确认。/);
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
