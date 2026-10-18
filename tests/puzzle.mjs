// Puzzle simulation: node tests/puzzle.mjs  (screenshots go to $SHOTS or ./)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "/home/claude/.npm-global/lib/node_modules/playwright");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 4174;
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS ?? ".";
const server = spawn(process.execPath, [path.join(root, "scripts/serve.mjs"), String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
let passed = 0; const fails = [];
const test = async (n, f) => { try { await f(); passed++; console.log("  ok  ", n); } catch (e) { fails.push(n); console.log("  FAIL", n, "\n      ", String(e.message).split("\n")[0]); } };
const eq = (a, b, m = "") => { if (a !== b) throw new Error(`${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

async function openPuzzle(url, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto(BASE + url);
  await page.waitForSelector(".piece");
  return { page, ctx, errors };
}
// Where is piece i right now / where should it go (page coordinates)?
const info = (page) => page.evaluate(() => {
  const st = document.getElementById("stage").getBoundingClientRect();
  const b = document.getElementById("board");
  const bx = parseFloat(b.style.left), by = parseFloat(b.style.top);
  return [...document.querySelectorAll(".piece")].map((el, i) => {
    const w = parseFloat(el.style.width), h = parseFloat(el.style.height);
    const cols = Math.round(parseFloat(b.style.width) / w);
    const col = i % cols, row = Math.floor(i / cols);
    return { i, placed: el.classList.contains("placed"), x: st.left + parseFloat(el.style.left), y: st.top + parseFloat(el.style.top), w, h,
      tx: st.left + bx + col * w, ty: st.top + by + row * h };
  });
});
async function dragTo(page, p, nearX, nearY) {
  await page.mouse.move(p.x + p.w / 2, p.y + p.h / 2);
  await page.mouse.down();
  await page.mouse.move(p.x + p.w / 2 + 5, p.y + p.h / 2 + 5, { steps: 2 });
  await page.mouse.move(nearX + p.w / 2, nearY + p.h / 2, { steps: 12 });
  await page.mouse.up();
}

console.log("Puzzle simulation");
await test("loose pieces start outside the board, nothing is placed", async () => {
  const { page, ctx, errors } = await openPuzzle("/puzzle/?demo=1&seed=7");
  const ps = await info(page);
  eq(ps.length >= 20 && ps.length <= 30, true, "piece count " + ps.length);
  eq(ps.every((p) => !p.placed), true);
  const b = await page.locator("#board").boundingBox();
  const onBoard = ps.filter((p) => p.x + p.w > b.x + 6 && p.x < b.x + b.width - 6 && p.y + p.h > b.y + 6 && p.y < b.y + b.height - 6);
  eq(onBoard.length, 0, "pieces on top of the board");
  await page.screenshot({ path: `${SHOTS}/puzzle-start.png` });
  eq(errors.length, 0, errors.join("|"));
  await ctx.close();
});

await test("a piece dropped far from its spot does not snap", async () => {
  const { page, ctx } = await openPuzzle("/puzzle/?demo=1&seed=7");
  const ps = await info(page);
  const p = ps[0];
  const wrong = ps[ps.length - 1]; // opposite corner of the board
  await dragTo(page, p, wrong.tx, wrong.ty);
  eq((await info(page))[0].placed, false);
  await ctx.close();
});

await test("a piece snaps as soon as it is near its spot, stays, and cannot move again", async () => {
  const { page, ctx } = await openPuzzle("/puzzle/?demo=1&seed=7");
  const p = (await info(page))[5];
  await dragTo(page, p, p.tx + p.w * 0.2, p.ty - p.h * 0.15);
  let now = (await info(page))[5];
  eq(now.placed, true, "placed");
  eq(Math.round(now.x), Math.round(p.tx), "snapped x");
  eq(Math.round(now.y), Math.round(p.ty), "snapped y");
  // try to drag it away
  await page.mouse.move(now.x + now.w / 2, now.y + now.h / 2);
  await page.mouse.down(); await page.mouse.move(now.x + 300, now.y + 200, { steps: 8 }); await page.mouse.up();
  const after = (await info(page))[5];
  eq(Math.round(after.x), Math.round(p.tx), "stayed x");
  eq(Math.round(after.y), Math.round(p.ty), "stayed y");
  eq((await page.locator("#puzzle-progress").textContent()).startsWith("1 of"), true);
  await ctx.close();
});

await test("solving every piece shows the finished artwork and the done message", async () => {
  const { page, ctx, errors } = await openPuzzle("/puzzle/?demo=1&seed=7");
  const ps = await info(page);
  for (let k = 0; k < ps.length * 2; k++) {
    if ((await info(page)).every((q) => q.placed)) break;
    // always take the piece that is on top, so it can be grabbed even where pieces overlap
    const idx = await page.evaluate(() => {
      const els = [...document.querySelectorAll(".piece")];
      let best = -1, z = -1;
      els.forEach((el, i) => { if (!el.classList.contains("placed") && Number(el.style.zIndex) > z) { z = Number(el.style.zIndex); best = i; } });
      return best;
    });
    const p = (await info(page))[idx];
    await dragTo(page, p, p.tx + 3, p.ty + 3);
    if (k === 10) await page.screenshot({ path: `${SHOTS}/puzzle-middle.png` });
  }
  eq((await info(page)).every((p) => p.placed), true);
  eq(await page.locator("#done").isVisible(), true);
  eq(await page.locator("#stage.complete").count(), 1);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/puzzle-done.png`, fullPage: true });
  eq(errors.length, 0, errors.join("|"));
  await ctx.close();
});


