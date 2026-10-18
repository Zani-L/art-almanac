import {
  DateParts,
  formatDayKey,
  isValidTimeZone,
  keyFromParts,
  parseDayKey,
  shortDayLabel,
  stepKey,
  todayInZone,
} from "./schedule.js";
import type {
  Artwork,
  ArtworkIndex,
  CategoryId,
  GradeBandId,
  IndexEntry,
  SiteConfig,
  Taxonomy,
} from "./types.js";

/* ---------- small helpers ---------- */

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ---------- state ---------- */

interface State {
  key: string;
  grade: GradeBandId;
  category: CategoryId;
  timeZone: string;
  /** True while the page is showing "today" and should roll over at midnight. */
  followingToday: boolean;
  classroom: boolean;
}

let config: SiteConfig;
let taxonomy: Taxonomy;
let index: ArtworkIndex = { generatedOn: "", count: 0, entries: [] };
let state: State;
let currentArtwork: Artwork | null = null;
const cache = new Map<string, Artwork | null>();
const storage = safeStorage();

const SAVED_KEY = "dm.saved";
const GRADE_KEY = "dm.grade";
const TZ_KEY = "dm.tz";

function today(): DateParts {
  return todayInZone(state.timeZone);
}

function readSaved(): string[] {
  try {
    const raw = storage?.getItem(SAVED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeSaved(keys: string[]): void {
  try {
    storage?.setItem(SAVED_KEY, JSON.stringify(keys));
  } catch {
    /* storage unavailable: saving is optional */
  }
}

/* ---------- data ---------- */

async function loadArtwork(key: string): Promise<Artwork | null> {
  if (cache.has(key)) return cache.get(key) ?? null;
  const artwork = await fetchJson<Artwork>(`/data/artworks/${key}.json`);
  cache.set(key, artwork);
  return artwork;
}

/** Choose text for a grade band, falling back to the nearest band that has it. */
function bandOrder(): GradeBandId[] {
  return taxonomy.gradeBands.map((b) => b.id);
}

function pickByBand<T>(source: Record<GradeBandId, T> | undefined, grade: GradeBandId): T | undefined {
  if (!source) return undefined;
  if (source[grade] !== undefined) return source[grade];
  const order = bandOrder();
  const at = order.indexOf(grade);
  for (let distance = 1; distance < order.length; distance++) {
    for (const i of [at - distance, at + distance]) {
      const candidate = order[i];
      if (candidate !== undefined && source[candidate] !== undefined) return source[candidate];
    }
  }
  return undefined;
}

function questionFor(art: Artwork, grade: GradeBandId, category: CategoryId): string {
  const bandQuestions = pickByBand(art.questions, grade);
  return bandQuestions?.[category] ?? bandQuestions?.[taxonomy.defaultCategory] ?? "";
}

/* ---------- URL ---------- */

function readUrl(): { day?: string; grade?: string; cat?: string; tz?: string } {
  const p = new URLSearchParams(window.location.search);
  return {
    day: p.get("day") ?? undefined,
    grade: p.get("grade") ?? undefined,
    cat: p.get("cat") ?? undefined,
    tz: p.get("tz") ?? undefined,
  };
}

function buildUrl(full: boolean): string {
  const p = new URLSearchParams();
  const todayKey = keyFromParts(today());
  if (full || state.key !== todayKey || !state.followingToday) p.set("day", state.key);
  if (full || state.grade !== taxonomy.defaultGrade) p.set("grade", state.grade);
  if (full || state.category !== taxonomy.defaultCategory) p.set("cat", state.category);
  if (state.timeZone !== config.defaultTimeZone) p.set("tz", state.timeZone);
  const qs = p.toString();
  return `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ""}`;
}

function syncUrl(push: boolean): void {
  const url = buildUrl(false);
  const relative = url.slice(window.location.origin.length);
  if (relative === window.location.pathname + window.location.search) return;
  if (push) window.history.pushState(null, "", relative);
  else window.history.replaceState(null, "", relative);
}

/* ---------- rendering ---------- */

function setStatus(message: string | null): void {
  const node = el<HTMLParagraphElement>("status");
  node.hidden = message === null;
  node.textContent = message ?? "";
}

function renderDateLabel(): void {
  const now = today();
  const label = formatDayKey(state.key, now.year);
  const time = el<HTMLTimeElement>("date-label");
  time.textContent = label;
  const parsed = parseDayKey(state.key);
  if (parsed) {
    const mm = String(parsed.month).padStart(2, "0");
    const dd = String(parsed.day).padStart(2, "0");
    time.setAttribute("datetime", `--${mm}-${dd}`);
  }
  el<HTMLButtonElement>("go-today").hidden = state.key === keyFromParts(now);
}

interface Choice {
  value: string;
  label: string;
  title?: string;
}

const CHEVRON = '<svg aria-hidden="true" viewBox="0 0 24 24" width="100%" height="100%"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** A pill-shaped dropdown: a button that opens a listbox. Keyboard and screen-reader friendly. */
class Dropdown {
  private readonly options: HTMLLIElement[] = [];
  private value: string;

  constructor(
    private readonly root: HTMLElement,
    private readonly button: HTMLButtonElement,
    private readonly list: HTMLUListElement,
    private readonly choices: Choice[],
    initial: string,
    private readonly onPick: (value: string) => void,
  ) {
    this.value = initial;
    for (const choice of choices) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.tabIndex = -1;
      li.dataset.value = choice.value;
      if (choice.title) li.title = choice.title;
      const marker = document.createElement("span");
      marker.className = "dd-marker";
      marker.innerHTML = CHEVRON;
      const text = document.createElement("span");
      text.textContent = choice.label;
      li.append(marker, text);
      li.addEventListener("click", () => this.pick(choice.value));
      li.addEventListener("keydown", (event) => this.onOptionKey(event, li));
      this.list.append(li);
      this.options.push(li);
    }
    this.button.addEventListener("click", () => (this.isOpen() ? this.close(true) : this.open()));
    this.button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        this.open();
      }
    });
    document.addEventListener("pointerdown", (event) => {
      if (this.isOpen() && !this.root.contains(event.target as Node)) this.close(false);
    });
    document.addEventListener("dm-dropdown-open", (event) => {
      if ((event as CustomEvent).detail !== this.root && this.isOpen()) this.close(false);
    });
    this.sync();
  }

  isOpen(): boolean {
    return !this.list.hidden;
  }

  private sync(): void {
    const current = this.choices.find((c) => c.value === this.value) ?? this.choices[0];
    const label = this.button.querySelector<HTMLElement>(".dd-text");
    if (label && current) label.textContent = current.label;
    for (const li of this.options) li.setAttribute("aria-selected", String(li.dataset.value === this.value));
  }

  /** Update the shown value without calling onPick. */
  setValue(value: string): void {
    this.value = value;
    this.sync();
  }

  open(): void {
    document.dispatchEvent(new CustomEvent("dm-dropdown-open", { detail: this.root }));
    this.list.hidden = false;
    this.root.classList.add("is-open");
    this.button.setAttribute("aria-expanded", "true");
    (this.options.find((li) => li.dataset.value === this.value) ?? this.options[0])?.focus();
  }

  close(returnFocus: boolean): void {
    this.list.hidden = true;
    this.root.classList.remove("is-open");
    this.button.setAttribute("aria-expanded", "false");
    if (returnFocus) this.button.focus();
  }

  private pick(value: string): void {
    const changed = value !== this.value;
    this.value = value;
    this.sync();
    this.close(true);
    if (changed) this.onPick(value);
  }

  private onOptionKey(event: KeyboardEvent, li: HTMLLIElement): void {
    const i = this.options.indexOf(li);
    const move = (n: number): void => {
      event.preventDefault();
      this.options[(n + this.options.length) % this.options.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown": return move(i + 1);
      case "ArrowUp": return move(i - 1);
      case "Home": return move(0);
      case "End": return move(this.options.length - 1);
      case "Enter":
      case " ":
        event.preventDefault();
        this.pick(li.dataset.value ?? this.value);
        return;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        return;
      case "Tab":
        this.close(false);
        return;
      default: {
        if (event.key.length === 1 && /\S/.test(event.key)) {
          const typed = event.key.toLowerCase();
          const n = this.options.findIndex((o, k) => k > i && (o.textContent ?? "").trim().toLowerCase().startsWith(typed));
          const m = n >= 0 ? n : this.options.findIndex((o) => (o.textContent ?? "").trim().toLowerCase().startsWith(typed));
          if (m >= 0) move(m);
        }
      }
    }
  }
}

