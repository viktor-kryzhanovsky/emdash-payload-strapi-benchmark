// Deterministic abstract cover images (1200x675 JPEG) for article posters.
// SVG is rasterized with sharp, borrowed from the Payload project's node_modules.
// Usage: node data/generate-covers.mjs  ->  data/covers/cover-N.jpg
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const sharp = createRequire(new URL('../payload/package.json', import.meta.url))('sharp');

const COUNT = 6;
const W = 1200;
const H = 675;

const PALETTES = [
  ['#181834', '#3b1d6e', '#ddf218', '#3b82f6'],
  ['#0b1020', '#1e3a8a', '#60a5fa', '#ddf218'],
  ['#120b24', '#5b21b6', '#a78bfa', '#ddf218'],
  ['#09090b', '#18304f', '#22d3ee', '#3b82f6'],
  ['#1a1033', '#7c2d92', '#f472b6', '#ddf218'],
  ['#0a1a14', '#14532d', '#ddf218', '#22d3ee'],
];

// mulberry32: tiny seeded PRNG
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function svg(index) {
  const rand = rng(1000 + index);
  const between = (min, max) => Math.round(min + rand() * (max - min));
  const [bg1, bg2, accent, accent2] = PALETTES[index % PALETTES.length];

  const blobs = [accent, accent2, bg2]
    .map((color, i) =>
      `<circle cx="${between(100, W - 100)}" cy="${between(80, H - 80)}" r="${between(140, 280)}" fill="${color}" opacity="${i === 0 ? 0.55 : 0.45}" filter="url(#blur)"/>`)
    .join('');

  const cx = between(W * 0.55, W * 0.85);
  const cy = between(H * 0.3, H * 0.7);
  const rings = Array.from({ length: 6 }, (_, i) =>
    `<circle cx="${cx}" cy="${cy}" r="${60 + i * 46}" fill="none" stroke="${accent}" stroke-opacity="${0.5 - i * 0.07}" stroke-width="2"/>`)
    .join('');

  const angle = between(-35, 35);
  const stripes = Array.from({ length: 9 }, (_, i) =>
    `<rect x="${-200 + i * 70}" y="-200" width="18" height="${H + 400}" fill="#fff" opacity="0.04"/>`)
    .join('');

  const grid = Array.from({ length: 13 }, (_, i) =>
    `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="${H}"/>`).join('') +
    Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 100 + 37}" x2="${W}" y2="${i * 100 + 37}"/>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="90"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${blobs}
  <g stroke="#fff" stroke-opacity="0.06" stroke-width="1">${grid}</g>
  <g transform="rotate(${angle} ${W / 2} ${H / 2})">${stripes}</g>
  ${rings}
  <circle cx="${cx}" cy="${cy}" r="14" fill="${accent}"/>
</svg>`;
}

const dir = fileURLToPath(new URL('./covers/', import.meta.url));
mkdirSync(dir, { recursive: true });
for (let i = 1; i <= COUNT; i++) {
  const jpg = await sharp(Buffer.from(svg(i - 1))).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  writeFileSync(`${dir}cover-${i}.jpg`, jpg);
  console.log(`cover-${i}.jpg ${Math.round(jpg.length / 1024)} KB`);
}