const grabbable = (page, i) => page.evaluate((idx) => {
  const els = [...document.querySelectorAll(".piece")]; const el = els[idx]; const r = el.getBoundingClientRect();
  return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el;
}, i);

// Pieces A and A+1 (neighbours in the same row). Park A inside the picture area on a cell that is NOT its own spot
// (when inside=true) or in the stage corner (inside=false). Retries with a reshuffle if a drag path accidentally
// crossed a piece's own spot and locked it (that is correct behaviour, but not what these tests want to look at).
async function parkedPair(page, inside) {
  for (let attempt = 0; attempt < 14; attempt++) {
    let ps = await info(page);
    const bw = await page.locator("#board").evaluate((b) => parseFloat(b.style.width));
    const cols = Math.round(bw / ps[0].w);
    const rows = ps.length / cols;
    const sb = await page.locator("#stage").boundingBox();
    const bb = await page.locator("#board").boundingBox();
    for (let i = 0; i < ps.length - 1; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      if (col === cols - 1 || !(await grabbable(page, i)) || !(await grabbable(page, i + 1))) continue;
      let x = sb.x + 12, y = sb.y + 12;
      if (inside) {
        const c2 = (col + Math.floor(cols / 2)) % (cols - 1), r2 = (row + 1) % rows;
        if (c2 === col && r2 === row) continue;
        x = bb.x + c2 * ps[0].w + 6; y = bb.y + r2 * ps[0].h + 4;
      }
      await dragTo(page, ps[i], x, y);
      ps = await info(page);
      if (!ps[i].placed && !ps[i + 1].placed) return { a: i, ps };
      break;
    }
    await page.click("#shuffle");
  }
  throw new Error("could not set up a pair");
}

await test("inside the picture area, pieces that belong side by side fuse, then move together", async () => {
  const { page, ctx } = await openPuzzle("/puzzle/?demo=1&seed=7");
  let { a, ps } = await parkedPair(page, true);
  const A2 = ps[a], B = ps[a + 1];
  await dragTo(page, B, A2.x + A2.w + 6, A2.y + 5);
  ps = await info(page);
  eq(Math.round(ps[a + 1].x - ps[a].x), Math.round(ps[a].w), "B sits exactly right of A");
  eq(Math.round(ps[a + 1].y - ps[a].y), 0, "same row");
  const before = ps[a + 1];
  await dragTo(page, ps[a], ps[a].x - 20, ps[a].y + 20);
  ps = await info(page);
  eq(Math.round(ps[a + 1].x - ps[a].x), Math.round(ps[a].w), "still joined after move");
  eq(Math.round(ps[a + 1].y - before.y) > 10, true, "B followed A");
  eq(await page.locator(".piece.fused").count() >= 2, true);
  await page.screenshot({ path: `${SHOTS}/puzzle-fused.png` });
  await ctx.close();
});

await test("outside the picture area, matching pieces do NOT fuse", async () => {
  const { page, ctx } = await openPuzzle("/puzzle/?demo=1&seed=7");
  let { a, ps } = await parkedPair(page, false);
  await dragTo(page, ps[a + 1], ps[a].x + ps[a].w + 3, ps[a].y + 3);
  ps = await info(page);
  eq(await page.locator(".piece.fused").count(), 0, "no fusing off the board");
  eq(Math.round(ps[a + 1].x - ps[a].x) === Math.round(ps[a].w) && Math.round(ps[a + 1].y - ps[a].y) === 0, false, "not snapped together");
  await ctx.close();
});

await test("a piece dropped next to a piece it does NOT border does not fuse (even inside the picture)", async () => {
  const { page, ctx } = await openPuzzle("/puzzle/?demo=1&seed=7");
  let { a, ps } = await parkedPair(page, true);
  const far = ps.findIndex((p, i) => i > a + 2 && !p.placed);
  const A2 = ps[a];
  await dragTo(page, ps[far], A2.x + A2.w + 2, A2.y + 2);
  eq(await page.locator(".piece.fused").count(), 0);
  await ctx.close();
});

