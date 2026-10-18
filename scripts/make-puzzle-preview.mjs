// Builds puzzle-preview.html: one self-contained file with a demo picture, for trying the puzzle without the website.
import { readFile, writeFile } from "node:fs/promises";
const html = await readFile("public/puzzle/index.html", "utf8");
const css = (await readFile("public/css/styles.css", "utf8")).replace(/url\(["']?\/fonts[^)]*\)/g, "none") + "\n" + (await readFile("public/css/puzzle.css", "utf8"));
const js = await readFile("public/js/puzzle.js", "utf8");
const out = html
  .replace(/<link rel="stylesheet" href="\/css\/styles.css">\s*<link rel="stylesheet" href="\/css\/puzzle.css">/, `<style>${css}</style>`)
  .replace(/<script type="module" src="\/js\/puzzle.js"><\/script>/, "")
  .replace("</body>", `<script>window.PUZZLE_DEMO = true;</script>\n<script type="module">${js}</script>\n</body>`);
await writeFile(process.argv[2] ?? "puzzle-preview.html", out);
console.log("written", out.length, "bytes");
