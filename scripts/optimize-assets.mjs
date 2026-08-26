/**
 * Clear View - asset optimisation pipeline
 * -----------------------------------------------------------------------------
 * Turns the large generated source files in assets/design/ into the small,
 * responsive, correctly-sized assets the site actually ships.
 *
 *   images : AVIF + WebP at several widths, fixed aspect ratios, cover-cropped
 *   video  : H.264 MP4 + VP9 WebM, desktop + mobile, silent, faststart
 *   icons  : favicon set + Open Graph card
 *
 * Every emitted image's intrinsic width/height is written to
 * assets/img/manifest.json so the HTML can carry explicit width/height
 * attributes, which is what keeps Cumulative Layout Shift at zero.
 *
 *   npm run assets
 */
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const run = promisify(execFile);
const SRC = 'assets/design';
const IMG = 'assets/img';
const VID = 'assets/video';

/* Quality settings. AVIF is the primary format; WebP is the fallback. */
const AVIF = { quality: 52, effort: 6 };
const WEBP = { quality: 74, effort: 5 };

/* -------------------------------------------------------------------------- */
/* image manifest                                                             */
/* -------------------------------------------------------------------------- */
const IMAGES = [
  // hero poster - the LCP element. Widest range, highest quality.
  { src: 'raw-01-hero.png', out: 'hero-poster', ar: [16, 9], widths: [960, 1440, 1920], avif: { quality: 58, effort: 6 } },

  // service tiles - one fixed 3:2 frame, size varied by CSS not by crop
  { src: 'raw-02-driveway.png', out: 'svc-driveway', ar: [3, 2], widths: [360, 560, 800, 1100] },
  { src: 'raw-03-siding.png', out: 'svc-siding', ar: [3, 2], widths: [360, 560, 800, 1100] },
  { src: 'raw-04-pavers.png', out: 'svc-pavers', ar: [3, 2], widths: [360, 560, 800, 1100] },
  { src: 'raw-05-commercial.png', out: 'svc-commercial', ar: [3, 2], widths: [360, 560, 800, 1100] },
  { src: 'raw-10-stairs.png', out: 'svc-stairs', ar: [3, 2], widths: [360, 560, 800, 1100] },
  { src: 'raw-11-lot.png', out: 'svc-lot', ar: [3, 2], widths: [360, 560, 800, 1100] },

  // auto detailing - layered crop frames
  { src: 'raw-06-auto.png', out: 'detail-main', ar: [16, 9], widths: [640, 1000, 1400] },
  { src: 'raw-12-auto-inset.png', out: 'detail-inset', ar: [4, 3], widths: [360, 640] },

  // before / after - MUST share an identical aspect ratio or the slider lies
  { src: 'raw-08-ba-before.png', out: 'ba-before', ar: [3, 2], widths: [760, 1200, 1700] },
  { src: 'raw-09-ba-after.png', out: 'ba-after', ar: [3, 2], widths: [760, 1200, 1700] },

  // Low-contrast background texture. It renders at 10% opacity behind the
  // service-area section, so it can be tiny and heavily compressed - at 900px
  // it was a 51 KB download for something almost invisible.
  { src: 'raw-07-texture.png', out: 'texture-water', ar: [3, 2], widths: [520],
    avif: { quality: 34, effort: 6 }, webp: { quality: 46, effort: 5 } },
];

