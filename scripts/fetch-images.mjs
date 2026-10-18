// Downloads every remote image linked in public/data/artworks/*.json into public/images/
// and rewrites the JSON to point at the local copy. Run on your own computer:
//   node scripts/fetch-images.mjs
// Safe to re-run: files already downloaded are skipped.
// Handles arthistoryproject.com and the Art Institute of Chicago (artic.edu) images.
// Chicago images are fetched politely (one at a time, 1.2 s apart) and, if the usual size
// is refused, smaller sizes are tried. Every failure is listed with its reason at the end.
import { readdir, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';

const dir = 'public/data/artworks';
const outDir = 'public/images';
await mkdir(outDir, { recursive: true });

const exists = (p) => access(p).then(() => true, () => false);
let done = 0, skipped = 0, failed = [];

for (const name of (await readdir(dir)).filter((n) => /^\d\d-\d\d\.json$/.test(n)).sort()) {
  const file = path.join(dir, name);
  const art = JSON.parse(await readFile(file, 'utf8'));
  const img = art.image;
  if (!img || !img.url || !/^https?:\/\//.test(img.url)) continue;
  // Only download from sites we recorded as public-domain sources.
  const host = new URL(img.url).hostname;
  const isAic = /(^|\.)artic\.edu$/.test(host);
  if (!isAic && !/(^|\.)arthistoryproject\.com$/.test(host)) { skipped++; continue; }
  const ext = (path.extname(new URL(img.url).pathname) || '.jpg').toLowerCase();
  // Named after the artwork id (not the day), so artworks can move between days safely.
  const local = `/images/${String(art.id).replace(/[^A-Za-z0-9._-]/g, '_')}${ext}`;
  const target = path.join('public', local);
  try {
    if (!(await exists(target))) {
      const headers = { 'User-Agent': 'ArtAlmanac-image-fetch/1.0 (school project)', 'AIC-User-Agent': 'ArtAlmanac school project (image download)', Accept: 'image/*' };
      const tries = isAic ? [img.url, img.url.replace('/full/843,/', '/full/600,/'), img.url.replace('/full/843,/', '/full/400,/')] : [img.url];
      let res, lastErr;
      for (const u of tries) {
        try {
          res = await fetch(u, { headers, signal: AbortSignal.timeout(30000) });
          if (res.ok && (res.headers.get('content-type') || '').startsWith('image/')) break;
          lastErr = `HTTP ${res.status} ${res.headers.get('content-type') || ''}`; res = null;
        } catch (e) { lastErr = `${e.name}: ${e.cause?.code || e.message}`; res = null; }
      }
      if (!res) throw new Error(lastErr);
      await writeFile(target, Buffer.from(await res.arrayBuffer()));
      if (isAic) await new Promise((r) => setTimeout(r, 1200));
    }
    img.remoteUrl = img.url;
    img.url = local;
    if (img.fullUrl) img.fullUrl = local;
    await writeFile(file, JSON.stringify(art, null, 2) + '\n');
    done++;
    console.log('ok  ', name, '->', local);
  } catch (e) {
    failed.push(`${name}: ${e.message}`);
    console.log('FAIL', name, e.message);
  }
}
console.log(`\nDownloaded/linked: ${done}. Skipped (Met / Cleveland, which already load fine): ${skipped}. Failed: ${failed.length}`);
if (failed.length) console.log(failed.join('\n'));
console.log('Next: node scripts/build-index.mjs && node scripts/validate.mjs');
