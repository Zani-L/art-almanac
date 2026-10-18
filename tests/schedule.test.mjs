import test from "node:test";
import assert from "node:assert/strict";
import {
  allDayKeys, navigationKeys, stepKey, parseDayKey, todayInZone, isLeapYear,
  keyFromParts, formatDayKey, addDays, isValidTimeZone,
} from "../public/js/schedule.js";

test("there are 366 valid day keys including 02-29, all unique", () => {
  const keys = allDayKeys();
  assert.equal(keys.length, 366);
  assert.equal(new Set(keys).size, 366);
  assert.ok(keys.includes("02-29"));
  assert.equal(keys[0], "01-01");
  assert.equal(keys.at(-1), "12-31");
});

test("common years have 365 navigation days and skip 02-29", () => {
  assert.equal(navigationKeys(2027).length, 365);
  assert.ok(!navigationKeys(2027).includes("02-29"));
  assert.equal(navigationKeys(2028).length, 366);
});

test("leap year rules", () => {
  assert.equal(isLeapYear(2028), true);
  assert.equal(isLeapYear(2100), false);
  assert.equal(isLeapYear(2000), true);
  assert.equal(isLeapYear(2026), false);
});

test("parseDayKey accepts real days and rejects invalid ones", () => {
  assert.deepEqual(parseDayKey("02-29"), { month: 2, day: 29 });
  assert.equal(parseDayKey("02-30"), null);
  assert.equal(parseDayKey("13-01"), null);
  assert.equal(parseDayKey("4-1"), null);
  assert.equal(parseDayKey("00-10"), null);
  assert.equal(parseDayKey("junk"), null);
});

test("stepping wraps at year boundaries", () => {
  assert.equal(stepKey("12-31", 1, 2026), "01-01");
  assert.equal(stepKey("01-01", -1, 2026), "12-31");
});

test("stepping across February in a common year skips the leap day", () => {
  assert.equal(stepKey("02-28", 1, 2027), "03-01");
  assert.equal(stepKey("03-01", -1, 2027), "02-28");
});

test("stepping across February in a leap year includes the leap day", () => {
  assert.equal(stepKey("02-28", 1, 2028), "02-29");
  assert.equal(stepKey("02-29", 1, 2028), "03-01");
  assert.equal(stepKey("03-01", -1, 2028), "02-29");
});

test("opening 02-29 in a common year still navigates sensibly", () => {
  assert.equal(stepKey("02-29", 1, 2027), "03-01");
  assert.equal(stepKey("02-29", -1, 2027), "02-28");
});

test("same instant maps to different dates in different time zones", () => {
  const instant = new Date("2026-10-16T20:30:00Z");
  assert.equal(keyFromParts(todayInZone("UTC", instant)), "10-16");
  assert.equal(keyFromParts(todayInZone("Asia/Shanghai", instant)), "10-17");
  assert.equal(keyFromParts(todayInZone("America/Los_Angeles", instant)), "10-16");
});

test("the date flips exactly at local midnight", () => {
  // Midnight in Shanghai (UTC+8) is 16:00 UTC the day before.
  const before = new Date("2026-12-31T15:59:59Z");
  const after = new Date("2026-12-31T16:00:00Z");
  assert.equal(keyFromParts(todayInZone("Asia/Shanghai", before)), "12-31");
  assert.equal(keyFromParts(todayInZone("Asia/Shanghai", after)), "01-01");
  assert.equal(todayInZone("Asia/Shanghai", after).year, 2027);
});

test("leap day is reached on 2028-02-29 in any zone", () => {
  const instant = new Date("2028-02-29T12:00:00Z");
  assert.equal(keyFromParts(todayInZone("UTC", instant)), "02-29");
});

test("the same instant always gives the same key (deterministic)", () => {
  const instant = new Date("2026-06-01T05:00:00Z");
  const first = keyFromParts(todayInZone("Europe/London", instant));
  for (let i = 0; i < 50; i++) assert.equal(keyFromParts(todayInZone("Europe/London", instant)), first);
});

test("addDays crosses month and year boundaries", () => {
  assert.deepEqual(addDays({ year: 2026, month: 12, day: 31 }, 1), { year: 2027, month: 1, day: 1 });
  assert.deepEqual(addDays({ year: 2028, month: 2, day: 28 }, 1), { year: 2028, month: 2, day: 29 });
  assert.deepEqual(addDays({ year: 2027, month: 2, day: 28 }, 1), { year: 2027, month: 3, day: 1 });
});

test("formatDayKey omits weekday for a leap day in a common year", () => {
  assert.match(formatDayKey("02-29", 2027), /^February 29$/);
  assert.match(formatDayKey("10-16", 2026), /^Friday, October 16$/);
});

test("time zone validation", () => {
  assert.equal(isValidTimeZone("Asia/Shanghai"), true);
  assert.equal(isValidTimeZone("Not/AZone"), false);
});
