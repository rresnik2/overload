import { describe, expect, it } from "vitest";
import {
  addDays,
  ageInYears,
  dateToLocalDate,
  diffDays,
  eachDay,
  eachWeekStart,
  isoWeek,
  isoWeekday,
  isoWeekEnd,
  isoWeekKey,
  isoWeekStart,
  isValidLocalDate,
  isValidTimeZone,
  localDateToDate,
  toLocalDate,
  tzOffsetMinutes,
  zonedTimeToUtc,
} from "./dates";

describe("dates", () => {
  it("validates local dates", () => {
    expect(isValidLocalDate("2026-10-14")).toBe(true);
    expect(isValidLocalDate("2026-02-30")).toBe(false);
    expect(isValidLocalDate("2026-1-1")).toBe(false);
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });

  it("derives the local date from an instant and a time zone", () => {
    const instant = "2026-10-14T02:30:00.000Z";
    expect(toLocalDate(instant, "UTC")).toBe("2026-10-14");
    expect(toLocalDate(instant, "America/Los_Angeles")).toBe("2026-10-13");
    expect(toLocalDate(instant, "Pacific/Auckland")).toBe("2026-10-14");
  });

  it("round-trips @db.Date values", () => {
    expect(dateToLocalDate(localDateToDate("2026-10-14"))).toBe("2026-10-14");
    expect(localDateToDate("2026-10-14").toISOString()).toBe("2026-10-14T00:00:00.000Z");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-10-01", "2026-10-14")).toBe(13);
  });

  it("weeks run Monday to Sunday (ISO)", () => {
    // 2026-10-14 is a Wednesday
    expect(isoWeekday("2026-10-14")).toBe(3);
    expect(isoWeekStart("2026-10-14")).toBe("2026-10-12");
    expect(isoWeekEnd("2026-10-14")).toBe("2026-10-18");
    expect(isoWeekStart("2026-10-18")).toBe("2026-10-12"); // Sunday belongs to the week that started Monday
    expect(isoWeekStart("2026-10-19")).toBe("2026-10-19");
  });

  it("computes ISO week numbers including year edges", () => {
    expect(isoWeek("2026-10-14")).toEqual({ year: 2026, week: 42 });
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
    expect(isoWeekKey("2024-12-30")).toBe("2025-W01"); // Mon Dec 30 2024 is week 1 of 2025
    expect(isoWeekKey("2021-01-03")).toBe("2020-W53");
  });

  it("enumerates days and week starts", () => {
    expect(eachDay("2026-10-12", "2026-10-14")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(eachWeekStart("2026-10-14", "2026-11-02")).toEqual(["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]);
  });

  it("computes zone offsets and local-time instants across DST", () => {
    expect(tzOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "America/New_York")).toBe(-300);
    expect(tzOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "America/New_York")).toBe(-240);
    // Monday 05:00 in New York in summer (EDT, UTC-4) is 09:00Z; in winter (EST) 10:00Z.
    expect(zonedTimeToUtc("2026-07-13", 5, 0, "America/New_York").toISOString()).toBe("2026-07-13T09:00:00.000Z");
    expect(zonedTimeToUtc("2026-01-12", 5, 0, "America/New_York").toISOString()).toBe("2026-01-12T10:00:00.000Z");
    expect(zonedTimeToUtc("2026-10-12", 5, 0, "Australia/Sydney").toISOString()).toBe("2026-10-11T18:00:00.000Z");
  });

  it("computes age in whole years", () => {
    expect(ageInYears("1990-10-14", "2026-10-14")).toBe(36);
    expect(ageInYears("1990-10-15", "2026-10-14")).toBe(35);
  });
});
