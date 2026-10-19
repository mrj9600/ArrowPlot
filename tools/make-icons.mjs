// Generates every app icon from tools/logo.svg.  Run with: npm run icons
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const root = new URL('..', import.meta.url);
const out = (p) => new URL(`public/${p}`, root);
const fullBleed = readFileSync(new URL('tools/logo.svg', root), 'utf8');

// "any" variant: same artwork clipped to a rounded tile with transparent corners.
const rounded = fullBleed
  .replace('<defs>', '<defs><clipPath id="tile"><rect width="512" height="512" rx="112"/></clipPath>')
  .replace(/(<rect width="512" height="512" fill="url\(#bg\)"\/>)/, '<g clip-path="url(#tile)">$1')
  .replace(/<\/svg>\s*$/, '</g></svg>\n');

mkdirSync(out('icons'), { recursive: true });
writeFileSync(out('logo.svg'), rounded);
writeFileSync(out('icons/favicon.svg'), rounded);

const png = (svg, size) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toBuffer();

for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
  writeFileSync(out(`icons/icon-${size}x${size}.png`), await png(rounded, size));
}
for (const size of [192, 512]) {
  writeFileSync(out(`icons/maskable-${size}x${size}.png`), await png(fullBleed, size));
}
writeFileSync(out('icons/apple-touch-icon.png'), await png(fullBleed, 180));

// favicon.ico holding PNG images (supported by every current browser).
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((s) => png(rounded, s)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e);
  header.writeUInt8(s, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(images[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
writeFileSync(out('favicon.ico'), Buffer.concat([header, ...images]));
console.log('Icons written to public/');
