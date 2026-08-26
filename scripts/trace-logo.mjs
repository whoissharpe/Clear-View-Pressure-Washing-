/**
 * Clear View - logo vectoriser
 * -----------------------------------------------------------------------------
 * Converts the client's supplied raster logo into a clean, recolourable SVG path.
 *
 * The mark is a flat single-colour shape on a flat navy field, which is the ideal
 * case for real contour tracing (as opposed to an image trace that guesses at
 * gradients). The steps are:
 *
 *   1. classify each pixel as mark / not-mark
 *   2. marching squares over the binary field -> closed contours, holes included
 *   3. stitch the segments into loops
 *   4. Douglas-Peucker simplification to drop redundant points
 *   5. emit one path with fill-rule="evenodd" so the holes knock through
 *
 *   node scripts/trace-logo.mjs
 */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const SRC = 'assets/design/client-logo.png';
const EPSILON = 0.9;   // simplification tolerance, in source pixels

/* -- 1. classify ----------------------------------------------------------- */
/* Navy ground is ~#0A1626 (B=38). The mark is ~#2D5988..#2266AA (B=136..170).
   The wordmark is pure white (R=255). So "blue channel is high AND red is not"
   isolates the mountain and leaves both the background and the type behind. */
const isMark = (r, g, b) => b > 87 && r < 160;

/* A light median filter first: the supplied artwork has a subtly mottled
   background and a faint gradient across the mark, which would otherwise
   speckle the threshold and produce hundreds of one-pixel contours. */
const { data, info } = await sharp(SRC).median(3).ensureAlpha().raw()
  .toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;

const grid = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    grid[y * W + x] = isMark(data[i], data[i + 1], data[i + 2]) ? 1 : 0;
  }
}

/* Remove speckle: drop mark islands and fill background pin-holes below a
   minimum area. Flood fill is iterative (a stack) so it cannot blow the
   call stack on a region this large. */
function components(target) {
  const seen = new Uint8Array(W * H);
  const out = [];
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || grid[s] !== target) continue;
    const cells = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop();
      cells.push(p);
      const x = p % W, y = (p - x) / W;
      if (x > 0)     { const n = p - 1; if (!seen[n] && grid[n] === target) { seen[n] = 1; stack.push(n); } }
      if (x < W - 1) { const n = p + 1; if (!seen[n] && grid[n] === target) { seen[n] = 1; stack.push(n); } }
      if (y > 0)     { const n = p - W; if (!seen[n] && grid[n] === target) { seen[n] = 1; stack.push(n); } }
      if (y < H - 1) { const n = p + W; if (!seen[n] && grid[n] === target) { seen[n] = 1; stack.push(n); } }
    }
    out.push(cells);
  }
  return out;
}

const MIN_AREA = 400;

let dropped = 0;
for (const cells of components(1)) {
  if (cells.length >= MIN_AREA) continue;
  for (const p of cells) grid[p] = 0;
  dropped++;
}
let filled = 0;
for (const cells of components(0)) {
  if (cells.length >= MIN_AREA) continue;
  for (const p of cells) grid[p] = 1;
  filled++;
}
console.log('speckle removed:', dropped, 'islands,', filled, 'pin-holes');

/* Write the cleaned mask out so the trace can be eyeballed against the source. */
await sharp(Buffer.from(grid.map(v => (v ? 255 : 0))), { raw: { width: W, height: H, channels: 1 } })
  .png().toFile('assets/design/check-logo-mask.png');

/* trim to the mark's bounding box so the viewBox is tight */
let minX = W, minY = H, maxX = -1, maxY = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!grid[y * W + x]) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
if (maxX < 0) throw new Error('no mark pixels matched - check the isMark() thresholds');
console.log('mark bbox', { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 });

const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : grid[y * W + x];

/* -- 2. marching squares --------------------------------------------------- */
/* Corners of cell (x,y) are the samples at (x,y),(x+1,y),(x+1,y+1),(x,y+1).
   Segments run between the midpoints of the cell's edges.                    */
const key = (p) => p[0].toFixed(1) + ',' + p[1].toFixed(1);
const segments = [];

