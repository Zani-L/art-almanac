// Looks for the SAME artworks on sites whose images load for you:
//   - The Metropolitan Museum of Art (open-access API)
//   - Cleveland Museum of Art (open-access API)
//   - arthistoryproject.com (public-domain pages)
// It does this for every day whose image still comes from artic.edu (blocked for us).
// Run on your own computer:   node scripts/find-alternatives.mjs
// It writes  alternatives.json  in the project folder. Send that file back to Claude.
// It only READS public pages and APIs, one request at a time, with short pauses.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dir = 'public/data/artworks';
const AHP = 'https://www.arthistoryproject.com';
const HEAD = { 'User-Agent': 'ArtAlmanac-school-project/1.0 (finding public-domain images)', Accept: 'application/json,text/html,*/*' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, asJson = false, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: HEAD, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await sleep(3000 * (i + 1)); last = new Error('HTTP 429'); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return asJson ? await r.json() : await r.text();
    } catch (e) { last = e; await sleep(800); }
  }
  throw last;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['the', 'and', 'with', 'from', 'plate', 'seen', 'for', 'les', 'des', 'du', 'de', 'la', 'le']);
const words = (s) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
const cleanTitle = (t) => t.replace(/\(.*?\)/g, ' ').replace(/,.*$/, '').replace(/;.*$/, '').trim();
const ARTIST_DROP = new Set(['attributed', 'artist', 'unknown', 'elder', 'younger', 'glass', 'decorating', 'company', 'and', 'the', 'to']);
function artistTokens(name) {
  const base = name.replace(/\(.*?\)/g, ' ');
  return norm(base).split(' ').filter((w) => w.length > 1 && !ARTIST_DROP.has(w));
}
const lastName = (name) => { const t = artistTokens(name); return t.length ? t[t.length - 1] : ''; };
const overlap = (titleWords, targetWords) => titleWords.filter((w) => targetWords.includes(w)).length;

// ---- the wish list: every day whose image comes from artic.edu ----
const wishes = [];
for (const n of (await readdir(dir)).filter((x) => /^\d\d-\d\d\.json$/.test(x)).sort()) {
  const a = JSON.parse(await readFile(path.join(dir, n), 'utf8'));
  const u = a.image?.url || a.image?.remoteUrl || '';
  if (/artic\.edu/.test(u)) wishes.push({ day: n.replace('.json', ''), title: a.title, artist: a.artist, date: a.date });
}
console.log(`${wishes.length} artworks to look for.\n`);

