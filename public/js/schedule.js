/**
 * Deterministic calendar-day scheduling.
 *
 * Every artwork is assigned to a "day key" of the form "MM-DD". The same key
 * maps to the same artwork in every year, for every visitor. February 29 has
 * its own dedicated leap-day artwork (key "02-29"). In years that are not
 * leap years, "02-29" is skipped during day-to-day navigation but can still be
 * opened directly from the archive or a shared link.
 */
const pad = (n) => String(n).padStart(2, "0");
export function isValidTimeZone(tz) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
    }
    catch {
        return false;
    }
}
/** The calendar date right now in the given IANA time zone. */
export function todayInZone(tz, now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);
    const read = (type) => {
        const part = parts.find((p) => p.type === type);
        if (!part)
            throw new Error(`Missing ${type} in formatted date`);
        return Number(part.value);
    };
    return { year: read("year"), month: read("month"), day: read("day") };
}
export function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
export function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
export function dayKey(month, day) {
    return `${pad(month)}-${pad(day)}`;
}
export function keyFromParts(p) {
    return dayKey(p.month, p.day);
}
/** Parses "MM-DD". Returns null unless it is a real calendar day (02-29 counts). */
export function parseDayKey(key) {
    const match = /^(\d{2})-(\d{2})$/.exec(key);
    if (!match)
        return null;
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12)
        return null;
    // 2000 is a leap year, so it accepts every valid MM-DD including 02-29.
    if (day < 1 || day > daysInMonth(2000, month))
        return null;
    return { month, day };
}
/** All 366 valid day keys in calendar order (365 regular days plus 02-29). */
export function allDayKeys() {
    const keys = [];
    for (let month = 1; month <= 12; month++) {
        const last = daysInMonth(2000, month);
        for (let day = 1; day <= last; day++)
            keys.push(dayKey(month, day));
    }
    return keys;
}
/**
 * The ordered list of day keys used for previous/next navigation in a given
 * year. Leap day is only part of the sequence in leap years.
 */
export function navigationKeys(year) {
    const keys = allDayKeys();
    return isLeapYear(year) ? keys : keys.filter((k) => k !== "02-29");
}
/** Step forward or back through the calendar, wrapping from Dec 31 to Jan 1. */
export function stepKey(currentKey, delta, year) {
    const keys = navigationKeys(year);
    let index = keys.indexOf(currentKey);
    if (index === -1) {
        // Current key is not in this year's sequence (02-29 in a common year).
        // Treat it as sitting between 02-28 and 03-01.
        index = delta >= 0 ? keys.indexOf("02-28") : keys.indexOf("03-01");
        if (delta > 0)
            return keys[(index + delta) % keys.length];
        if (delta < 0)
            return keys[(index + delta + keys.length) % keys.length];
        return currentKey;
    }
    return keys[(index + delta + keys.length * 8) % keys.length];
}
export function addDays(p, n) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
    d.setUTCDate(d.getUTCDate() + n);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}
/**
 * Human-readable date for a day key. The weekday is shown only when the key
 * exists in the reference year's calendar.
 */
export function formatDayKey(key, referenceYear, locale = "en") {
    const parsed = parseDayKey(key);
    if (!parsed)
        return key;
    const valid = parsed.day <= daysInMonth(referenceYear, parsed.month);
    // Use a leap year for display when the date does not exist in the reference year.
    const year = valid ? referenceYear : 2000;
    const date = new Date(Date.UTC(year, parsed.month - 1, parsed.day));
    return new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        ...(valid ? { weekday: "long" } : {}),
        month: "long",
        day: "numeric",
    }).format(date);
}
export function shortDayLabel(key, locale = "en") {
    const parsed = parseDayKey(key);
    if (!parsed)
        return key;
    const date = new Date(Date.UTC(2000, parsed.month - 1, parsed.day));
    return new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short", day: "numeric" }).format(date);
}