let gradeDropdown: Dropdown | undefined;
let categoryDropdown: Dropdown | undefined;

function renderGradeOptions(): void {
  const root = el<HTMLElement>("grade-dd");
  gradeDropdown = new Dropdown(
    root,
    el<HTMLButtonElement>("grade-btn"),
    el<HTMLUListElement>("grade-list"),
    taxonomy.gradeBands.map((b) => ({ value: b.id, label: b.label })),
    state.grade,
    (value) => {
      state.grade = value;
      try {
        storage?.setItem(GRADE_KEY, value);
      } catch {
        /* optional */
      }
      renderLearning();
      syncUrl(false);
    },
  );
}

function renderCategoryOptions(): void {
  const root = el<HTMLElement>("category-dd");
  categoryDropdown = new Dropdown(
    root,
    el<HTMLButtonElement>("category-btn"),
    el<HTMLUListElement>("category-list"),
    taxonomy.categories.map((c) => ({ value: c.id, label: c.label, title: c.description })),
    state.category,
    (value) => {
      state.category = value;
      renderLearning();
      syncUrl(false);
    },
  );
}

/** Set text on a button's label span, keeping its icon. */
function setLabel(btn: HTMLElement, text: string): void {
  const span = btn.querySelector<HTMLElement>(".btn-label");
  if (span) span.textContent = text;
  else btn.textContent = text;
}

