import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, basename } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const indexUrl = new URL("../index.html", import.meta.url);
const assetsUrl = new URL("../assets/", import.meta.url);
const outputUrl = new URL("../assets/steps/", import.meta.url);
const sources = [
  "clamp-platform-step-1.png", "clamp-platform-step-2.png", "clamp-platform-step-3.png",
  "clamp-platform-step-4.png", "clamp-platform-step-5.png", "clamp-platform-step-6.png",
  "laser-chiller-switch-step-1.png", "laser-chiller-switch-step-2.png", "laser-chiller-switch-step-3.png",
  "qcds-penetration-exposure-step-1.png", "qcds-penetration-exposure-step-2.png", "qcds-penetration-exposure-step-3.png",
  "qcds-penetration-exposure-step-4.png", "qcds-penetration-exposure-step-5.png", "qcds-penetration-exposure-step-6.png",
  "qcds-penetration-exposure-step-7.png", "feed-roll-position-step-1.jpg", "feed-roll-position-step-2.png"
];

function mimeType(filename) {
  return extname(filename).toLowerCase() === ".jpg" ? "image/jpeg" : "image/png";
}

function runFfmpeg(input, output) {
  return new Promise(function(resolve, reject) {
    const process = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-c:v", "libwebp", "-q:v", "95", "-compression_level", "6", output], { stdio: "inherit" });
    process.once("error", reject);
    process.once("exit", function(code) {
      code === 0 ? resolve() : reject(new Error(`ffmpeg failed for ${input}`));
    });
  });
}

await mkdir(outputUrl, { recursive: true });
let html = await readFile(indexUrl, "utf8");

for (const source of sources) {
  const filename = `${basename(source, extname(source))}.webp`;
  const optimizedPath = `assets/steps/${filename}?v=1.0.23`;
  const bytes = await readFile(new URL(source, assetsUrl));
  const embedded = `data:${mimeType(source)};base64,${bytes.toString("base64")}`;

  if (html.includes(embedded)) html = html.replace(embedded, optimizedPath);
  else if (!html.includes(optimizedPath)) throw new Error(`Missing step image reference for ${source}`);

  await runFfmpeg(fileURLToPath(new URL(source, assetsUrl)), fileURLToPath(new URL(filename, outputUrl)));
}

await writeFile(indexUrl, html, "utf8");
console.log(`Optimized ${sources.length} procedure images.`);
