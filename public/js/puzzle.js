"use strict";
/* Artwork puzzle: rebuild the artwork of the day from square pieces. No dependencies. */
const $ = (id) => {
    const node = document.getElementById(id);
    if (!node)
        throw new Error(`Missing #${id}`);
    return node;
};
const stage = $("stage");
const board = $("board");
const progress = $("puzzle-progress");
const countSelect = $("piece-count");
const guideBox = $("show-guide");
const doneBox = $("done");
let imageUrl = "";
let naturalW = 0;
let naturalH = 0;
let cols = 0;
let rows = 0;
let cellW = 0;
let cellH = 0;
let boardX = 0;
let boardY = 0;
let pieces = [];
let zTop = 100;
let stageW = 0;
let stageH = 0;
let caption = "";
// Optional ?seed=N makes the scatter repeatable (used by the automated tests).
let rng = Math.random;
function seeded(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function store() {
    try {
        return window.localStorage;
    }
    catch {
        return null;
    }
}
/** Pick columns and rows so that the pieces are close to square for this picture. */
function gridFor(total, aspect) {
    let best = { c: 1, r: total, score: Infinity };
    for (let c = 2; c <= total; c++) {
        const r = Math.max(2, Math.round(total / c));
        const cellAspect = (aspect * r) / c; // width / height of a piece
        const score = Math.abs(Math.log(cellAspect)) * 3 + Math.abs(c * r - total) / total;
        if (score < best.score)
            best = { c, r, score };
    }
    return { c: best.c, r: best.r };
}
/** A painted demo picture so the page can be tried without any artwork data: puzzle/?demo=1 */
function demoImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 800;
    const g = canvas.getContext("2d");
    if (!g)
        return "";
    const sky = g.createLinearGradient(0, 0, 0, 800);
    sky.addColorStop(0, "#3d5dcf");
    sky.addColorStop(0.55, "#91bce6");
    sky.addColorStop(1, "#ffe3c2");
    g.fillStyle = sky;
    g.fillRect(0, 0, 1200, 800);
    g.fillStyle = "#ff7350";
    g.beginPath();
    g.arc(880, 250, 120, 0, Math.PI * 2);
    g.fill();
    const hills = [["#559092", 520, 90], ["#00585c", 600, 120], ["#1a3d3f", 690, 70]];
    for (const [color, y, amp] of hills) {
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(0, 800);
        g.lineTo(0, y);
        for (let x = 0; x <= 1200; x += 20)
            g.lineTo(x, y + Math.sin(x / 140 + y) * amp * 0.5);
        g.lineTo(1200, 800);
        g.closePath();
        g.fill();
    }
    g.strokeStyle = "#fff";
    g.lineWidth = 6;
    for (let i = 0; i < 7; i++) {
        g.beginPath();
        g.arc(160 + i * 140, 130 + (i % 3) * 40, 38, 0, Math.PI * 2);
        g.stroke();
    }
    g.fillStyle = "#eceae4";
    g.fillRect(140, 540, 90, 140);
    g.fillStyle = "#ff7350";
    g.fillRect(140, 520, 90, 30);
    g.fillStyle = "#1a1a1a";
    g.font = "bold 70px sans-serif";
    g.fillText("DEMO", 470, 440);
    return canvas.toDataURL("image/png");
}
function todayKey() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${mm}-${dd}`;
}
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("image"));
        img.src = url;
    });
}
/* ---------- layout ---------- */
function layoutBoard() {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    // The board takes about 58% of the width and 70% of the height so there is room around it for loose pieces.
    const maxW = sw * 0.58;
    const maxH = sh * 0.7;
    const scale = Math.min(maxW / naturalW, maxH / naturalH);
    cellW = Math.max(18, Math.floor((naturalW * scale) / cols));
    cellH = Math.max(18, Math.floor((naturalH * scale) / rows));
    const bw = cellW * cols;
    const bh = cellH * rows;
    boardX = Math.round((sw - bw) / 2);
    boardY = Math.round((sh - bh) / 2);
    Object.assign(board.style, { left: `${boardX}px`, top: `${boardY}px`, width: `${bw}px`, height: `${bh}px` });
    board.style.backgroundImage = guideBox.checked ? `linear-gradient(rgba(255,255,255,.72), rgba(255,255,255,.72)), url("${imageUrl}")` : "none";
    board.style.backgroundSize = `${bw}px ${bh}px`;
}
function sizePiece(p) {
    const st = p.el.style;
    st.width = `${cellW}px`;
    st.height = `${cellH}px`;
    st.backgroundSize = `${cellW * cols}px ${cellH * rows}px`;
    st.backgroundPosition = `${-p.col * cellW}px ${-p.row * cellH}px`;
}
const anchorOf = (g) => g.members[0];
/** Put every piece of a group where the group says it should be. */
function applyGroup(g) {
    const a = anchorOf(g);
    for (const m of g.members) {
        m.el.style.left = `${g.x + (m.col - a.col) * cellW}px`;
        m.el.style.top = `${g.y + (m.row - a.row) * cellH}px`;
    }
}
/** Show which sides of each piece are joined to a neighbour: joined sides lose their edge line. */
function styleGroup(g) {
    const has = new Set(g.members.map((m) => `${m.col},${m.row}`));
    const fused = g.members.length > 1;
    for (const m of g.members) {
        m.el.classList.toggle("fused", fused);
        if (!fused || g.placed) {
            m.el.style.boxShadow = "";
            continue;
        }
        const edge = "rgba(255,255,255,.75)";
        const parts = [];
        if (!has.has(`${m.col},${m.row - 1}`))
            parts.push(`inset 0 1px 0 0 ${edge}`);
        if (!has.has(`${m.col},${m.row + 1}`))
            parts.push(`inset 0 -1px 0 0 ${edge}`);
        if (!has.has(`${m.col - 1},${m.row}`))
            parts.push(`inset 1px 0 0 0 ${edge}`);
        if (!has.has(`${m.col + 1},${m.row}`))
            parts.push(`inset -1px 0 0 0 ${edge}`);
        m.el.style.boxShadow = parts.join(", ");
    }
}
function lockGroup(g, animate) {
    const a = anchorOf(g);
    g.placed = true;
    g.x = boardX + a.col * cellW;
    g.y = boardY + a.row * cellH;
    applyGroup(g);
    for (const m of g.members) {
        m.el.classList.remove("dragging", "fuse-flash");
        m.el.classList.add("placed");
        if (animate)
            m.el.classList.add("pop");
        m.el.tabIndex = -1;
        m.el.setAttribute("aria-disabled", "true");
        m.el.setAttribute("aria-label", `Piece ${m.row * cols + m.col + 1}, placed`);
        m.el.style.boxShadow = "";
    }
    updateProgress();
}
function mergeGroups(into, other) {
    for (const m of other.members) {
        m.group = into;
        into.members.push(m);
    }
    other.members = [];
}
function overlapArea(ax, ay, bx, by) {
    const w = Math.max(0, Math.min(ax + cellW, bx + cellW) - Math.max(ax, bx));
    const h = Math.max(0, Math.min(ay + cellH, by + cellH) - Math.max(ay, by));
    return w * h;
}
/** Scatter loose pieces over the part of the stage that is not the board, with as little overlap as possible. */
function scatter(list) {
    const gap = 8;
    const bx0 = boardX - gap, by0 = boardY - gap, bx1 = boardX + cols * cellW + gap, by1 = boardY + rows * cellH + gap;
    const taken = [];
    for (const p of list) {
        let best = [0, 0];
        let bestScore = Infinity;
        for (let t = 0; t < 80; t++) {
            const x = rng() * Math.max(1, stageW - cellW);
            const y = rng() * Math.max(1, stageH - cellH);
            const onBoard = x < bx1 && x + cellW > bx0 && y < by1 && y + cellH > by0;
            let score = onBoard ? 1e9 : 0;
            if (!onBoard)
                for (const [tx, ty] of taken)
                    score += overlapArea(x, y, tx, ty);
            if (score < bestScore) {
                bestScore = score;
                best = [x, y];
                if (score === 0)
                    break;
            }
        }
        taken.push(best);
        p.group.x = best[0];
        p.group.y = best[1];
        applyGroup(p.group);
        p.el.style.zIndex = String(10 + taken.length);
    }
}
function groupsOf() {
    return [...new Set(pieces.map((p) => p.group))];
}
function clampGroup(g) {
    const a = anchorOf(g);
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const m of g.members) {
        minC = Math.min(minC, m.col - a.col);
        maxC = Math.max(maxC, m.col - a.col);
        minR = Math.min(minR, m.row - a.row);
        maxR = Math.max(maxR, m.row - a.row);
    }
    g.x = Math.min(Math.max(-minC * cellW, g.x), stageW - (maxC + 1) * cellW);
    g.y = Math.min(Math.max(-minR * cellH, g.y), stageH - (maxR + 1) * cellH);
}
function relayout() {
    if (!pieces.length)
        return;
    const oldW = stageW, oldH = stageH;
    stageW = stage.clientWidth;
    stageH = stage.clientHeight;
    layoutBoard();
    for (const p of pieces)
        sizePiece(p);
    for (const g of groupsOf()) {
        if (g.placed) {
            const a = anchorOf(g);
            g.x = boardX + a.col * cellW;
            g.y = boardY + a.row * cellH;
        }
        else {
            g.x = (g.x / oldW) * stageW;
            g.y = (g.y / oldH) * stageH;
            clampGroup(g);
        }
        applyGroup(g);
    }
}
/* ---------- play ---------- */
function updateProgress() {
    const done = pieces.filter((p) => p.group.placed).length;
    if (done === pieces.length && pieces.length > 0) {
        progress.textContent = `All ${pieces.length} pieces are in place!`;
        stage.classList.add("complete");
        board.style.outline = "none";
        $("done-caption").textContent = caption;
        doneBox.hidden = false;
    }
    else {
        progress.textContent = `${done} of ${pieces.length} pieces in place`;
    }
}
/** True when every piece of the group sits inside the picture area (judged by the middle of each piece). */
function insideBoard(g) {
    const a = anchorOf(g);
    const slack = 2;
    return g.members.every((m) => {
        const cx = g.x + (m.col - a.col) * cellW + cellW / 2;
        const cy = g.y + (m.row - a.row) * cellH + cellH / 2;
        return cx >= boardX - slack && cx <= boardX + cols * cellW + slack && cy >= boardY - slack && cy <= boardY + rows * cellH + slack;
    });
}
/**
 * After a group has moved: (1) if it is close to its own spot on the board it locks there, otherwise
 * (2) if any piece lines up with its true neighbour it fuses with it, but only while both are inside the picture area.
 * Repeats, because one fuse can line up another.
 */
function settle(g) {
    const near = Math.min(cellW, cellH) * 0.38;
    let current = g;
    let fused = false;
    for (let guard = 0; guard < pieces.length; guard++) {
        if (current.placed)
            return { locked: true, fused };
        const a = anchorOf(current);
        if (Math.hypot(current.x - (boardX + a.col * cellW), current.y - (boardY + a.row * cellH)) <= near) {
            lockGroup(current, true);
            return { locked: true, fused };
        }
        let joined = false;
        if (!insideBoard(current))
            break;
        outer: for (const m of current.members) {
            const ox = current.x + (m.col - a.col) * cellW;
            const oy = current.y + (m.row - a.row) * cellH;
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const n = pieces[(m.row + dr) * cols + (m.col + dc)];
                if (!n || m.col + dc < 0 || m.col + dc >= cols || m.row + dr < 0 || m.row + dr >= rows)
                    continue;
                if (n.group === current || !insideBoard(n.group))
                    continue;
                const na = anchorOf(n.group);
                const nx = n.group.x + (n.col - na.col) * cellW;
                const ny = n.group.y + (n.row - na.row) * cellH;
                const idealX = nx - dc * cellW;
                const idealY = ny - dr * cellH;
                if (Math.hypot(ox - idealX, oy - idealY) <= near) {
                    const other = n.group;
                    current.x += idealX - ox;
                    current.y += idealY - oy;
                    mergeGroups(other.placed ? other : current, other.placed ? current : other);
                    current = other.placed ? other : current;
                    if (other.placed) {
                        lockGroup(current, true);
                        return { locked: true, fused: true };
                    }
                    applyGroup(current);
                    styleGroup(current);
                    for (const x of current.members) {
                        x.el.classList.remove("fuse-flash");
                        void x.el.offsetWidth;
                        x.el.classList.add("fuse-flash");
                    }
                    fused = true;
                    joined = true;
                    break outer;
                }
            }
        }
        if (!joined)
            break;
    }
    return { locked: current.placed, fused };
}
function startDrag(p, event) {
    if (p.group.placed)
        return;
    event.preventDefault();
    const el = p.el;
    let g = p.group;
    const rect = stage.getBoundingClientRect();
    const offX = event.clientX - rect.left - g.x;
    const offY = event.clientY - rect.top - g.y;
    el.setPointerCapture(event.pointerId);
    for (const m of g.members) {
        m.el.classList.add("dragging");
        m.el.style.zIndex = String(++zTop);
    }
    const move = (e) => {
        const r = stage.getBoundingClientRect();
        g.x = e.clientX - r.left - offX;
        g.y = e.clientY - r.top - offY;
        clampGroup(g);
        applyGroup(g);
        const result = settle(g);
        g = p.group;
        if (result.locked)
            end();
        else if (result.fused)
            for (const m of g.members) {
                m.el.classList.add("dragging");
                m.el.style.zIndex = String(++zTop);
            }
    };
    const end = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
        if (el.hasPointerCapture(event.pointerId))
            el.releasePointerCapture(event.pointerId);
        for (const m of p.group.members)
            m.el.classList.remove("dragging");
        styleGroup(p.group);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
}
function onKey(p, event) {
    if (p.group.placed)
        return;
    const step = event.shiftKey ? 96 : 24;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = d[event.key];
    if (!move)
        return;
    event.preventDefault();
    const g = p.group;
    g.x += move[0];
    g.y += move[1];
    clampGroup(g);
    applyGroup(g);
    const result = settle(g);
    if (result.locked)
        p.el.blur();
    else
        styleGroup(p.group);
}
function build() {
    for (const p of pieces)
        p.el.remove();
    pieces = [];
    doneBox.hidden = true;
    stage.classList.remove("complete");
    board.style.outline = "";
    stageW = stage.clientWidth;
    stageH = stage.clientHeight;
    const total = Number(countSelect.value) || 24;
    const g = gridFor(total, naturalW / naturalH);
    cols = g.c;
    rows = g.r;
    layoutBoard();
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const el = document.createElement("button");
            el.type = "button";
            el.className = "piece";
            el.style.backgroundImage = `url("${imageUrl}")`;
            el.setAttribute("aria-label", `Piece ${r * cols + c + 1}, not placed. Use the arrow keys to move it.`);
            const group = { members: [], x: 0, y: 0, placed: false };
            const piece = { el, col: c, row: r, group };
            group.members.push(piece);
            el.addEventListener("pointerdown", (e) => startDrag(piece, e));
            el.addEventListener("keydown", (e) => onKey(piece, e));
            stage.appendChild(el);
            pieces.push(piece);
            sizePiece(piece);
        }
    }
    scatter(pieces);
    updateProgress();
}
function showError(message) {
    const box = $("puzzle-error");
    box.textContent = message;
    box.hidden = false;
    progress.textContent = "";
}
async function init() {
    const params = new URLSearchParams(window.location.search);
    if (/^\d+$/.test(params.get("seed") ?? ""))
        rng = seeded(Number(params.get("seed")));
    const demo = params.get("demo") === "1" || window.PUZZLE_DEMO === true;
    const key = /^\d\d-\d\d$/.test(params.get("d") ?? "") ? params.get("d") : todayKey();
    const back = `/?day=${key}`;
    const [mm, dd] = key.split("-").map(Number);
    const year = new Date().getFullYear();
    const valid = new Date(year, mm - 1, dd).getMonth() === mm - 1;
    const label = new Intl.DateTimeFormat("en", { timeZone: "UTC", ...(valid ? { weekday: "long" } : {}), month: "long", day: "numeric" }).format(new Date(Date.UTC(valid ? year : 2000, mm - 1, dd)));
    const time = $("date-label");
    time.textContent = label;
    time.setAttribute("datetime", `--${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`);
    for (const id of ["back-link", "done-back"])
        $(id).setAttribute("href", demo ? "/" : back);
    let art = null;
    if (demo) {
        art = { day: key, title: "Demo painting", artist: "Art Almanac", image: { url: demoImage() } };
    }
    else {
        try {
            const res = await fetch(`/data/artworks/${key}.json`);
            if (!res.ok)
                throw new Error("data");
            art = (await res.json());
        }
        catch {
            showError("We could not find an artwork for this day. Go back and pick another day.");
            return;
        }
    }
    imageUrl = art.image.url;
    caption = `${art.title}, ${art.artist}${art.date ? `, ${art.date}` : ""}`;
    $("puzzle-title").textContent = art.title;
    $("puzzle-byline").textContent = art.artist;
    document.title = `Puzzle: ${art.title} | Art Almanac`;
    let img;
    try {
        img = await loadImage(imageUrl);
    }
    catch {
        showError("The picture could not be loaded. Check your connection and try again.");
        return;
    }
    naturalW = img.naturalWidth;
    naturalH = img.naturalHeight;
    const saved = store()?.getItem("puzzlePieces");
    if (saved && [...countSelect.options].some((o) => o.value === saved))
        countSelect.value = saved;
    build();
    countSelect.addEventListener("change", () => { try {
        store()?.setItem("puzzlePieces", countSelect.value);
    }
    catch { /* ignore */ } build(); });
    guideBox.addEventListener("change", () => layoutBoard());
    $("shuffle").addEventListener("click", build);
    $("again").addEventListener("click", build);
    let timer = 0;
    window.addEventListener("resize", () => { window.clearTimeout(timer); timer = window.setTimeout(relayout, 80); });
}
void init();