function renderTimeZoneOptions(): void {
  const select = el<HTMLSelectElement>("timezone");
  select.replaceChildren();
  const zones = Array.from(new Set([config.defaultTimeZone, ...config.timeZoneOptions, state.timeZone]));
  for (const zone of zones) {
    const option = document.createElement("option");
    option.value = zone;
    option.textContent = zone.replace(/_/g, " ");
    select.append(option);
  }
  select.value = state.timeZone;
}

/** Updates only the grade-dependent text. Never touches the image or metadata. */
function renderLearning(): void {
  const art = currentArtwork;
  if (!art) return;
  const description = pickByBand(art.descriptions, state.grade) ?? art.context;
  el<HTMLParagraphElement>("description").textContent = description;
  renderVocab(art, true);
  el<HTMLParagraphElement>("question").textContent = questionFor(art, state.grade, state.category);
  const band = taxonomy.gradeBands.find((b) => b.id === state.grade);
  el<HTMLParagraphElement>("cue").textContent = band?.cue ?? "";
}

function renderVocab(art: Artwork, keepOpen = false): void {
  const box = el<HTMLDetailsElement>("vocab");
  const list = el<HTMLUListElement>("vocab-list");
  list.replaceChildren();
  const words = pickByBand(art.helpfulWords, state.grade) ?? art.teacherNote?.vocabulary ?? [];
  for (const w of words) {
    const li = document.createElement("li");
    li.textContent = w;
    list.append(li);
  }
  box.hidden = words.length === 0;
  if (!keepOpen) box.open = false;
}

function renderTeacher(art: Artwork): void {
  renderVocab(art);
  const details = el<HTMLDetailsElement>("teacher");
  const body = el<HTMLDivElement>("teacher-body");
  body.replaceChildren();
  const note = art.teacherNote;
  if (!note || (!note.context && !note.vocabulary?.length && !note.directions?.length)) {
    details.hidden = true;
    return;
  }
  const addHeading = (text: string): void => {
    const h = document.createElement("h3");
    h.textContent = text;
    body.append(h);
  };
  const addList = (items: string[]): void => {
    const ul = document.createElement("ul");
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item;
      ul.append(li);
    }
    body.append(ul);
  };
  if (note.context) {
    addHeading("Background");
    const p = document.createElement("p");
    p.textContent = note.context;
    body.append(p);
  }
  if (note.vocabulary?.length) {
    addHeading("Useful vocabulary");
    addList(note.vocabulary);
  }
  if (note.directions?.length) {
    addHeading("Ways to extend the discussion");
    addList(note.directions);
  }
  details.hidden = false;
  details.open = false;
}

