// Builds removed-artworks/review.html: one page showing every removed artwork with its image and a tick box.
// Usage:  node scripts/make-review-page.mjs     then double-click  removed-artworks/review.html
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const remDir = 'removed-artworks';
const curDir = 'public/data/artworks';
const inCalendar = new Set();
for (const n of (await readdir(curDir)).filter((x) => x.endsWith('.json'))) {
  const a = JSON.parse(await readFile(path.join(curDir, n), 'utf8'));
  inCalendar.add(`${a.title}|${a.artist}`.toLowerCase());
}
const inst = /\b(violin|guitar|lute|harp|piano|flute|drum|horn|trumpet|cello|viol|lyre|instrument|harpsichord|organ|banjo|mandolin|sitar|oud|zither|cittern|clarinet|oboe|bagpipe|tambourine|rebec|shawm|gong|bell)\b/i;
const tex = /\b(textile|tapestry|carpet|rug|cotton|silk|wool|embroider|weave|woven|brocade|quilt|velvet|kimono|robe|costume|dress|lace)\b/i;
const items = [];
for (const n of (await readdir(remDir)).filter((x) => x.endsWith('.json')).sort()) {
  let a; try { a = JSON.parse(await readFile(path.join(remDir, n), 'utf8')); } catch { continue; }
  const url = a.image?.url || '';
  const host = url.startsWith('http') ? new URL(url).hostname : '';
  const status = !host ? 'none' : /artic\.edu$/.test(host) ? 'blocked' : 'works';
  const txt = `${a.title} ${a.medium || ''}`;
  items.push({
    file: n, day: n.slice(0, 5), title: a.title, artist: a.artist, date: a.date, medium: a.medium || '',
    img: url, status, link: a.source?.url || '', museum: a.source?.museum || '',
    flag: inst.test(txt) ? 'musical instrument?' : tex.test(txt) ? 'textile?' : '',
    dup: inCalendar.has(`${a.title}|${a.artist}`.toLowerCase()),
  });
}
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Removed artworks: pick the ones to bring back</title>
<style>
:root{--ink:#1a1a1a;--gray:#666;--line:#ccc;--wall:#eceae4;--blue:#3d5dcf}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:var(--ink);background:#fff}
header{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid var(--line);padding:.8rem 1rem;display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:center}
h1{font-size:1.05rem;margin:0 1rem 0 0}
input[type=search],select{font:inherit;padding:.45rem .7rem;border:1px solid var(--line);border-radius:999px}
button{font:inherit;padding:.45rem .9rem;border-radius:999px;border:1px solid var(--ink);background:#fff;cursor:pointer}
button.primary{background:var(--blue);border-color:var(--blue);color:#fff}
#count{font-weight:600}
main{padding:1rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:1rem}
.card{border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;background:#fff}
.card.sel{outline:3px solid var(--blue)}
.pic{background:var(--wall);height:200px;display:grid;place-items:center;text-align:center;font-size:.85rem;color:var(--gray)}
.pic img{max-width:100%;max-height:200px;display:block;object-fit:contain}
.body{padding:.6rem .8rem;display:grid;gap:.15rem;font-size:.85rem}
.t{font-weight:600;font-size:.95rem}.m{color:var(--gray)}
.badge{display:inline-block;font-size:.72rem;padding:.1rem .5rem;border-radius:999px;background:var(--wall);margin-right:.3rem}
.warn{background:#ffe3d9}
label.pick{display:flex;gap:.5rem;align-items:center;padding:.6rem .8rem;border-top:1px solid var(--line);font-weight:600;cursor:pointer;margin-top:auto}
label.pick input{width:1.3rem;height:1.3rem}
a{color:var(--blue)}
dialog{max-width:42rem;width:92vw;border-radius:12px}
textarea{width:100%;height:14rem;font:12px/1.4 ui-monospace,monospace}
</style></head><body>
<header>
<h1>Removed artworks</h1>
<input id="q" type="search" placeholder="Search title or artist" size="22">
<select id="show"><option value="all">All</option><option value="works">Image loads (Met, Cleveland, other)</option><option value="blocked">Chicago, image blocked</option><option value="none">No image yet</option></select>
<select id="sort"><option value="artist">Sort by artist</option><option value="day">Sort by old day</option><option value="title">Sort by title</option></select>
<label><input id="onlysel" type="checkbox"> Show only ticked</label>
<span id="count"></span>
<button class="primary" id="done">Show my list</button>
<button id="clear">Untick all</button>
</header>
<main id="grid"></main>
<dialog id="dlg"><h2>Your list</h2><p>Copy this text and paste it to Claude (the ticks are also saved in this browser).</p><textarea id="out" readonly></textarea><p><button class="primary" id="copy">Copy</button> <button id="close">Close</button></p></dialog>
<script>
const ITEMS = ${JSON.stringify(items).replace(/</g, '\\u003c')};
const KEY='removedPicks';
let picks=new Set(); try{picks=new Set(JSON.parse(localStorage.getItem(KEY)||'[]'))}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify([...picks]))}catch(e){}};
const $=id=>document.getElementById(id);
function card(it){
  const d=document.createElement('div');d.className='card'+(picks.has(it.file)?' sel':'');
  const pic=document.createElement('div');pic.className='pic';
  if(it.status==='none'){pic.textContent='No image for this one yet';}
  else{const im=new Image();im.loading='lazy';im.alt=it.title;im.referrerPolicy='no-referrer';im.src=it.img;im.onerror=()=>{pic.textContent='Image could not load'+(it.status==='blocked'?' (Chicago blocks it)':'')};pic.append(im);}
  const b=document.createElement('div');b.className='body';
  const badge=(t,w)=>'<span class="badge'+(w?' warn':'')+'">'+t+'</span>';
  b.innerHTML='<div class="t"></div><div class="m a"></div><div class="m c"></div><div>'+
    badge('was '+it.day)+(it.status==='blocked'?badge('Chicago: image blocked',1):'')+(it.status==='none'?badge('no image',1):'')+(it.flag?badge(it.flag,1):'')+(it.dup?badge('already in calendar again',1):'')+
    '</div>'+(it.link?'<div><a target="_blank" rel="noopener" href="'+it.link+'">museum page</a></div>':'');
  b.querySelector('.t').textContent=it.title;b.querySelector('.a').textContent=it.artist;b.querySelector('.c').textContent=[it.date,it.medium].filter(Boolean).join(' | ');
  const l=document.createElement('label');l.className='pick';
  const cb=document.createElement('input');cb.type='checkbox';cb.checked=picks.has(it.file);
  cb.onchange=()=>{cb.checked?picks.add(it.file):picks.delete(it.file);d.classList.toggle('sel',cb.checked);save();count();if($('onlysel').checked)render();};
  l.append(cb,'Bring this one back');
  d.append(pic,b,l);return d;
}
function count(){$('count').textContent=picks.size+' ticked';}
function render(){
  const q=$('q').value.trim().toLowerCase(),sh=$('show').value,so=$('sort').value,os=$('onlysel').checked;
  let list=ITEMS.filter(i=>(sh==='all'||i.status===sh)&&(!q||(i.title+' '+i.artist).toLowerCase().includes(q))&&(!os||picks.has(i.file)));
  list.sort((a,b)=>so==='day'?a.day.localeCompare(b.day):so==='title'?a.title.localeCompare(b.title):(a.artist||'').localeCompare(b.artist||'')||a.title.localeCompare(b.title));
  const g=$('grid');g.replaceChildren(...list.map(card));count();
}
['q','show','sort','onlysel'].forEach(id=>$(id).addEventListener(id==='q'?'input':'change',render));
$('clear').onclick=()=>{if(confirm('Untick everything?')){picks.clear();save();render();}};
$('done').onclick=()=>{const rows=ITEMS.filter(i=>picks.has(i.file)).map(i=>i.file+' | '+i.title+' | '+i.artist);$('out').value=rows.length?rows.join('\\n'):'(nothing ticked yet)';$('dlg').showModal();};
$('close').onclick=()=>$('dlg').close();
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('out').value);$('copy').textContent='Copied';}catch(e){$('out').select();document.execCommand('copy');}};
render();
</script></body></html>`;
await writeFile(path.join(remDir, 'review.html'), html);
console.log(`Wrote removed-artworks/review.html with ${items.length} artworks. Double-click it to open.`);