for (let y = minY - 1; y <= maxY + 1; y++) {
  for (let x = minX - 1; x <= maxX + 1; x++) {
    const tl = at(x, y), tr = at(x + 1, y), br = at(x + 1, y + 1), bl = at(x, y + 1);
    const idx = (tl << 3) | (tr << 2) | (br << 1) | bl;
    if (idx === 0 || idx === 15) continue;

    const T = [x + 0.5, y], R = [x + 1, y + 0.5], B = [x + 0.5, y + 1], L = [x, y + 0.5];
    const push = (a, b) => segments.push([a, b]);

    switch (idx) {
      case 1:  push(L, B); break;
      case 2:  push(B, R); break;
      case 3:  push(L, R); break;
      case 4:  push(T, R); break;
      case 5:  push(L, T); push(B, R); break;   // saddle, resolved consistently
      case 6:  push(T, B); break;
      case 7:  push(L, T); break;
      case 8:  push(T, L); break;
      case 9:  push(T, B); break;
      case 10: push(T, R); push(L, B); break;   // saddle, resolved consistently
      case 11: push(T, R); break;
      case 12: push(L, R); break;
      case 13: push(B, R); break;
      case 14: push(L, B); break;
    }
  }
}
console.log('segments', segments.length);

/* -- 3. stitch segments into closed loops ---------------------------------- */
const adjacency = new Map();
segments.forEach((seg, i) => {
  for (const end of [0, 1]) {
    const k = key(seg[end]);
    if (!adjacency.has(k)) adjacency.set(k, []);
    adjacency.get(k).push(i);
  }
});

const used = new Uint8Array(segments.length);
const loops = [];

for (let start = 0; start < segments.length; start++) {
  if (used[start]) continue;
  used[start] = 1;

  const loop = [segments[start][0], segments[start][1]];
  let cursor = segments[start][1];

  for (;;) {
    const candidates = adjacency.get(key(cursor)) || [];
    let next = -1;
    for (const ci of candidates) {
      if (!used[ci]) { next = ci; break; }
    }
    if (next === -1) break;

    used[next] = 1;
    const seg = segments[next];
    const other = (key(seg[0]) === key(cursor)) ? seg[1] : seg[0];
    cursor = other;
    loop.push(other);

    if (key(cursor) === key(loop[0])) break;   // closed
  }

  if (loop.length > 8) loops.push(loop);
}
console.log('loops', loops.length, 'sizes', loops.map(l => l.length).join('/'));

/* -- 4. Douglas-Peucker ---------------------------------------------------- */
function simplify(points, eps) {
  if (points.length < 3) return points;

  const dist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
  };

  const run = (pts) => {
    let maxD = 0, index = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = dist(pts[i], pts[0], pts[pts.length - 1]);
      if (d > maxD) { maxD = d; index = i; }
    }
    if (maxD > eps) {
      const left = run(pts.slice(0, index + 1));
      const right = run(pts.slice(index));
      return left.slice(0, -1).concat(right);
    }
    return [pts[0], pts[pts.length - 1]];
  };
  return run(points);
}

/* -- 5. emit --------------------------------------------------------------- */
/* Normalise into a 0..100-wide viewBox so the mark is easy to place. */
const bw = maxX - minX + 1, bh = maxY - minY + 1;
const SCALE = 100 / bw;
const VW = 100, VH = +(bh * SCALE).toFixed(2);

const fmt = (n) => {
  const v = Math.round(n * 100) / 100;
  return String(v);
};

let d = '';
let pointCount = 0;
for (const loop of loops) {
  const simplified = simplify(loop, EPSILON);
  if (simplified.length < 3) continue;
  pointCount += simplified.length;

  simplified.forEach((p, i) => {
    const X = fmt((p[0] - minX) * SCALE);
    const Y = fmt((p[1] - minY) * SCALE);
    d += (i === 0 ? 'M' : 'L') + X + ' ' + Y;
    if (i < simplified.length - 1) d += ' ';
  });
  d += 'Z';
}
console.log('points after simplify', pointCount, '| path chars', d.length);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Clear View - MOUNTAIN "CV" MARK
  Vectorised from the client's supplied artwork by contour tracing
  (scripts/trace-logo.mjs), not redrawn by hand and not an image trace.
  Single path, fill-rule evenodd, fill:currentColor so it recolours with CSS.
-->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}"
     width="${VW}" height="${VH}" role="img" aria-label="Clear View">
  <path fill="currentColor" fill-rule="evenodd" d="${d}"/>
</svg>
`;

await writeFile('assets/brand/logo-mark.svg', svg);
console.log('wrote assets/brand/logo-mark.svg  viewBox 0 0', VW, VH);
