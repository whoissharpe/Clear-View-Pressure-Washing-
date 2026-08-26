/**
 * Minimal static file server for local preview.
 *   npm run serve   ->  http://localhost:4321
 *
 * Serves the repo root by default. Pass a directory to serve something else:
 *   node scripts/serve.mjs dist
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '.');
const PORT = Number(process.env.PORT || 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';

    const file = path.join(ROOT, rel);
    // never serve outside the root
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }

    const info = await stat(file);
    if (info.isDirectory()) { res.writeHead(302, { Location: rel + '/' }).end(); return; }

    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';

    /* Compress text the way Cloudflare Pages does, so local Lighthouse runs
       are representative. Images, video and woff2 are already compressed. */
    const COMPRESSIBLE = ['.html', '.css', '.js', '.json', '.svg', '.xml', '.txt', '.webmanifest'];
    const wantsGzip = /gzip/i.test(req.headers['accept-encoding'] || '')
      && COMPRESSIBLE.includes(ext);

    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' };
    if (wantsGzip) {
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      res.writeHead(200, headers);
      createReadStream(file).pipe(createGzip()).pipe(res);
    } else {
      headers['Content-Length'] = info.size;
      res.writeHead(200, headers);
      createReadStream(file).pipe(res);
    }
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(PORT, () => {
  console.log('serving ' + ROOT + ' on http://localhost:' + PORT + ' [gzip enabled]');
});