function renderImage(art: Artwork): void {
  const img = el<HTMLImageElement>("art-image");
  const fallback = el<HTMLDivElement>("image-fallback");
  const link = el<HTMLAnchorElement>("fallback-link");
  link.href = art.source.url;
  fallback.hidden = true;
  img.hidden = false;
  img.alt = art.altText;
  const note = document.getElementById("fallback-note");
  if (!art.image.url) {
    // No image linked yet: show a placeholder, keep every other field visible.
    img.hidden = true;
    img.removeAttribute("src");
    if (note) note.textContent = "Image coming soon";
    const detail = document.getElementById("fallback-detail");
    if (detail) detail.textContent = "The picture for this artwork has not been added yet. You can still read about it and discuss it.";
    fallback.hidden = false;
    return;
  }
  if (note) note.textContent = "The image could not be loaded.";
  const detail = document.getElementById("fallback-detail");
  if (detail) detail.textContent = "Check your connection and refresh the page. You can still read about the artwork and discuss it.";
  if (art.image.width && art.image.height) {
    img.width = art.image.width;
    img.height = art.image.height;
  } else {
    img.removeAttribute("width");
    img.removeAttribute("height");
  }
  img.onerror = () => {
    img.hidden = true;
    fallback.hidden = false;
  };
  img.onload = () => {
    fallback.hidden = true;
    img.hidden = false;
  };
  img.src = art.image.url;
}

function renderSaveButton(): void {
  const btn = el<HTMLButtonElement>("save-btn");
  const saved = readSaved().includes(state.key);
  btn.setAttribute("aria-pressed", String(saved));
  setLabel(btn, saved ? "Saved on this device" : "Save this artwork");
}

function renderArtwork(art: Artwork): void {
  const exhibit = el<HTMLElement>("artwork");
  exhibit.hidden = false;
  exhibit.classList.remove("is-entering");
  void exhibit.offsetWidth;
  exhibit.classList.add("is-entering");

  el<HTMLHeadingElement>("art-title").textContent = art.title;
  el<HTMLParagraphElement>("byline").textContent = `${art.artist}, ${art.date}`;

  const facts = el<HTMLParagraphElement>("facts");
  facts.replaceChildren();
  const lines = [art.medium, [art.movement, art.region].filter(Boolean).join(", ")].filter(
    (l): l is string => Boolean(l),
  );
  for (const line of lines) {
    const span = document.createElement("span");
    span.textContent = line;
    facts.append(span);
  }

  renderImage(art);
  el<HTMLElement>("credit").textContent = art.image.url
    ? [art.image.credit, art.image.license].filter(Boolean).join(". ") + "."
    : "";

  const source = el<HTMLParagraphElement>("source");
  source.replaceChildren();
  const a = document.createElement("a");
  a.href = art.source.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = `${art.source.museum} collection record`;
  source.append("Learn more: ", a, ".");

  renderLearning();
  renderTeacher(art);
  renderSaveButton();
  document.title = `${art.title}, ${art.artist}: Art Almanac`;
}

function renderMissing(): void {
  currentArtwork = null;
  el<HTMLElement>("artwork").hidden = true;
  const label = formatDayKey(state.key, today().year);
  setStatus(
    `No artwork has been added for ${label} yet. Use the arrows or the archive to see the days that are ready.`,
  );
  document.title = "Art Almanac";
}

/* ---------- navigation ---------- */

async function show(key: string, push: boolean): Promise<void> {
  state.key = key;
  state.followingToday = key === keyFromParts(today());
  renderDateLabel();
  const puzzleLink = document.getElementById("puzzle-link");
  if (puzzleLink) puzzleLink.setAttribute("href", `/puzzle/?d=${key}`);
  const art = await loadArtwork(key);
  // The user may have navigated again while this request was in flight.
  if (state.key !== key) return;
  if (!art) {
    renderMissing();
  } else {
    setStatus(null);
    currentArtwork = art;
    renderArtwork(art);
  }
  syncUrl(push);
  highlightArchive();
}

function step(delta: number): void {
  void show(stepKey(state.key, delta, today().year), true);
}

/* ---------- archive ---------- */

function highlightArchive(): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>("#archive-list button")) {
    if (btn.dataset.day === state.key) btn.setAttribute("aria-current", "true");
    else btn.removeAttribute("aria-current");
  }
}

