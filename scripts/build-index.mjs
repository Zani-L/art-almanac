// Generates public/data/index.json (the lightweight archive list) from the
// per-day artwork files. Run after adding or editing artworks.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, "public/data/artworks");

const files = (await readdir(dir)).filter((f) => /^\d{2}-\d{2}\.json$/.test(f)).sort();
const entries = [];
for (const file of files) {
  const art = JSON.parse(await readFile(path.join(dir, file), "utf8"));
  entries.push({
    id: art.id,
    day: art.day,
    title: art.title,
    artist: art.artist,
    date: art.date,
    ...(art.medium ? { medium: art.medium } : {}),
    ...(art.movement ? { movement: art.movement } : {}),
    ...(art.region ? { region: art.region } : {}),
    ...((art.image.thumbUrl ?? art.image.url) ? { thumbUrl: art.image.thumbUrl ?? art.image.url } : {}),
  });
}

const index = { generatedOn: new Date().toISOString().slice(0, 10), count: entries.length, entries };
await writeFile(path.join(root, "public/data/index.json"), JSON.stringify(index, null, 1) + "\n");
console.log(`index.json: ${entries.length} artworks`);
