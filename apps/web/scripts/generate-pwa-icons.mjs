import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const publicPwaDir = path.join(webRoot, "public", "pwa");
const logoMarkPath = path.join(webRoot, "public", "logo-mark.svg");

const sizes = [
  { name: "icon-192.png", size: 192, padding: 28 },
  { name: "icon-512.png", size: 512, padding: 72 },
  { name: "apple-touch-icon.png", size: 180, padding: 26 },
];

const svg = await readFile(logoMarkPath, "utf8");
const brandSvg = svg.replace(/class="cyclops-mark"/g, 'fill="#0052FF"').replace(/<style[\s\S]*?<\/style>/, "");

await mkdir(publicPwaDir, { recursive: true });

for (const { name, size, padding } of sizes) {
  const inner = size - padding * 2;
  const raster = await sharp(Buffer.from(brandSvg))
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 10, g: 11, b: 13, alpha: 1 },
    },
  })
    .composite([{ input: raster, gravity: "center" }])
    .png()
    .toFile(path.join(publicPwaDir, name));

  console.log(`wrote public/pwa/${name}`);
}
