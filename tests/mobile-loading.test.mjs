import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
test('extracts original photos without modifying their bytes', async () => {
 const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
 const hashes = ['b89c00c82176ee21bf5011bced98100570ff3acf4a6021352fa6951eb4d7d965','8a4b49b3161a666aafa25acf4609948cb1ceaa8e4b78066f854101f0adf2ff6a','3acc33ec67201d540468b4150c5fe452d10ad0d2f2b22a0e8293dee41ef9c63d','6ee40a4cc6ac01371fe1723420e05e7d37b473c29ff2abb1d29c83a41ca4c63a','2e41f38fc848aea960cac86d3a8e7910ef3a3f8a36dbbf01858712944e22f883','380a973fb5944c4467d46e487f6ea6cdfaef95a3d561bd850fe49019a97e1964','4dce560ce333f53455210941c7f0b52fdf59e753e797192b0f682c63bd15e445','73b42338ae8209696d66153f820db1c394702f83b454ac143d06f5ce2035b66b'];
 assert.doesNotMatch(html, /data:image\/(?:jpeg|png);base64,/);
 assert.ok(Buffer.byteLength(html) < 150000);
 for (let i = 0; i < hashes.length; i++) {
  const path = `assets/original/guide-photo-${i + 1}.jpg`;
  assert.ok(html.includes(path));
  const bytes = await readFile(new URL(`../${path}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hashes[i]);
 }
});
test('safety photos load lazily and decode asynchronously', async () => {
 const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
 const start = html.indexOf('function renderSafety()');
 const safety = html.slice(start, html.indexOf('function ', start + 10));
 assert.match(safety, /<img class="pin-img" loading="lazy" decoding="async"/);
});
import vm from 'node:vm';
test('offline media discovery includes all extracted photos', async () => {
 const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
 const source = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
 const context = { URL, self: { location: { href: 'https://example.test/manual/service-worker.js', origin: 'https://example.test' }, addEventListener() {} } };
 vm.runInNewContext(source, context);
 const discovered = context.discoverLocalAssets(html);
 for (let i = 1; i <= 8; i++) assert.ok(discovered.some(url => url.includes(`/assets/original/guide-photo-${i}.jpg`)));
});
