// Reads four arthistoryproject.com pages and saves their image links, collection and public-domain sentence.
// Run on your own computer:   node scripts/ahp-pages.mjs
// It writes  ahp-pages.json  in the project folder. Send that file back to Claude.
import { writeFile } from 'node:fs/promises';
const pages = [
  'https://www.arthistoryproject.com/artists/mary-cassatt/young-mother-sewing/',
  'https://www.arthistoryproject.com/artists/joseph-stella/coney-island/',
  'https://www.arthistoryproject.com/artists/farrukh-beg/sultan-ibrahim-adil-shah-ii-khan-hunting-with-a-hawk/',
  'https://www.arthistoryproject.com/timeline/the-ancient-world/egypt/model-of-egyptian-nile-boat/',
];
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const out = [];
for (const page of pages) {
  try {
    const r = await fetch(page, { headers: { 'User-Agent': 'ArtAlmanac-school-project/1.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const h = await r.text();
    const text = strip(h);
    const imgs = [...new Set([...h.matchAll(/(?:https:\/\/(?:www\.)?arthistoryproject\.com)?(\/site\/assets\/files\/\d+\/[^"'\s)]+?\.(?:jpg|jpeg|png))/gi)].map((m) => 'https://www.arthistoryproject.com' + m[1]))].filter((u) => !/\.\d+x\d+\./.test(u));
    out.push({
      page,
      title: (h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]?.replace(/<[^>]+>/g, '').trim(),
      about: (text.match(/[^.]*\bcreated by\b[^.]*\.(?:\s*It lives at[^.]*\.)?/) || [])[0]?.trim(),
      publicDomainStatement: (text.match(/The image is in the Public Domain[^.]*\.?/i) || [])[0]?.trim(),
      imageOg: (h.match(/property="og:image"\s+content="([^"]+)"/) || h.match(/content="([^"]+)"\s+property="og:image"/) || [])[1],
      imageCandidates: imgs.slice(0, 6),
    });
    console.log('ok  ', page);
  } catch (e) { out.push({ page, error: e.message }); console.log('FAIL', page, e.message); }
  await new Promise((r) => setTimeout(r, 1000));
}
await writeFile('ahp-pages.json', JSON.stringify(out, null, 2));
console.log('\nDone. Please send the file  ahp-pages.json  back to Claude.');
