import { describe, expect, it } from "vitest";
import { extractDates } from "@/lib/vedic/extractDates";

describe("extractDates", () => {
  it("reads iso, us slash and long-month dates and sorts them", () => {
    const text = "jupiter enters your 11th on 2031-04-12. expect the raise around June 3, 2033, and a move by 12 Nov 2029 (filed 07/01/2030).";
    expect(extractDates(text)).toEqual(["2029-11-12", "2030-07-01", "2031-04-12", "2033-06-03"]);
  });

  it("anchors a month with no day to the 15th and does not double count", () => {
    expect(extractDates("saturn stations in March 2030, then the window closes March 28, 2030.")).toEqual(["2030-03-15", "2030-03-28"]);
  });

  it("drops impossible calendar dates and absurd years", () => {
    expect(extractDates("2030-02-31 is not a day, nor is 13/40/2031, nor 0999-01-01")).toEqual([]);
  });

  it("returns nothing for empty or dateless text", () => {
    expect(extractDates("")).toEqual([]);
    expect(extractDates("the moon in rohini favours trade")).toEqual([]);
  });
});
