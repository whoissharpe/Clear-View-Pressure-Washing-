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
import { transform } from 'esbuild';
import { createHash } from 'node:crypto';

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



/* ---- static assets -------------------------------------------------------- */
const COPY = [
  'assets/brand', 'assets/fonts', 'assets/img', 'assets/video',
  'robots.txt', 'sitemap.xml', 'site.webmanifest', '_headers',
];

for (const entry of COPY) {
  await cp(entry, path.join(OUT, entry), { recursive: true });
}

/* JS stays a separate file (deferred, cacheable) but ships minified AND
   content-hashed. Without the hash the filename never changes, so a browser
   that cached it under the old immutable header would keep running stale
   JS for up to a year after a deploy. A new hash = a new URL = no stale
   cache is even possible. */
const js = await readFile('assets/js/site.js', 'utf8');
const minJs = (await transform(js, { loader: 'js', minify: true, target: 'es2018' })).code;
const jsHash = createHash('sha256').update(minJs).digest('hex').slice(0, 8);
const jsName = `site.${jsHash}.js`;
await mkdir(path.join(OUT, 'assets/js'), { recursive: true });
await writeFile(path.join(OUT, 'assets/js', jsName), minJs);

/* Match the <script> tag specifically. A bare string replace would hit the
   FIRST occurrence of "assets/js/site.js" in the document, which is a prose
   comment in the quote-form section, leaving the real script tag pointing at
   the unhashed file. */
const scriptTag = '<script src="assets/js/site.js" defer></script>';
if (!html.includes(scriptTag)) {
  throw new Error('script tag not found verbatim - check index.html');
}
html = html.replace(scriptTag, `<script src="assets/js/${jsName}" defer></script>`);
if (html.includes('src="assets/js/site.js"')) {
  throw new Error('an unhashed script src survived the rewrite');
}

/* assets/design holds the working masters and never ships */

await writeFile(path.join(OUT, 'index.html'), html);

/* ---- admin page ----------------------------------------------------------
   /admin is its own standalone document: it shares the design tokens with the
   site but none of its layout CSS or JS, so it gets tokens.css inlined the same
   way and nothing else. Cloudflare Pages serves admin.html at /admin. */
let admin = await readFile('admin.html', 'utf8');
admin = admin.replace(
  '<link rel="stylesheet" href="assets/css/tokens.css">',
  '<style>' + squeeze(tokens) + '</style>'
);
if (admin.includes('assets/css/')) {
  throw new Error('admin.html stylesheet link was not replaced');
}
await writeFile(path.join(OUT, 'admin.html'), admin);

const kb = (s) => (s / 1024).toFixed(1) + ' KB';
console.log('built ' + OUT + '/');
console.log('  index.html ' + kb(Buffer.byteLength(html)) + ' (css inlined, ' + kb(Buffer.byteLength(inlined)) + ' of it)');
console.log('  assets/js/' + jsName + ' ' + kb(Buffer.byteLength(js)) + ' -> ' + kb(Buffer.byteLength(minJs)));
console.log('  admin.html ' + kb(Buffer.byteLength(admin)));
console.log('  copied: ' + COPY.join(', '));
