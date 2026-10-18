// End-to-end browser tests. Run: node tests/e2e.mjs
// Requires Playwright with a Chromium build (not a project dependency).
// Image requests to museum servers are intercepted and answered with a stub
// PNG, so these tests check the app's behavior, not museum image availability.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE ?? "/home/claude/.npm-global/lib/node_modules/playwright";
const { chromium } = require(pwPath);

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const server = spawn(process.execPath, [path.join(root, "scripts/serve.mjs"), String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 600));

// 1x1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push(name); console.log(`  FAIL ${name}\n       ${String(e.message).split("\n")[0]}`); }
}
const eq = (a, b, msg = "") => { if (a !== b) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg); };

const browser = await chromium.launch({ args: ["--no-sandbox"] });

async function open({ time = "2026-10-16T06:00:00Z", url = "/", viewport = { width: 1280, height: 900 }, blockImages = false, tz = "Asia/Shanghai", beforeLoad = null } = {}) {
  const context = await browser.newContext({ viewport, timezoneId: tz });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !blockImages) errors.push(m.text()); });
  await page.route(/images\.metmuseum\.org/, (route) =>
    blockImages ? route.abort() : route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route(/arthistoryproject\.com/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  if (beforeLoad) await beforeLoad(page);
  await page.clock.install({ time: new Date(time) });
  await page.goto(BASE + url);
  await page.waitForSelector("#date-label:not(:empty)");
  return { page, context, errors };
}
const waitTitle = (page, title) => page.waitForFunction((t) => document.getElementById("art-title").textContent === t, title);
const state = (page) => page.evaluate(() => ({
  title: document.getElementById("art-title").textContent,
  byline: document.getElementById("byline").textContent,
  img: document.getElementById("art-image").getAttribute("src"),
  alt: document.getElementById("art-image").alt,
  desc: document.getElementById("description").textContent,
  q: document.getElementById("question").textContent,
  date: document.getElementById("date-label").textContent,
  status: document.getElementById("status").hidden ? "" : document.getElementById("status").textContent,
  url: location.search,
}));

console.log("Daily selection");

async function pickGrade(page, v) { await page.click("#grade-btn"); await page.click(`#grade-list [role=option][data-value=${v}]`); }
async function pickCat(page, v) { await page.click("#category-btn"); await page.click(`#category-list [role=option][data-value=${v}]`); }
await test("shows the Great Wave on 2026-10-16 in Asia/Shanghai", async () => {
  const { page, context, errors } = await open();
  const s = await state(page);
  eq(s.title, "Under the Wave off Kanagawa (The Great Wave)");
  eq(s.date, "Friday, October 16");
  ok(s.alt.length > 40, "alt text should be descriptive");
  eq(errors.length, 0, `console errors: ${errors.join("|")}`);
  eq(await page.isVisible("#image-fallback"), false, "fallback hidden when image loads");
  eq(await page.isVisible("#art-image"), true, "image visible");
  await context.close();
});

await test("the same instant gives the same artwork on every refresh", async () => {
  const { page, context } = await open();
  const first = await state(page);
  for (let i = 0; i < 3; i++) { await page.reload(); await page.waitForSelector("#art-title:not(:empty)"); eq((await state(page)).title, first.title); eq((await state(page)).img, first.img); }
  await context.close();
});

await test("midnight rollover: 23:59 shows 10-16, then 10-17 after midnight in the school time zone", async () => {
  const { page, context } = await open({ time: "2026-10-16T15:59:30Z" }); // 23:59:30 in Shanghai
  eq((await state(page)).title, "Under the Wave off Kanagawa (The Great Wave)");
  await page.clock.fastForward(75_000);
  await page.waitForFunction(() => document.getElementById("art-title").textContent === "Sunflowers");
  eq((await state(page)).date, "Saturday, October 17");
  await context.close();
});

await test("a different time zone setting changes which day is 'today'", async () => {
  const { page, context } = await open({ time: "2026-10-16T20:30:00Z" }); // 10-17 in Shanghai, 10-16 in LA
  eq((await state(page)).title, "Sunflowers");
  await page.selectOption("#timezone", "America/Los_Angeles");
  await page.waitForFunction(() => document.getElementById("art-title").textContent.startsWith("Under the Wave"));
  eq((await state(page)).date, "Friday, October 16");
  await context.close();
});

console.log("Grade level and question category");
await test("changing grade changes the text but never the artwork", async () => {
  const { page, context } = await open();
  const before = await state(page);
  const seen = new Set();
  for (const id of ["k", "g12", "g35", "g68", "g910", "g1112"]) {
    await pickGrade(page, id);
    const s = await state(page);
    eq(s.title, before.title, `title @${id}`); eq(s.byline, before.byline, `byline @${id}`);
    eq(s.img, before.img, `image @${id}`); eq(s.alt, before.alt, `alt @${id}`); eq(s.date, before.date, `date @${id}`);
    seen.add(s.desc);
  }
  eq(seen.size, 6, "each grade shows a distinct description");
  await context.close();
});

await test("changing category changes only the question", async () => {
  const { page, context } = await open();
  await pickGrade(page, "g68");
  const before = await state(page);
  const questions = new Set([before.q]);
  for (const cat of ["emotion", "color", "light", "culture", "critical"]) {
    await pickCat(page, cat);
    const s = await state(page);
    eq(s.desc, before.desc, `description @${cat}`); eq(s.title, before.title); eq(s.img, before.img);
    questions.add(s.q);
  }
  eq(questions.size, 6, "each category shows a different question");
  await context.close();
});

await test("every grade and category combination renders a non-empty question", async () => {
  const { page, context } = await open();
  const cats = await page.$$eval("#category-list [role=option]", (o) => o.map((x) => x.dataset.value));
  eq(cats.length, 15, "15 categories");
  for (const g of ["k", "g12", "g35", "g68", "g910", "g1112"]) {
    await pickGrade(page, g);
    for (const c of cats) { await pickCat(page, c); ok((await state(page)).q.length > 10, `${g}/${c}`); }
  }
  await context.close();
});

await test("'Another question' cycles categories without changing artwork or description", async () => {
  const { page, context } = await open();
  const before = await state(page);
  await page.click("#another-question");
  const s = await state(page);
  ok(s.q !== before.q, "question changed"); eq(s.desc, before.desc); eq(s.title, before.title);
  eq(await page.getAttribute("#category-list [aria-selected=true]", "data-value"), "emotion");
  await context.close();
});

await test("shared link restores day, grade and category", async () => {
  const { page, context } = await open({ url: "/?day=10-17&grade=k&cat=color" });
  const s = await state(page);
  eq(s.title, "Sunflowers");
  eq((await page.getAttribute("#grade-list [aria-selected=true]", "data-value")) === "k", true);
  eq(await page.getAttribute("#category-list [aria-selected=true]", "data-value"), "color");
  eq(s.q, "Which colors do you see? Which color is the brightest?");
  await context.close();
});

await test("unknown grade/category/day in the URL fall back safely", async () => {
  const { page, context } = await open({ url: "/?day=99-99&grade=zzz&cat=nope" });
  const s = await state(page);
  eq(s.title, "Under the Wave off Kanagawa (The Great Wave)");
  eq(await page.getAttribute("#category-list [aria-selected=true]", "data-value"), "daily");
  await context.close();
});

console.log("Navigation");
await test("previous and next move one day and stay consistent", async () => {
  const { page, context } = await open();
  await page.click("#prev-day");
  await waitTitle(page, "Young Woman with a Water Pitcher");
  eq((await state(page)).date, "Thursday, October 15");
  await page.click("#next-day"); await waitTitle(page, "Under the Wave off Kanagawa (The Great Wave)");
  await page.click("#next-day"); await waitTitle(page, "Sunflowers");
  await page.click("#prev-day"); await waitTitle(page, "Under the Wave off Kanagawa (The Great Wave)");
  await context.close();
});

await test("a day with no artwork shows an honest message, and Back to today works", async () => {
  // All 366 days now exist, so simulate a missing file to test the message.
  const { page, context } = await open({ url: "/?day=10-18", beforeLoad: (pg) => pg.route("**/data/artworks/10-18.json", (r) => r.fulfill({ status: 404, body: "" })) });
  const s = await state(page);
  ok(/No artwork has been added for Sunday, October 18 yet/.test(s.status), s.status);
  eq(await page.isVisible("#artwork"), false);
  await page.click("#go-today");
  await waitTitle(page, "Under the Wave off Kanagawa (The Great Wave)");
  eq(await page.isVisible("#status"), false);
  await context.close();
});

await test("browser back button returns to the previous day", async () => {
  const { page, context } = await open();
  await page.click("#next-day");
  await waitTitle(page, "Sunflowers");
  await page.goBack();
  await page.waitForFunction(() => document.getElementById("art-title").textContent.startsWith("Under the Wave"));
  await context.close();
});

await test("leap day: 02-29 is reachable by link, and skipped by arrows in a common year", async () => {
  const { page, context } = await open({ url: "/?day=02-28", time: "2027-02-10T06:00:00Z" });
  await page.click("#next-day");
  eq((await state(page)).date, "Monday, March 1");
  await page.goto(BASE + "/?day=02-29");
  await page.waitForSelector("#date-label:not(:empty)");
  eq((await state(page)).date, "February 29");
  await context.close();
});

console.log("Images and failure handling");
await test("a failed image keeps the text, shows a clear message, and does not swap artworks", async () => {
  const { page, context } = await open({ blockImages: true });
  await page.waitForSelector("#image-fallback:not([hidden])");
  const s = await state(page);
  eq(s.title, "Under the Wave off Kanagawa (The Great Wave)");
  eq(await page.isHidden("#art-image"), true);
  ok((await page.textContent("#fallback-link")).includes("museum record"));
  ok(s.desc.length > 20 && s.q.length > 10, "text still shown");
  await context.close();
});

console.log("Archive, classroom view, saving");
await test("archive lists curated days, filters by search, and opens an artwork", async () => {
  const { page, context } = await open();
  await page.click("#open-archive");
  eq(await page.locator("#archive-list button").count(), 354);
  ok((await page.textContent("#archive-count")).includes("354 of 366"));
  await page.fill("#archive-search", "water pitcher");
  eq(await page.locator("#archive-list button").count(), 1);
  await page.click("#archive-list button");
  await waitTitle(page, "Young Woman with a Water Pitcher");
  eq(await page.evaluate(() => document.getElementById("archive").open), false);
  await context.close();
});

await test("classroom view hides extras and Escape exits", async () => {
  const { page, context } = await open({ viewport: { width: 1920, height: 1080 } });
  await page.click("#toggle-classroom");
  eq(await page.isVisible("#question"), true);
  eq(await page.isVisible("#description"), false);
  eq(await page.isVisible(".controls"), false);
  await page.keyboard.press("Escape");
  eq(await page.isVisible("#description"), true);
  await context.close();
});

await test("classroom magnifier follows the mouse over the artwork only", async () => {
  const { page, context } = await open({ viewport: { width: 1920, height: 1080 } });
  eq(await page.locator("#lens").isVisible(), false);
  await page.mouse.move(600, 500);
  eq(await page.locator("#lens").isVisible(), false); // not in classroom view yet
  await page.click("#toggle-classroom");
  const box = await page.locator("#art-image").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  eq(await page.locator("#lens").isVisible(), true);
  const bg = await page.evaluate(() => getComputedStyle(document.getElementById("lens")).backgroundImage);
  eq(bg.startsWith("url("), true);
  await page.mouse.move(2, 1070);
  eq(await page.locator("#lens").isVisible(), false);
  await context.close();
});

await test("saving an artwork persists across reloads on the same device", async () => {
  const { page, context } = await open();
  await page.click("#save-btn");
  eq(await page.getAttribute("#save-btn", "aria-pressed"), "true");
  await page.reload(); await page.waitForSelector("#art-title:not(:empty)");
  eq(await page.getAttribute("#save-btn", "aria-pressed"), "true");
  await context.close();
});

console.log("Responsive layout and accessibility basics");
for (const [name, vp] of [["phone 375x667", { width: 375, height: 667 }], ["tablet 820x1180", { width: 820, height: 1180 }], ["laptop 1366x768", { width: 1366, height: 768 }], ["projector 1920x1080", { width: 1920, height: 1080 }]]) {
  await test(`no horizontal overflow on ${name}`, async () => {
    const { page, context } = await open({ viewport: vp });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 0, `page is ${overflow}px wider than the viewport`);
    await context.close();
  });
}

