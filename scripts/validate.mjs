// Validates the artwork dataset. Usage: node scripts/validate.mjs [--strict]
// Errors always fail. Missing days only fail with --strict (use it before release).
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const strict = process.argv.includes("--strict");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, "public/data");
const taxonomy = JSON.parse(await readFile(path.join(dataDir, "taxonomy.json"), "utf8"));
const bands = taxonomy.gradeBands.map((b) => b.id);
const cats = taxonomy.categories.map((c) => c.id);

const errors = [];
const warnings = [];
const err = (day, msg) => errors.push(`${day}: ${msg}`);
const warn = (day, msg) => warnings.push(`${day}: ${msg}`);

// 366 valid keys
const allKeys = [];
for (let m = 1; m <= 12; m++) {
  const last = new Date(Date.UTC(2000, m, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) allKeys.push(`${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
}

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const descLimits = { k: [12, 55], g12: [25, 75], g35: [40, 100], g68: [40, 110], g910: [40, 115], g1112: [40, 120] };
const yesNoStarts = /^(is|are|was|were|do|does|did|can|could|would|will|has|have|had|should)\b/i;
const isHttps = (u) => typeof u === "string" && /^https:\/\/[^\s]+$/.test(u);
const isImageUrl = (u) => isHttps(u) || (typeof u === "string" && /^\/images\/[A-Za-z0-9._-]+$/.test(u)); // a link, or a file downloaded into public/images
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

const files = (await readdir(path.join(dataDir, "artworks"))).filter((f) => f.endsWith(".json")).sort();
const seen = { id: new Map(), work: new Map(), image: new Map(), source: new Map() };
const questionTexts = new Map();
const present = new Set();
const screened = [];
const pending = [];

for (const file of files) {
  const day = file.replace(/\.json$/, "");
  if (!allKeys.includes(day)) { err(file, "file name is not a valid MM-DD calendar day"); continue; }
  let art;
  try { art = JSON.parse(await readFile(path.join(dataDir, "artworks", file), "utf8")); }
  catch (e) { err(day, `invalid JSON: ${e.message}`); continue; }
  present.add(day);

  if (art.day !== day) err(day, `"day" field (${art.day}) does not match file name`);
  for (const f of ["id", "title", "artist", "date", "altText", "context"]) if (!nonEmpty(art[f])) err(day, `missing ${f}`);

  const uniq = (map, key, label) => {
    if (!key) return;
    if (map.has(key)) err(day, `duplicate ${label} (also ${map.get(key)}): ${key}`);
    else map.set(key, day);
  };
  uniq(seen.id, art.id, "id");
  uniq(seen.work, `${art.title}|${art.artist}`.toLowerCase(), "title+artist");
  uniq(seen.image, art.image?.url, "image url");
  uniq(seen.source, art.source?.url, "source url");

  const im = art.image ?? {};
  if (im.url === undefined) {
    if (im.status !== "pending") err(day, 'no image.url: set image.status to "pending" to use a placeholder');
    else pending.push(day);
  } else {
    if (!isImageUrl(im.url)) err(day, "image.url must be an https URL or a /images/ file");
    if (!nonEmpty(im.credit)) err(day, "image.credit missing");
    if (!nonEmpty(im.license)) err(day, "image.license missing");
  }
  const s = art.source ?? {};
  if (!isHttps(s.url)) err(day, "source.url must be an https URL");
  for (const f of ["museum", "verifiedOn", "verifiedBy"]) if (!nonEmpty(s[f])) err(day, `source.${f} missing`);

  const sf = art.safety ?? {};
  if (sf.status === "metadata-screened") screened.push(day);
  else if (sf.status !== "approved") err(day, `safety.status is "${sf.status}"; must be "approved" or "metadata-screened"`);
  if (!nonEmpty(sf.method)) err(day, "safety.method missing");

  for (const b of bands) {
    const d = art.descriptions?.[b];
    if (!nonEmpty(d)) { err(day, `missing description for ${b}`); continue; }
    const [lo, hi] = descLimits[b] ?? [10, 150];
    const n = words(d);
    if (n < lo || n > hi) warn(day, `description ${b} is ${n} words (expected ${lo}-${hi})`);
  }
  for (const b of bands) {
    const hw = art.helpfulWords?.[b];
    if (!Array.isArray(hw) || hw.length !== 6 || hw.some((w) => typeof w !== "string" || !w.trim()) || new Set(hw.map((w) => w.toLowerCase())).size !== 6) err(day, `helpfulWords.${b} must be 6 different non-empty words`);
  }
  const descs = bands.map((b) => art.descriptions?.[b]).filter(Boolean);
  if (new Set(descs).size !== descs.length) err(day, "two grade bands share identical description text");

  for (const b of bands) {
    const qs = art.questions?.[b];
    if (!qs) { err(day, `missing questions for ${b}`); continue; }
    const seenInBand = new Map();
    for (const c of cats) {
      const q = qs[c];
      if (!nonEmpty(q)) { err(day, `missing question ${b}/${c}`); continue; }
      if (words(q) > 45) warn(day, `question ${b}/${c} is ${words(q)} words`);
      const firstSentence = q.trim().split(/(?<=[?.!])\s/)[0];
      const offersChoice = /\bor\b/i.test(firstSentence) || /[.!?]\s/.test(q.trim());
      if (yesNoStarts.test(q.trim()) && !offersChoice && !/\b(why|how|what|which|where|who|explain|describe)\b/i.test(q))
        warn(day, `question ${b}/${c} may be answerable with yes/no`);
      if (seenInBand.has(q)) err(day, `question ${b}/${c} duplicates ${b}/${seenInBand.get(q)}`);
      seenInBand.set(q, c);
      const list = questionTexts.get(q) ?? [];
      list.push(`${day}/${b}/${c}`);
      questionTexts.set(q, list);
    }
    for (const c of Object.keys(qs)) if (!cats.includes(c)) warn(day, `unknown question category ${b}/${c}`);
  }
}

for (const [q, where] of questionTexts) {
  const days = new Set(where.map((w) => w.split("/")[0]));
  if (days.size > 1) warn(where[0], `identical question reused on ${days.size} artworks: "${q.slice(0, 70)}"`);
}

const missing = allKeys.filter((k) => !present.has(k));
console.log(`Artworks present: ${present.size} of ${allKeys.length} calendar days (365 regular days + leap day 02-29)`);
if (missing.length) console.log(`Missing days: ${missing.length}${missing.length <= 40 ? " (" + missing.join(", ") + ")" : ""}`);
if (warnings.length) { console.log(`\nWarnings (${warnings.length}):`); warnings.slice(0, 60).forEach((w) => console.log("  - " + w)); if (warnings.length > 60) console.log(`  ... and ${warnings.length - 60} more`); }
if (errors.length) { console.log(`\nErrors (${errors.length}):`); errors.slice(0, 80).forEach((e) => console.log("  - " + e)); if (errors.length > 80) console.log(`  ... and ${errors.length - 80} more`); }

console.log(`Image placeholders (no image linked yet): ${pending.length}${pending.length ? " (" + pending.join(", ") + ")" : ""}`);
console.log(`Safety review: ${present.size - screened.length} approved after visual review, ${screened.length} metadata-screened only (image not yet visually confirmed)`);
const incomplete = missing.length > 0;
const unreviewed = screened.length > 0;
if (errors.length) { console.log("\nRESULT: FAILED"); process.exit(1); }
if (incomplete && strict) { console.log("\nRESULT: FAILED (collection incomplete, --strict)"); process.exit(1); }
if (unreviewed && strict) { console.log("\nRESULT: FAILED (images await visual review, --strict)"); process.exit(1); }
console.log(incomplete ? "\nRESULT: existing entries valid, collection INCOMPLETE" : "\nRESULT: PASSED, all days complete");
