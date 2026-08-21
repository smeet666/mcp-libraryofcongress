import { describe, expect, it } from "vitest";
import type { LocError } from "../../src/errors.js";
import { toPaging, toSearchResults } from "../../src/loc/parse.js";
import { capture, fixture, skipCounter } from "./helpers.js";

const URL = "https://www.loc.gov/books/?q=test";

describe("catalogue rows", () => {
  it("reads a row into the shape a caller can cite", () => {
    const skip = skipCounter();
    const { records } = toSearchResults(fixture("catalogue"), URL, skip.onSkip);

    expect(records[0]).toEqual({
      identifier: "glass-orchard-1971",
      isCollection: false,
      title: "The Glass Orchard",
      creator: "reame, vashti, orchard pictures",
      year: 1971,
      date: "1971-06-04",
      dateCode: null,
      format: "book",
      location: ["utah", "united states"],
      subjects: ["orchards", "salt flats"],
      online: true,
      sourceUrl: "https://www.loc.gov/item/glass-orchard-1971/",
    });
  });

  it("reads an identifier out of an address with no scheme", () => {
    const skip = skipCounter();
    const { records } = toSearchResults(fixture("catalogue"), URL, skip.onSkip);

    expect(records[1]?.identifier).toBe("58001234");
    expect(records[1]?.sourceUrl).toBe("https://lccn.loc.gov/58001234");
  });

  it("reports a record with no digitised copy as offline rather than as unknown", () => {
    const skip = skipCounter();
    const { records } = toSearchResults(fixture("catalogue"), URL, skip.onSkip);

    expect(records[1]?.online).toBe(false);
  });

  it("skips a row that can be neither shown nor followed, and counts it", () => {
    const skip = skipCounter();
    const { records } = toSearchResults(fixture("catalogue"), URL, skip.onSkip);

    expect(records).toHaveLength(2);
    expect(skip.total()).toBe(1);
  });

  it("counts results and pages under separate names", () => {
    const paging = toPaging(fixture("catalogue"), URL);

    expect(paging.resultCount).toBe(431);
    expect(paging.pageCount).toBe(Math.ceil(431 / 3));
    expect(paging.perPage).toBe(3);
  });

  it("reports an empty catalogue as an empty catalogue", () => {
    const skip = skipCounter();
    const { paging, records } = toSearchResults(fixture("catalogue-empty"), URL, skip.onSkip);

    expect(records).toEqual([]);
    expect(paging.resultCount).toBe(0);
    expect(skip.total()).toBe(0);
  });

  it("refuses to read a zero the site would not have its answer kept for", () => {
    const skip = skipCounter();
    const outcome = capture(() =>
      toSearchResults(fixture("catalogue-empty"), URL, skip.onSkip, false),
    );

    expect(outcome.threw).toBe(true);
    expect((outcome.error as LocError).code).toBe("rate_limited");
  });

  it("reads a count the site published beside rows whether or not it keeps the answer", () => {
    const skip = skipCounter();
    const { paging, records } = toSearchResults(fixture("catalogue"), URL, skip.onSkip, false);

    expect(paging.resultCount).toBe(431);
    expect(records).toHaveLength(2);
  });

  it("keeps the count when a page past the last one returns no rows", () => {
    const skip = skipCounter();
    const { paging, records } = toSearchResults(fixture("catalogue-past-end"), URL, skip.onSkip);

    expect(records).toEqual([]);
    expect(paging.resultCount).toBe(431);
  });

  it("fails to parse rather than reporting nothing when no row could be read", () => {
    const skip = skipCounter();
    const outcome = capture(() =>
      toSearchResults(fixture("catalogue-unreadable"), URL, skip.onSkip),
    );

    expect(outcome.threw).toBe(true);
    expect((outcome.error as LocError).code).toBe("parse_failure");
  });

  it("fails to parse when nothing states how many results match", () => {
    const skip = skipCounter();
    const outcome = capture(() =>
      toSearchResults(fixture("catalogue-no-pagination"), URL, skip.onSkip),
    );

    expect(outcome.threw).toBe(true);
    expect((outcome.error as LocError).code).toBe("parse_failure");
  });

  it("refuses to read a missing count as zero", () => {
    const outcome = capture(() => toPaging(fixture("catalogue-no-count"), URL));

    expect(outcome.threw).toBe(true);
    expect((outcome.error as LocError).code).toBe("parse_failure");
  });

  it("fails to parse an answer carrying no rows at all", () => {
    const skip = skipCounter();
    const outcome = capture(() => toSearchResults({ pagination: { of: 3 } }, URL, skip.onSkip));

    expect(outcome.threw).toBe(true);
    expect((outcome.error as LocError).code).toBe("parse_failure");
  });
});