await test("interactive controls are at least 44px tall and have accessible names", async () => {
  const { page, context } = await open({ viewport: { width: 375, height: 667 } });
  const problems = await page.evaluate(() => {
    const out = [];
    for (const n of document.querySelectorAll("button, select, input[type=radio] + span, summary")) {
      if (!(n instanceof HTMLElement) || n.offsetParent === null) continue;
      const r = n.getBoundingClientRect();
      if (r.height < 43.5) out.push(`${n.id || n.tagName} is ${Math.round(r.height)}px tall`);
    }
    for (const n of document.querySelectorAll("button, select, input")) {
      if (n.offsetParent === null) continue;
      const name = n.getAttribute("aria-label") || n.labels?.[0]?.textContent || n.textContent;
      if (!name || !name.trim()) out.push(`${n.id || n.tagName} has no accessible name`);
    }
    return out;
  });
  eq(problems.length, 0, problems.join("; "));
  await context.close();
});

await test("keyboard: both dropdowns open, move, pick and close with the keyboard", async () => {
  const { page, context } = await open();
  await page.focus("#grade-btn");
  await page.keyboard.press("Enter");
  eq(await page.getAttribute("#grade-btn", "aria-expanded"), "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  eq(await page.getAttribute("#grade-btn", "aria-expanded"), "false");
  await page.focus("#category-btn");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  ok((await page.getAttribute("#category-list [aria-selected=true]", "data-value")) !== "daily");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  eq(await page.getAttribute("#category-btn", "aria-expanded"), "false");
  await context.close();
});

await test("reduced motion: no animation is applied to the artwork", async () => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.route(/images\.metmuseum\.org/, (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.goto(BASE + "/");
  await page.waitForSelector("#art-title:not(:empty)");
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector("#art-image")).animationName);
  eq(anim, "none");
  await context.close();
});

await browser.close();
server.kill();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("Failed:\n  - " + failures.join("\n  - ")); process.exit(1); }
