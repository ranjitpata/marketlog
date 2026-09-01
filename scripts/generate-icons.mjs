/**
 * Generates the MarketLog PWA icon set from public/icons/icon.svg using sharp:
 *   - pwa-192.png / pwa-512.png (any + maskable purpose)
 *   - apple-touch-icon.png (180, opaque, no transparency)
 *   - favicon fallbacks
 * Run: npm run icons  (node scripts/generate-icons.mjs)
 */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(new URL(import.meta.url)));
const iconsDir = path.join(root, "..", "public", "icons");
const svg = path.join(iconsDir, "icon.svg");

async function render(size, out, { opaque = false } = {}) {
  let img = sharp(svg).resize(size, size);
  if (opaque) {
    // Flatten onto the brand green so iOS never renders a black square.
    img = img.flatten({ background: "#155f45" });
  }
  await img.png().toFile(path.join(iconsDir, out));
  console.log(`✓ ${out} (${size}×${size})`);
}

await render(192, "pwa-192.png");
await render(512, "pwa-512.png");
await render(512, "maskable-512.png"); // full-bleed square is already safe-zone friendly
await render(180, "apple-touch-icon.png", { opaque: true });
await render(96, "favicon-96.png");
console.log("Icon set generated.");
