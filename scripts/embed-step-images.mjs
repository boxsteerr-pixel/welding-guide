import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";

const indexUrl = new URL("../index.html", import.meta.url);
const assetsUrl = new URL("../assets/", import.meta.url);
const mimeTypes = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

let html = await readFile(indexUrl, "utf8");
const embedded = new Map();
const imageProperty = /\bimage\s*:\s*(["'])assets\/([^"'?]+)(?:\?[^"']*)?\1/g;

for (const match of html.matchAll(imageProperty)) {
  const filename = match[2];
  if (embedded.has(filename)) continue;

  const extension = extname(filename).toLowerCase();
  const mimeType = mimeTypes[extension];
  if (!mimeType) throw new Error(`Unsupported step image type: ${filename}`);

  const bytes = await readFile(new URL(filename, assetsUrl));
  embedded.set(filename, `data:${mimeType};base64,${bytes.toString("base64")}`);
}

html = html.replace(imageProperty, function(_, quote, filename) {
  return `image: ${quote}${embedded.get(filename)}${quote}`;
});

await writeFile(indexUrl, html, "utf8");
console.log(`Embedded ${embedded.size} procedure images in index.html.`);
