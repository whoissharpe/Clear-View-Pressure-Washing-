/**
 * Clear View - "logo pressure-washed into the driveway" frame builder
 * -----------------------------------------------------------------------------
 * Builds the END frame for the hero loop: the dirty driveway with the Clear View
 * mark revealed in clean concrete, as though it had just been washed in.
 *
 * It is a real composite, not a prompt: the mark is warped onto the driveway's
 * ground plane with a homography so it sits in perspective, then used as a mask
 * to reveal the clean plate through the dirty one. That guarantees the shape is
 * exactly the client's logo rather than something a model approximated.
 *
 *   node scripts/wash-logo.mjs
 *
 * Inputs   assets/design/wash-dirty.png   dirty driveway plate
 *          assets/design/wash-clean.png   same driveway, washed clean
 *          assets/brand/logo-mark.svg     the traced mark
 * Output   assets/design/wash-logo.png    the end frame
 *          assets/design/wash-mask.png    the warped mask (for inspection)
 */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const DIRTY = 'assets/design/wash-dirty.png';
const CLEAN = 'assets/design/wash-clean.png';
const OUT = 'assets/design/wash-logo.png';

/* Destination quad on the driveway plane, in source-image pixels, clockwise
   from the top-left. The near edge is wider than the far edge because the
   plane recedes from the camera. Placed on the RIGHT of the driveway so the
   mark lands in the open part of the hero rather than behind the copy. */
const QUAD = [
  [1180, 735],  // far  left
  [2180, 735],  // far  right
  [2620, 1250], // near right
  [880, 1250],  // near left
];

const FEATHER = 6;      // px blur on the mask edge, so it reads as washed not cut
const EDGE_DARKEN = 0.55; // strength of the damp rim just inside the clean area
const CLEAN_LIFT = 1.06;  // freshly washed concrete reads a touch brighter

/* ---- solve an 8x8 system by Gaussian elimination -------------------------- */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (!f) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map(r => r[n]);
}

/* homography mapping the unit-ish source rect (w x h) onto the quad */
function homography(w, h, quad) {
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [X, Y] = quad[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
  }
  const s = solve(A, b);
  return [s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], 1];
}

function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ];
}

/* -------------------------------------------------------------------------- */
const base = sharp(DIRTY);
const meta = await base.metadata();
const W = meta.width, H = meta.height;
console.log('plate', W + 'x' + H);

/* render the mark to a flat white-on-black bitmap we can warp */
const MW = 1400;
const MH = Math.round(MW * 44.87 / 100);
const markSvg = (await readFile('assets/brand/logo-mark.svg', 'utf8'))
  .replace('fill="currentColor"', 'fill="#ffffff"');
const mark = await sharp(Buffer.from(markSvg), { density: 900 })
  .resize(MW, MH, { fit: 'fill' })
  .flatten({ background: '#000000' })
  .greyscale().raw().toBuffer();

/* warp: for each destination pixel, look up where it came from in the mark */
const Hm = homography(MW, MH, QUAD);
const Hi = invert3(Hm);
const mask = Buffer.alloc(W * H, 0);

const xs = QUAD.map(p => p[0]), ys = QUAD.map(p => p[1]);
const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(W, Math.ceil(Math.max(...xs)));
const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H, Math.ceil(Math.max(...ys)));

for (let y = y0; y < y1; y++) {
  for (let x = x0; x < x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const wgt = Hi[6] * px + Hi[7] * py + Hi[8];
    const u = (Hi[0] * px + Hi[1] * py + Hi[2]) / wgt;
    const v = (Hi[3] * px + Hi[4] * py + Hi[5]) / wgt;
    if (u < 0 || v < 0 || u >= MW - 1 || v >= MH - 1) continue;

    // bilinear sample of the mark
    const iu = Math.floor(u), iv = Math.floor(v);
    const fu = u - iu, fv = v - iv;
    const p00 = mark[iv * MW + iu], p10 = mark[iv * MW + iu + 1];
    const p01 = mark[(iv + 1) * MW + iu], p11 = mark[(iv + 1) * MW + iu + 1];
    const val = (p00 * (1 - fu) + p10 * fu) * (1 - fv) + (p01 * (1 - fu) + p11 * fu) * fv;
    mask[y * W + x] = val;
  }
}

/* Report coverage so a silently-empty mask can never pass unnoticed. */
let hits = 0;
for (let i = 0; i < mask.length; i++) if (mask[i] > 127) hits++;
console.log('mask coverage', (100 * hits / (W * H)).toFixed(2) + '% of frame');
if (hits === 0) throw new Error('warped mask is empty - check QUAD');

await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
  .png().toFile('assets/design/wash-mask.png');

/* Blur passes, kept as raw single-channel data. */
/* toColourspace('b-w') is required: sharp promotes a 1-channel raw input to
   3-channel sRGB on output, so without it .raw() returns W*H*3 bytes and any
   per-pixel index silently reads the wrong third of the image. */
const blurRaw = async (radius) => {
  const buf = await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
    .blur(radius).toColourspace('b-w').raw().toBuffer();
  if (buf.length !== W * H) {
    throw new Error('expected a single-channel mask, got ' + (buf.length / (W * H)) + ' channels');
  }
  return buf;
};

const maskSoft = await blurRaw(FEATHER);
const maskWide = await blurRaw(FEATHER * 3.5);

let softHits = 0;
for (let i = 0; i < maskSoft.length; i++) if (maskSoft[i] > 127) softHits++;
console.log('blurred mask coverage', (100 * softHits / (W * H)).toFixed(2) + '%');
if (softHits === 0) throw new Error('blurred mask is empty');

/* The final composite is done as explicit per-pixel maths rather than with
   sharp blend modes. Blend modes read the ALPHA channel of their input, so a
   greyscale mask silently masks nothing - doing the alpha blend by hand here
   removes that whole class of surprise and keeps the result predictable. */
const dirtyRaw = await sharp(DIRTY).removeAlpha().raw().toBuffer();
const cleanRaw = await sharp(CLEAN).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer();

const out = Buffer.alloc(W * H * 3);
for (let i = 0, p = 0; i < W * H; i++, p += 3) {
  const a = maskSoft[i] / 255;                         // 1 inside the mark
  const rim = Math.max(0, maskSoft[i] - maskWide[i]) / 255 * EDGE_DARKEN;
  for (let c = 0; c < 3; c++) {
    // reveal the clean plate through the mark
    const lifted = Math.min(255, cleanRaw[p + c] * CLEAN_LIFT);
    let v = dirtyRaw[p + c] * (1 - a) + lifted * a;
    // damp, slightly cooler rim just inside the edge
    v = v * (1 - rim) + (v * 0.55 + [46, 62, 78][c] * 0.45) * rim;
    out[p + c] = v;
  }
}

await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toFile(OUT);
console.log('wrote', OUT);
