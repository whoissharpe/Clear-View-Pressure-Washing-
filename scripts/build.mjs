/**
 * Clear View - production build
 * -----------------------------------------------------------------------------
 * Produces dist/, ready to deploy to Cloudflare Pages.
 *
 *   npm run build
 *
 * The only transformation is inlining the two stylesheets into the HTML. They are
 * kept as separate source files because tokens.css is meant to be edited by hand,
 * but shipping them as two render-blocking requests costs a round trip on mobile
 * for ~5 KB of gzipped CSS. Inlining removes that without hurting maintainability.
 *
 * JS stays external and deferred: it is not render-blocking, and keeping it
 * separate means it can be cached independently.
 */
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'dist';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

/* ---- html + inlined css --------------------------------------------------- */
let html = await readFile('index.html', 'utf8');

const tokens = await readFile('assets/css/tokens.css', 'utf8');
const styles = await readFile('assets/css/styles.css', 'utf8');

/* The stylesheets live in assets/css/, so their relative urls are written
   ../fonts/... and ../img/.... Once inlined into index.html at the root those
   must be rewritten or the font and the texture 404. */
const rebase = (css) => css
  .replace(/url\("\.\.\/fonts\//g, 'url("assets/fonts/')
  .replace(/url\("\.\.\/img\//g, 'url("assets/img/');

/* Conservative minification: strip comments and collapse whitespace runs.
   Deliberately does not touch anything inside url() or quoted strings. */
const squeeze = (css) => css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s*\n\s*/g, '\n')
  .replace(/\n{2,}/g, '\n')
  .trim();

const inlined = squeeze(rebase(tokens)) + '\n' + squeeze(rebase(styles));

html = html.replace(
  /<link rel="stylesheet" href="assets\/css\/tokens\.css">\s*<link rel="stylesheet" href="assets\/css\/styles\.css">/,
  '<style>\n' + inlined + '\n</style>'
);

if (html.includes('assets/css/')) {
  throw new Error('stylesheet links were not replaced - check the pattern in build.mjs');
}

await writeFile(path.join(OUT, 'index.html'), html);

/* ---- static assets -------------------------------------------------------- */
const COPY = [
  'assets/js', 'assets/brand', 'assets/fonts', 'assets/img', 'assets/video',
  'robots.txt', 'sitemap.xml', 'site.webmanifest', '_headers',
];

for (const entry of COPY) {
  await cp(entry, path.join(OUT, entry), { recursive: true });
}

/* assets/design holds the working masters and never ships */

const kb = (s) => (s / 1024).toFixed(1) + ' KB';
console.log('built ' + OUT + '/');
console.log('  index.html ' + kb(Buffer.byteLength(html)) + ' (css inlined, ' + kb(Buffer.byteLength(inlined)) + ' of it)');
console.log('  copied: ' + COPY.join(', '));
