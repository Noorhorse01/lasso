// Draws the app icons as PNG files, with no image libraries. Run: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(out, { recursive: true });

const BG = [27, 20, 48], DUSK = [109, 47, 92], ROPE = [239, 194, 122], DARK = [138, 90, 44], LIGHT = [255, 230, 184], GOLD = [255, 215, 102], CORAL = [255, 138, 92];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (edge, d) => Math.max(0, Math.min(1, 0.5 - d / edge));

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function bezier(p0, p1, p2, p3, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, m = 1 - t;
    out.push([0, 1].map((k) => m * m * m * p0[k] + 3 * m * m * t * p1[k] + 3 * m * t * t * p2[k] + t * t * t * p3[k]));
  }
  return out;
}
const TAIL = bezier([0.3, 0.52], [0.13, 0.66], [0.46, 0.72], [0.3, 0.83], 24)
  .concat(bezier([0.3, 0.83], [0.25, 0.87], [0.19, 0.89], [0.13, 0.9], 10));
const KNOT = [0.3, 0.52], CX = 0.56, CY = 0.33, A = 0.32, B = 0.2;

function ellipseDistance(x, y) {
  const f = Math.max(1e-6, Math.sqrt((x * x) / (A * A) + (y * y) / (B * B)));
  const grad = Math.max(1e-6, Math.sqrt((x * x) / (A ** 4) + (y * y) / (B ** 4)) / f);
  return Math.abs(f - 1) / grad;
}

function pixel(px, py, aa) {
  let color = mix(BG, DUSK, Math.max(0, (py - 0.45) / 0.55) * 0.9);
  // Shrunk toward the middle so nothing is cut off by a rounded home-screen mask.
  const u = 0.5 + (px - 0.5) / 0.82, v = 0.5 + (py - 0.5) / 0.82;
  const half = 0.058;
  const ex = u - CX, ey = v - CY;
  const inside = Math.sqrt((ex * ex) / (A * A) + (ey * ey) / (B * B)) < 1;
  if (inside) color = mix(color, GOLD, 0.14);

  const ringD = ellipseDistance(ex, ey);
  let tailD = 9, tailAt = 0;
  for (let i = 0; i + 1 < TAIL.length; i++) {
    const d = segmentDistance(u, v, TAIL[i][0], TAIL[i][1], TAIL[i + 1][0], TAIL[i + 1][1]);
    if (d < tailD) { tailD = d; tailAt = i; }
  }
  const d = Math.min(ringD, tailD);
  const shade = smooth(aa, d - half);
  if (shade > 0) {
    const stripe = ringD < tailD ? Math.sin(Math.atan2(ey / B, ex / A) * 22 + (ringD * 40)) : Math.sin(tailAt * 2.2 + tailD * 40);
    let rope = mix(ROPE, DARK, stripe > 0.45 ? 0.5 : 0);
    rope = mix(rope, LIGHT, 0.45 * smooth(aa, d - half * 0.22));
    rope = mix(rope, DARK, 1 - smooth(aa, d - half * 0.78));
    color = mix(color, rope, shade);
  }
  const knotD = Math.hypot(u - KNOT[0], v - KNOT[1]);
  color = mix(color, [42, 26, 34], smooth(aa, knotD - 0.082));
  color = mix(color, CORAL, smooth(aa, knotD - 0.066));
  return color;
}

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const aa = 2 / size;
  let at = 0;
  for (let y = 0; y < size; y++) {
    raw[at++] = 0;
    for (let x = 0; x < size; x++) {
      const c = pixel((x + 0.5) / size, (y + 0.5) / size, aa);
      raw[at++] = Math.round(c[0]); raw[at++] = Math.round(c[1]); raw[at++] = Math.round(c[2]);
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [180, 192, 512]) writeFileSync(join(out, `icon-${size}.png`), png(size));
console.log('icons written to', out);