// ---- arthistoryproject: read the index once ----
let indexHtml = '';
try { indexHtml = await get(`${AHP}/public-domain/`); } catch (e) { console.log('(arthistoryproject index not readable:', e.message, ')'); }
const artistSlugs = new Set([...indexHtml.matchAll(/\/artists\/([a-z0-9][a-z0-9._%-]*)\//gi)].map((m) => m[1].toLowerCase()));
const artistCache = new Map();
async function ahpWorksFor(slug) {
  if (artistCache.has(slug)) return artistCache.get(slug);
  let links = [];
  try {
    const h = await get(`${AHP}/artists/${slug}/`);
    links = [...new Set([...h.matchAll(/\/artists\/([a-z0-9][a-z0-9._%-]*)\/([a-z0-9][a-z0-9._%-]*)\//gi)].map((m) => `/artists/${m[1].toLowerCase()}/${m[2].toLowerCase()}/`))];
  } catch { /* no such artist page */ }
  await sleep(700);
  artistCache.set(slug, links);
  return links;
}
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

async function searchAhp(w) {
  const tw = words(cleanTitle(w.title));
  const last = lastName(w.artist);
  const slugs = new Set([norm(w.artist.replace(/\(.*?\)/g, '')).replace(/ /g, '-')]);
  for (const s of artistSlugs) if (last && s.split('-').includes(last)) slugs.add(s);
  const hits = [];
  for (const s of slugs) {
    for (const l of await ahpWorksFor(s)) {
      const lw = norm(l.split('/')[3]).split(' ');
      if (tw.length && overlap(tw, lw) >= Math.max(1, Math.ceil(tw.length * 0.6))) hits.push(l);
    }
  }
  const out = [];
  for (const l of [...new Set(hits)].slice(0, 3)) {
    try {
      const h = await get(AHP + l);
      const text = strip(h);
      const og = (h.match(/property="og:image"\s+content="([^"]+)"/) || h.match(/content="([^"]+)"\s+property="og:image"/) || [])[1];
      const imgs = [...new Set([...h.matchAll(/(?:https:\/\/(?:www\.)?arthistoryproject\.com)?(\/site\/assets\/files\/\d+\/[^"'\s)]+?\.(?:jpg|jpeg|png))/gi)].map((m) => AHP + m[1]))].filter((u) => !/\.\d+x\d+\./.test(u));
      out.push({
        page: AHP + l,
        title: (h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]?.replace(/<[^>]+>/g, '').trim(),
        about: (text.match(/[^.]*\bcreated by\b[^.]*\.(?:\s*It lives at[^.]*\.)?/) || [])[0]?.trim(),
        publicDomainStatement: (text.match(/The image is in the Public Domain[^.]*\.?/i) || [])[0]?.trim(),
        imageOg: og, imageCandidates: imgs.slice(0, 4),
      });
    } catch (e) { out.push({ page: AHP + l, error: e.message }); }
    await sleep(700);
  }
  return out;
}

// ---- Met ----
async function searchMet(w) {
  const tw = words(cleanTitle(w.title));
  const last = lastName(w.artist);
  const q = encodeURIComponent(`${cleanTitle(w.title)} ${last}`.trim());
  const found = [];
  try {
    let s = await get(`https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${q}`, true);
    if (!s.total) s = await get(`https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(cleanTitle(w.title))}`, true);
    for (const id of (s.objectIDs || []).slice(0, 8)) {
      try {
        const o = await get(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, true);
        await sleep(250);
        if (!o.isPublicDomain || !o.primaryImageSmall) continue;
        const sameArtist = last && norm(o.artistDisplayName).includes(last);
        const t = overlap(tw, words(o.title));
        if (!sameArtist && t === 0) continue;
        found.push({ objectID: id, title: o.title, artist: o.artistDisplayName, date: o.objectDate, medium: o.medium, department: o.department, creditLine: o.creditLine, image: o.primaryImage || o.primaryImageSmall, imageSmall: o.primaryImageSmall, url: o.objectURL, sameArtist: !!sameArtist, titleWordMatches: t });
      } catch { /* skip */ }
    }
  } catch (e) { found.push({ error: e.message }); }
  return found;
}

// ---- Cleveland ----
async function searchCma(w) {
  const tw = words(cleanTitle(w.title));
  const last = lastName(w.artist);
  const found = [];
  try {
    const q = encodeURIComponent(`${cleanTitle(w.title)}`);
    const r = await get(`https://openaccess-api.clevelandart.org/api/artworks/?q=${q}&has_image=1&cc0=1&limit=8`, true);
    for (const o of r.data || []) {
      const artists = (o.creators || []).map((c) => c.description).join(' ');
      const sameArtist = last && norm(artists).includes(last);
      const t = overlap(tw, words(o.title));
      if (!sameArtist && t < Math.max(1, Math.ceil(tw.length * 0.6))) continue;
      found.push({ accession: o.accession_number, title: o.title, artist: artists, date: o.creation_date, medium: o.technique, creditLine: o.creditline, image: o.images?.web?.url, imageFull: o.images?.print?.url, url: o.url, license: o.share_license_status, sameArtist: !!sameArtist, titleWordMatches: t });
    }
  } catch (e) { found.push({ error: e.message }); }
  return found;
}

const results = [];
for (const w of wishes) {
  const met = await searchMet(w);
  const cma = await searchCma(w);
  await sleep(300);
  const ahp = await searchAhp(w).catch((e) => [{ error: e.message }]);
  results.push({ ...w, met, cma, ahp });
  const good = (a) => a.filter((x) => !x.error).length;
  console.log(`${w.day}  ${w.title.slice(0, 38).padEnd(38)}  Met:${good(met)}  Cleveland:${good(cma)}  ArtHistoryProject:${good(ahp)}`);
}
await writeFile('alternatives.json', JSON.stringify({ fetchedOn: new Date().toISOString(), results }, null, 2));
console.log('\nDone. Please send the file  alternatives.json  (in the project folder) back to Claude.');
