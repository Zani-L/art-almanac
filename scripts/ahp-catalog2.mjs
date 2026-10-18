// Collects title / artist / year / museum / medium / public-domain statement / image link
// for a wish-list of public-domain artworks from https://www.arthistoryproject.com
// Run on your own computer:   node scripts/ahp-catalog.mjs
// It writes  ahp-catalog2.json  in the project folder. Send that file back to Claude.
// It is polite: one request every ~700 ms, and it only reads pages (no logins, no downloads of images).
import { writeFile } from 'node:fs/promises';

const BASE = 'https://www.arthistoryproject.com';
const UA = { 'User-Agent': 'DailyMasterpiece-catalog/1.0 (school project; reading public pages)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => {
  const r = await fetch(u, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
};
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Each wish is [words that must ALL appear in "artist-slug work-slug"]
const wishes = [
  ['eakins','banjo'],['tapiro','tangier'],['mucha','reverie'],['haeckel','actiniae'],['haeckel','orchidae'],['audubon','owl'],
  ['wright','girandola'],['canaletto','marco'],['rousseau','carnival'],['rousseau','sleeping gypsy'],['jawlensky','peonies'],
  ['collier','books'],['collier','letter'],['bellows','fish'],['kandinsky','yellow red blue'],['kandinsky','composition vii'],
  ['werefkin','theatre'],['carr','canoes'],['carr','totem'],['uemura','guifei'],['redon','cube'],['doesburg','card'],
  ['russolo','fog'],['hamdi','quran'],['hamdi','tilaveti'],['rozanova','airplane'],['rozanova','jack'],['arcimboldo','summer'],
  ['ducreux','terror'],['deutsch','palace guard'],['dellschau','spark'],['hicks','noah'],['munch','scream'],['vermeer','art of painting'],
  ['courbet','desperate'],['gauguin','goupil'],['gauguin','teapot'],['lautrec','divan'],['roerich','padma'],['mondrian','devotion'],
  ['ruysch','flowers'],['gogh','roulin'],['schwitters','cigar'],['schwitters','merz'],['morisot','sisters'],['bonnard','cannet'],
  ['braque','estaque'],['leger','candlestick'],
];

console.log('Reading the public-domain index ...');
const html = await get(`${BASE}/public-domain/`);
const WORK_RE = /\/artists\/([a-z0-9][a-z0-9.%_-]*)\/([a-z0-9][a-z0-9.%_-]*)\//gi;
const ARTIST_RE = /\/artists\/([a-z0-9][a-z0-9.%_-]*)\//gi;
const findLinks = (h) => [...h.matchAll(WORK_RE)].map((m) => `/artists/${m[1].toLowerCase()}/${m[2].toLowerCase()}/`);
let links = new Set(findLinks(html));
const artistPages = new Set([...html.matchAll(ARTIST_RE)].map((m) => `/artists/${m[1].toLowerCase()}/`));
// Known pages (already seen by Claude) so we never depend on the index alone:
for (const k of [
  'robert-delaunay/eiffel-tower-with-trees', 'leonardo-da-vinci/mona-lisa', 'johannes-vermeer/girl-with-a-pearl-earring',
  'claude-monet/impression-sunrise', 'claude-monet/woman-with-a-parasol-madame-monet-and-her-son', 'gustav-klimt/the-kiss',
  'caspar-david-friedrich/the-wanderer-above-the-sea-of-fog', 'jean-francois-millet/potato-planters', 'joaquin-sorolla/summer',
  'franz-marc/yellow-cow', 'james-mcneill-whistler/arrangement-in-grey-and-black-no.1', 'giuseppe-castiglione/portrait-of-consort-chunhui',
  'jan-matejko/stanczyk', 'gottfried-lindauer/portrait-of-ihaka-whanga', 'piet-mondrian/farm-near-duivendrecht',
  'vincent-van-gogh/the-starry-night', 'vincent-van-gogh/sunflowers', 'vincent-van-gogh/wheat-field-with-cypresses-july-1889',
  'vincent-van-gogh/the-church-at-auvers', 'vincent-van-gogh/almond-blossom', 'vincent-van-gogh/the-red-vineyard',
  'hokusai/the-great-wave-off-kanagawa', 'hokusai/fishing-by-torchlight-in-kai-province', 'pieter-bruegel-the-elder/hunters-in-the-snow',
  'pieter-bruegel-the-elder/childrens-games', 'pieter-bruegel-the-elder/the-harvesters', 'rembrandt/the-man-with-the-golden-helmet',
  'rembrandt/the-return-of-the-prodigal-son', 'john-constable/wivenhoe-park-essex',
  'john-constable/salisbury-cathedral-from-the-bishops-grounds', 'claude-monet/cliff-walk-at-pourville',
]) links.add(`/artists/${k}/`);
console.log(`Index shows ${links.size} work links and ${artistPages.size} artist pages.`);
if (links.size < 100) {
  await writeFile('ahp-debug.txt', html.slice(0, 6000));
  console.log('(Saved ahp-debug.txt - the start of the index page - in case it is needed.)');
}

// The index may only show some works, so also read artist pages for the artists on the wish-list.
const wantedArtists = [...new Set(wishes.map((w) => norm(w[0])))];
for (const ap of artistPages) {
  const slug = norm(ap.split('/')[2]);
  if (!wantedArtists.some((a) => slug.includes(a.split(' ').pop()))) continue;
  try {
    const h = await get(BASE + ap);
    for (const l of findLinks(h)) links.add(l);
  } catch (e) { console.log('  (artist page skipped)', ap, e.message); }
  await sleep(700);
}
console.log(`Now ${links.size} work links known.`);

const pick = [];
const missing = [];
for (const w of wishes) {
  const hit = [...links].filter((l) => { const t = norm(l.split('/').slice(2, 4).join(' ')); return w.every((x) => t.includes(norm(x))); });
  if (hit.length) pick.push(...hit.slice(0, 2)); else missing.push(w.join(' + '));
}
const todo = [...new Set(pick)];
console.log(`Matched ${todo.length} pages; ${missing.length} wishes had no match.`);

const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const out = [];
for (const l of todo) {
  try {
    const h = await get(BASE + l);
    const text = strip(h);
    const og = (h.match(/property="og:image"\s+content="([^"]+)"/) || h.match(/content="([^"]+)"\s+property="og:image"/) || [])[1];
    const jpgs = [...new Set([...h.matchAll(/(?:https:\/\/(?:www\.)?arthistoryproject\.com)?(\/site\/assets\/files\/\d+\/[^"'\s)]+?\.(?:jpg|jpeg|png))/gi)].map((m) => BASE + m[1]))]
      .filter((u) => !/\.\d+x\d+\./.test(u));
    const title = (h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]?.replace(/<[^>]+>/g, '').trim();
    const about = (text.match(/[^.]*\bcreated by\b[^.]*\.(?:\s*It lives at[^.]*\.)?/) || [])[0]?.trim();
    const pd = (text.match(/The image is in the Public Domain[^.]*\.?/i) || [])[0]?.trim();
    out.push({ page: BASE + l, title, about, publicDomainStatement: pd, imageOg: og, imageCandidates: jpgs.slice(0, 4) });
    console.log('ok  ', l);
  } catch (e) {
    out.push({ page: BASE + l, error: e.message });
    console.log('FAIL', l, e.message);
  }
  await sleep(700);
}
await writeFile('ahp-catalog2.json', JSON.stringify({ fetchedOn: new Date().toISOString(), noMatch: missing, works: out }, null, 2));
console.log('\nDone. Please send the file  ahp-catalog2.json  (in this folder) back to Claude.');
