/**
 * Rasterize avatar source art into small, bundle-friendly images.
 *
 * Reads every SVG in `./avatars/` (repo root) and writes a 192px PNG for each
 * into `client/src/assets/avatars/`, which the client auto-discovers (see
 * client/src/avatars.ts). Avatars never render larger than ~80px, so full-size
 * source art (some of ours is multi-MB raster-in-SVG) would just bloat the
 * bundle — this shrinks each to ~20 KB.
 *
 * Usage (regenerate after adding/replacing source SVGs):
 *   npm i -D sharp   # one-time; not a saved dependency to keep installs lean
 *   npm run build-avatars
 */
import { readdirSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('This script needs "sharp". Install it once with:\n  npm i -D sharp\n');
  process.exit(1);
}

const SIZE = 192;
const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'avatars');
const outDir = join(here, '..', 'client', 'src', 'assets', 'avatars');

let files;
try {
  files = readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith('.svg')).sort();
} catch {
  console.error(`No source folder at ${srcDir}. Put avatar SVGs there first.`);
  process.exit(1);
}
if (files.length === 0) {
  console.error(`No SVGs found in ${srcDir}.`);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let total = 0;
for (const f of files) {
  const id = f.replace(/\.svg$/i, '');
  const dest = join(outDir, `${id}.png`);
  const info = await sharp(join(srcDir, f), { density: 200 })
    .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(dest);
  total += info.size;
  console.log(`${f} -> ${id}.png (${Math.round(info.size / 1024)} KB)`);
}
console.log(`\n${files.length} avatars, ${Math.round(total / 1024)} KB total -> ${outDir}`);
