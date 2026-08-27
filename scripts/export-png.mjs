/**
 * Clear View - export the logo family as PNGs for print, signage and social.
 *
 *   python scripts/outline-lockup.py   # first: wordmark -> paths
 *   node scripts/export-png.mjs
 *
 * Everything is rendered from the vector masters at high density, so the output
 * is genuinely sharp rather than an upscale of a small bitmap. The lockups are
 * rendered from the OUTLINED copies, so no installed font is involved and the
 * type is identical on any machine.
 *
 * Output   logo-png/  (not committed - regenerate any time)
 */
import sharp from 'sharp';
import { readFile, mkdir, rm, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'logo-png';
const NAVY = '#0A1626';
const BLUE = '#2E6DA4';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

/* Load an SVG, optionally forcing every fill to a single colour. Used to make
   the one-colour versions (all white for dark backgrounds, all navy for light)
   without keeping a separate master file for each. */
async function load(file, forceFill) {
  let svg = await readFile(file, 'utf8');
  if (forceFill) {
    svg = svg.replace(/fill="(?!none)[^"]*"/g, `fill="${forceFill}"`);
  }
  return Buffer.from(svg);
}

/* Height is derived from the source aspect ratio, so nothing is ever squashed. */
async function render(svg, width, dest, background) {
  const img = sharp(svg, { density: 900 }).resize({ width });
  if (background) img.flatten({ background });
  await img.png({ compressionLevel: 9 }).toFile(path.join(OUT, dest));
}

const B = 'assets/brand/';
const D = 'assets/design/';

const jobs = [
  // --- the mark on its own -------------------------------------------------
  ['mark',              await load(B + 'logo-mark.svg', BLUE),  [512, 1024, 2048], null],
  ['mark-white',        await load(B + 'logo-mark.svg', '#FFFFFF'), [512, 1024, 2048], null],
  ['mark-navy',         await load(B + 'logo-mark.svg', NAVY),  [512, 1024, 2048], null],

  // --- full lockup, wordmark included -------------------------------------
  ['stacked',           await load(D + 'outlined-logo-stacked.svg'),         [800, 1600, 3200], null],
  ['stacked-on-navy',   await load(D + 'outlined-logo-stacked-reverse.svg'), [800, 1600, 3200], NAVY],
  ['stacked-white',     await load(D + 'outlined-logo-stacked.svg', '#FFFFFF'), [800, 1600, 3200], null],
  ['horizontal',        await load(D + 'outlined-logo-lockup.svg'),          [800, 1600, 3200], null],
  ['horizontal-white',  await load(D + 'outlined-logo-lockup.svg', '#FFFFFF'), [800, 1600, 3200], null],

];

for (const [name, svg, widths, bg] of jobs) {
  for (const w of widths) {
    await render(svg, w, `clearview-${name}-${w}.png`, bg);
  }
}

/* --- square icon, for profile pictures -------------------------------------
   favicon-source.svg is deliberately padded so the mark survives at 16px, which
   leaves it looking lost in a profile picture. This composes a fresh square with
   the mark at 80% width instead (still clear of a circular crop). Plain square, not rounded: every platform
   applies its own corner radius or circular crop, and baking one in shows up as
   a double edge. */
for (const [name, fg, bg] of [
  ['icon-navy', '#FFFFFF', NAVY],
  ['icon-blue', '#FFFFFF', BLUE],
  ['icon-light', BLUE, '#F7F9FB'],
]) {
  for (const size of [400, 1000, 2000]) {
    const mark = await sharp(await load(B + 'logo-mark.svg', fg), { density: 900 })
      .resize({ width: Math.round(size * 0.80) })
      .png()
      .toBuffer();
    await sharp({
      create: { width: size, height: size, channels: 4, background: bg },
    })
      .composite([{ input: mark, gravity: 'centre' }])
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, `clearview-${name}-${size}.png`));
  }
}

/* Report what came out, so a silently-empty or wrongly-sized render is visible
   rather than something to be discovered later on a printed sign. */
const files = (await readdir(OUT)).sort();
console.log(`wrote ${files.length} PNGs to ${OUT}/`);
for (const f of files) {
  const meta = await sharp(path.join(OUT, f)).metadata();
  const size = (await stat(path.join(OUT, f))).size;
  console.log(
    `  ${f.padEnd(34)} ${String(meta.width).padStart(4)}x${String(meta.height).padEnd(4)}` +
    `  ${meta.hasAlpha ? 'transparent' : 'solid      '}  ${(size / 1024).toFixed(0)} KB`
  );
}