await test("a fused group dragged to its place on the board locks together", async () => {
  const { page, ctx } = await openPuzzle("/puzzle/?demo=1&seed=7");
  let { a, ps } = await parkedPair(page, true);
  await dragTo(page, ps[a + 1], ps[a].x + ps[a].w + 3, ps[a].y + 3);
  ps = await info(page);
  eq(await page.locator(".piece.fused").count() >= 2, true, "fused first");
  await dragTo(page, ps[a], ps[a].tx + 4, ps[a].ty + 4);
  ps = await info(page);
  eq(ps[a].placed && ps[a + 1].placed, true, "both locked");
  eq(Math.round(ps[a + 1].x), Math.round(ps[a + 1].tx));
  await ctx.close();
});

await test("header matches classroom view: logo, name, date and an exit button", async () => {
  const { page, ctx } = await openPuzzle("/puzzle/?demo=1&seed=7");
  eq(await page.locator(".site-header .logo").count(), 1);
  eq(await page.locator(".site-header .wordmark").textContent(), "Art Almanac");
  eq((await page.locator("#date-label").textContent()).length > 4, true);
  eq((await page.locator("#back-link").textContent()).trim(), "Exit puzzle view");
  await ctx.close();
});

await test("the Pieces menu arrow sits inside the pill", async () => {
  const { page, ctx } = await openPuzzle("/puzzle/?demo=1&seed=7");
  const box = await page.locator("#piece-count").boundingBox();
  const pos = await page.locator("#piece-count").evaluate((el) => getComputedStyle(el).backgroundPosition);
  eq(/right/.test(pos) || /px/.test(pos), true, pos);
  eq(await page.locator("#piece-count").evaluate((el) => getComputedStyle(el).appearance), "none");
  await page.locator("#piece-count").screenshot({ path: `${SHOTS}/pieces-menu.png` });
  eq(box.width > 120, true);
  await ctx.close();
});

await test("piece count changes the number of pieces; shuffle resets", async () => {
  const { page, ctx } = await openPuzzle("/puzzle/?demo=1&seed=7");
  await page.selectOption("#piece-count", "48");
  await page.waitForFunction(() => document.querySelectorAll(".piece").length > 40);
  const n = await page.locator(".piece").count();
  eq(n >= 40 && n <= 56, true, "n=" + n);
  const p = (await info(page))[0];
  await dragTo(page, p, p.tx, p.ty);
  await page.click("#shuffle");
  eq((await info(page)).every((q) => !q.placed), true);
  await ctx.close();
});

await test("keyboard: arrow keys can move a piece into place", async () => {
  const { page, ctx } = await openPuzzle("/puzzle/?demo=1&seed=7");
  const p = (await info(page))[0];
  await page.locator(".piece").first().focus();
  const dx = Math.round(p.tx - p.x), dy = Math.round(p.ty - p.y);
  const hx = dx > 0 ? "ArrowRight" : "ArrowLeft", hy = dy > 0 ? "ArrowDown" : "ArrowUp";
  for (let k = 0; k < Math.abs(dx) / 24; k++) await page.keyboard.press(hx);
  for (let k = 0; k < Math.abs(dy) / 24; k++) await page.keyboard.press(hy);
  eq((await info(page))[0].placed, true);
  await ctx.close();
});

await test("works on a phone-sized screen without errors", async () => {
  const { page, ctx, errors } = await openPuzzle("/puzzle/?demo=1&seed=7", { width: 390, height: 800 });
  await page.screenshot({ path: `${SHOTS}/puzzle-phone.png`, fullPage: true });
  eq(errors.length, 0, errors.join("|"));
  await ctx.close();
});

await test("real artwork loads for a date (picture stubbed) and back link keeps the day", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.route(/images\.metmuseum\.org|arthistoryproject\.com|clevelandart\.org|artic\.edu|\/images\//, (r) => r.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#559092"/><circle cx="450" cy="300" r="200" fill="#ff7350"/></svg>' }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto(BASE + "/puzzle/?d=07-05");
  await page.waitForSelector(".piece");
  eq((await page.locator("#puzzle-title").textContent()).length > 2, true);
  eq(await page.getAttribute("#back-link", "href"), "/?day=07-05");
  await ctx.close();
});

await test("footer button on the home page opens the puzzle for the shown day", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route(/images\.metmuseum\.org|arthistoryproject\.com|clevelandart\.org/, (r) => r.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#3d5dcf"/></svg>' }));
  await page.goto(BASE + "/?day=07-05");
  await page.waitForSelector("#art-title:not(:empty)");
  const href = await page.getAttribute("#puzzle-link", "href");
  eq(href, "/puzzle/?d=07-05");
  await page.locator("#puzzle-link").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/footer.png` });
  await page.click("#puzzle-link");
  await page.waitForSelector(".piece");
  await ctx.close();
});

await browser.close(); server.kill();
console.log(`\n${passed} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