function renderArchiveList(): void {
  const query = el<HTMLInputElement>("archive-search").value.trim().toLowerCase();
  const month = el<HTMLSelectElement>("archive-month").value;
  const savedOnly = el<HTMLInputElement>("archive-saved").checked;
  const saved = new Set(readSaved());
  const list = el<HTMLUListElement>("archive-list");
  list.replaceChildren();

  const matches = index.entries.filter((e: IndexEntry) => {
    if (month && e.day.slice(0, 2) !== month) return false;
    if (savedOnly && !saved.has(e.day)) return false;
    if (!query) return true;
    return [e.title, e.artist, e.movement, e.medium, e.region, e.date]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  el<HTMLParagraphElement>("archive-count").textContent =
    `${index.count} of 366 days have an artwork so far. Showing ${matches.length}.`;

  if (matches.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No artworks match. Try a different search.";
    list.append(li);
    return;
  }

  for (const entry of matches) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.day = entry.day;
    const when = document.createElement("span");
    when.className = "when";
    when.textContent = shortDayLabel(entry.day);
    const img = document.createElement("img");
    if (entry.thumbUrl) img.src = entry.thumbUrl;
    else img.classList.add("no-thumb");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    const what = document.createElement("span");
    what.className = "what";
    what.textContent = entry.title;
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = `${entry.artist}, ${entry.date}`;
    what.append(who);
    btn.append(when, img, what);
    btn.addEventListener("click", () => {
      el<HTMLDialogElement>("archive").close();
      void show(entry.day, true);
      window.scrollTo({ top: 0 });
    });
    li.append(btn);
    list.append(li);
  }
  highlightArchive();
}

function setupArchive(): void {
  const month = el<HTMLSelectElement>("archive-month");
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All months";
  month.append(all);
  for (let m = 1; m <= 12; m++) {
    const option = document.createElement("option");
    option.value = String(m).padStart(2, "0");
    option.textContent = new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2000, m - 1, 1)),
    );
    month.append(option);
  }
  for (const id of ["archive-search", "archive-month", "archive-saved"]) {
    el(id).addEventListener("input", renderArchiveList);
  }
  el<HTMLButtonElement>("open-archive").addEventListener("click", () => {
    renderArchiveList();
    el<HTMLDialogElement>("archive").showModal();
  });
}

/* ---------- classroom view ---------- */

function setClassroom(on: boolean): void {
  state.classroom = on;
  document.body.classList.toggle("classroom", on);
  const btn = el<HTMLButtonElement>("toggle-classroom");
  btn.setAttribute("aria-pressed", String(on));
  btn.textContent = on ? "Exit classroom view" : "Classroom view";
  const lens = document.getElementById("lens");
  if (lens && !on) lens.hidden = true;
}

/* ---------- classroom magnifier ---------- */