async function buildImages() {
  await mkdir(IMG, { recursive: true });
  const manifest = {};

  for (const item of IMAGES) {
    const src = path.join(SRC, item.src);
    const [aw, ah] = item.ar;
    const entry = { widths: [] };

    for (const w of item.widths) {
      const h = Math.round((w * ah) / aw);
      const base = sharp(src).resize(w, h, { fit: 'cover', position: 'attention' });

      await base.clone().avif(item.avif ?? AVIF).toFile(path.join(IMG, item.out + '-' + w + '.avif'));
      await base.clone().webp(item.webp ?? WEBP).toFile(path.join(IMG, item.out + '-' + w + '.webp'));

      entry.widths.push({ w, h });
    }
    // intrinsic size = the largest rendition, used for width/height attributes
    const largest = entry.widths[entry.widths.length - 1];
    entry.w = largest.w;
    entry.h = largest.h;
    manifest[item.out] = entry;
    console.log('  img   ' + item.out.padEnd(16) + item.widths.join('/'));
  }

  await writeFile(path.join(IMG, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

/* -------------------------------------------------------------------------- */
/* favicons + open graph                                                      */
/* -------------------------------------------------------------------------- */
async function buildIcons() {
  /* Favicons come from the squared brand source (mark on navy with a rounded
     corner), so no flattening or background guessing is needed. */
  const faviconSrc = await readFile('assets/brand/favicon-source.svg');
  const png = (size) =>
    sharp(faviconSrc, { density: 900 }).resize(size, size).png({ compressionLevel: 9 });

  await png(32).toFile(IMG + '/favicon-32.png');
  await png(180).toFile(IMG + '/apple-touch-icon.png');
  await png(192).toFile(IMG + '/icon-192.png');
  await png(512).toFile(IMG + '/icon-512.png');

  /* Open Graph card: hero photo, navy scrim, the real mark, wordmark, phone. */
  const markSvg = await readFile('assets/brand/logo-mark.svg', 'utf8');
  const markPath = markSvg.match(/ d="([^"]+)"/)[1];
  const markVB = markSvg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const MW = parseFloat(markVB[1]), MH = parseFloat(markVB[2]);

  const W = 1200, H = 630;
  const photo = await sharp(SRC + '/raw-01-hero.png')
    .resize(W, H, { fit: 'cover', position: 'attention' }).toBuffer();

  const markH = 76;                    // rendered height of the mark on the card
  const markScale = markH / MH;
  const FONT = "Geist, Segoe UI, Arial, Helvetica, sans-serif";

  const overlay = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#0A1626" stop-opacity=".96"/>' +
    '<stop offset=".54" stop-color="#0A1626" stop-opacity=".80"/>' +
    '<stop offset="1" stop-color="#0A1626" stop-opacity=".34"/>' +
    '</linearGradient></defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#g)"/>' +
    '<g transform="translate(72 56) scale(' + markScale.toFixed(4) + ')">' +
    '<path fill="#4FA8E8" fill-rule="evenodd" d="' + markPath + '"/></g>' +
    '<text x="' + (72 + MW * markScale + 22) + '" y="96" fill="#FFFFFF" font-family="' + FONT + '" font-size="34" font-weight="700" letter-spacing="-0.3">CLEAR VIEW</text>' +
    '<text x="' + (72 + MW * markScale + 23) + '" y="120" fill="#A4BCD1" font-family="' + FONT + '" font-size="12" font-weight="400" letter-spacing="2.3">PRESSURE WASHING &amp; AUTO DETAIL</text>' +
    '<text x="72" y="330" fill="#FFFFFF" font-family="' + FONT + '" font-size="82" font-weight="700" letter-spacing="-2">Make it look</text>' +
    '<text x="72" y="412" fill="#FFFFFF" font-family="' + FONT + '" font-size="82" font-weight="700" letter-spacing="-2">new again.</text>' +
    '<rect x="72" y="452" width="150" height="3" fill="#4FA8E8"/>' +
    '<text x="72" y="506" fill="#E9F1F8" font-family="' + FONT + '" font-size="25" font-weight="500">Jacksonville, FL &#183; Since 2009</text>' +
    '<text x="72" y="552" fill="#4FA8E8" font-family="' + FONT + '" font-size="30" font-weight="700">(904) 312-1236</text>' +
    '</svg>'
  );

  await sharp(photo).composite([{ input: overlay }])
    .jpeg({ quality: 84, mozjpeg: true }).toFile(IMG + '/og-image.jpg');
  console.log('  icons + og-image.jpg');
}

/* -------------------------------------------------------------------------- */
/* video                                                                      */
/* -------------------------------------------------------------------------- */
const RENDITIONS = [
  { name: 'hero-desktop', w: 1280, h: 720, crf264: 30, crfVp9: 38 },
  { name: 'hero-mobile', w: 720, h: 406, crf264: 32, crfVp9: 40 },
];

async function buildVideo() {
  await mkdir(VID, { recursive: true });
  const src = SRC + '/hero-src.mp4';

  for (const r of RENDITIONS) {
    const scale = 'scale=' + r.w + ':' + r.h +
      ':force_original_aspect_ratio=increase,crop=' + r.w + ':' + r.h;

    // H.264 - universal support. -an strips audio (the loop is silent by design).
    await run(ffmpegPath, ['-v', 'error', '-y', '-i', src, '-vf', scale, '-an',
      '-c:v', 'libx264', '-profile:v', 'high', '-crf', String(r.crf264),
      '-preset', 'slower', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      VID + '/' + r.name + '.mp4']);

    // VP9 - smaller where supported; listed first in the <video> source order.
    await run(ffmpegPath, ['-v', 'error', '-y', '-i', src, '-vf', scale, '-an',
      '-c:v', 'libvpx-vp9', '-crf', String(r.crfVp9), '-b:v', '0',
      '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
      VID + '/' + r.name + '.webm']);

    console.log('  video ' + r.name + ' ' + r.w + 'x' + r.h);
  }
}

/* -------------------------------------------------------------------------- */
/* Run everything by default; pass a step name to run just one:
     node scripts/optimize-assets.mjs icons                              */
const only = process.argv[2];
console.log('optimising assets' + (only ? ' [' + only + ']' : '') + '...');
if (!only || only === 'images') await buildImages();
if (!only || only === 'icons')  await buildIcons();
if (!only || only === 'video')  await buildVideo();
console.log('done.');