function initMagnifier(): void {
  const frame = el("frame");
  const img = el<HTMLImageElement>("art-image");
  const lens = document.createElement("div");
  lens.id = "lens";
  lens.setAttribute("aria-hidden", "true");
  lens.hidden = true;
  frame.appendChild(lens);

  let zoom = 3;
  const MIN = 1.5;
  const MAX = 8;

  // Where the picture is actually drawn inside the box (object-fit: contain leaves empty bands).
  const drawnRect = () => {
    const box = img.getBoundingClientRect();
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return null;
    const scale = Math.min(box.width / nw, box.height / nh);
    const w = nw * scale;
    const h = nh * scale;
    return { left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2, w, h };
  };

  const move = (event: PointerEvent) => {
    if (!state.classroom || !img.complete || !img.currentSrc) { lens.hidden = true; return; }
    const r = drawnRect();
    if (!r) { lens.hidden = true; return; }
    const x = event.clientX - r.left;
    const y = event.clientY - r.top;
    if (x < 0 || y < 0 || x > r.w || y > r.h) { lens.hidden = true; return; }
    const size = lens.offsetWidth || 220;
    const fb = frame.getBoundingClientRect();
    lens.hidden = false;
    lens.style.left = `${event.clientX - fb.left - size / 2}px`;
    lens.style.top = `${event.clientY - fb.top - size / 2}px`;
    lens.style.backgroundImage = `url("${img.currentSrc}")`;
    lens.style.backgroundSize = `${r.w * zoom}px ${r.h * zoom}px`;
    lens.style.backgroundPosition = `${size / 2 - x * zoom}px ${size / 2 - y * zoom}px`;
  };

  frame.addEventListener("pointermove", move);
  frame.addEventListener("pointerdown", move);
  frame.addEventListener("pointerleave", () => { lens.hidden = true; });
  frame.addEventListener("wheel", (event) => {
    if (!state.classroom) return;
    event.preventDefault();
    zoom = Math.min(MAX, Math.max(MIN, zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
    move(event as unknown as PointerEvent);
  }, { passive: false });
}

/* ---------- wiring ---------- */

function wireEvents(): void {
  initMagnifier();
  el("prev-day").addEventListener("click", () => step(-1));
  el("next-day").addEventListener("click", () => step(1));
  el("go-today").addEventListener("click", () => void show(keyFromParts(today()), true));

  el("another-question").addEventListener("click", () => {
    const ids = taxonomy.categories.map((c) => c.id);
    const next = ids[(ids.indexOf(state.category) + 1) % ids.length] ?? taxonomy.defaultCategory;
    state.category = next;
    categoryDropdown?.setValue(next);
    renderLearning();
    syncUrl(false);
  });

  el("timezone").addEventListener("change", (event) => {
    const zone = (event.target as HTMLSelectElement).value;
    if (!isValidTimeZone(zone)) return;
    state.timeZone = zone;
    try {
      storage?.setItem(TZ_KEY, zone);
    } catch {
      /* optional */
    }
    // Changing the time zone changes what "today" is, so go to it.
    void show(keyFromParts(today()), false);
  });

  el("save-btn").addEventListener("click", () => {
    const saved = new Set(readSaved());
    if (saved.has(state.key)) saved.delete(state.key);
    else saved.add(state.key);
    writeSaved([...saved]);
    renderSaveButton();
  });

  el<HTMLButtonElement>("share-btn").addEventListener("click", async () => {
    const btn = el<HTMLButtonElement>("share-btn");
    const url = buildUrl(true);
    try {
      await navigator.clipboard.writeText(url);
      setLabel(btn, "Link copied");
    } catch {
      window.prompt("Copy this link", url);
      setLabel(btn, "Copy link");
    }
    window.setTimeout(() => setLabel(btn, "Copy link"), 2000);
  });

  el("toggle-classroom").addEventListener("click", () => setClassroom(!state.classroom));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.classroom) setClassroom(false);
  });

  window.addEventListener("popstate", () => {
    const url = readUrl();
    const key = url.day && parseDayKey(url.day) ? url.day : keyFromParts(today());
    void show(key, false);
  });

  // Roll over to the new day while the page stays open, but only if the
  // viewer is following today. Someone browsing the archive is left alone.
  window.setInterval(() => {
    const todayKey = keyFromParts(today());
    if (state.followingToday && state.key !== todayKey) void show(todayKey, false);
  }, 60_000);
}

async function init(): Promise<void> {
  const [cfg, tax, idx] = await Promise.all([
    fetchJson<SiteConfig>("/config.json"),
    fetchJson<Taxonomy>("/data/taxonomy.json"),
    fetchJson<ArtworkIndex>("/data/index.json"),
  ]);
  if (!cfg || !tax) {
    setStatus("Art Almanac could not load its settings. Please refresh the page.");
    return;
  }
  config = cfg;
  taxonomy = tax;
  if (idx) index = idx;

  const url = readUrl();
  const storedTz = storage?.getItem(TZ_KEY) ?? undefined;
  const timeZone = [url.tz, storedTz, config.defaultTimeZone, "UTC"].find(
    (z): z is string => Boolean(z) && isValidTimeZone(z as string),
  ) as string;

  const knownGrade = (g?: string | null): g is string => !!g && tax.gradeBands.some((b) => b.id === g);
  const knownCategory = (c?: string | null): c is string => !!c && tax.categories.some((x) => x.id === c);
  const storedGrade = storage?.getItem(GRADE_KEY);

  state = {
    key: "",
    grade: knownGrade(url.grade) ? url.grade : knownGrade(storedGrade) ? storedGrade : tax.defaultGrade,
    category: knownCategory(url.cat) ? url.cat : tax.defaultCategory,
    timeZone,
    followingToday: !url.day,
    classroom: false,
  };

  renderGradeOptions();
  renderCategoryOptions();
  renderTimeZoneOptions();
  setupArchive();
  wireEvents();

  const startKey = url.day && parseDayKey(url.day) ? url.day : keyFromParts(today());
  await show(startKey, false);
}

void init();
