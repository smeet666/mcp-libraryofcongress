import { describe, expect, it } from "vitest";
import { LocError } from "../../src/errors.js";
import { toNewspaperResults } from "../../src/loc/parse.js";
import { capture, fixture, skipCounter } from "./helpers.js";

const URL = "https://www.loc.gov/collections/chronicling-america/?q=test";
const BUDGET = { maxChars: 120, maxCount: 3 };

function parse(name: string, query = '"the lamps went out"') {
  const skip = skipCounter();
  const data = toNewspaperResults(fixture(name), URL, query, BUDGET, skip.onSkip);
  return { data, skipped: skip.total() };
}

describe("newspaper pages", () => {
  it("names the paper, the date, the leaf and the state", () => {
    const { data } = parse("newspapers");
    const hit = data.hits[0]!;

    expect(hit.publication).toBe("salt county herald (salt city, utah) 1881-1922");
    expect(hit.publishedOn).toBe("1893-11-04");
    expect(hit.pageNumber).toBe(4);
    expect(hit.state).toBe("utah");
    expect(hit.year).toBe(1893);
  });

  it("reads a zero-padded leaf as the number it is", () => {
    const { data } = parse("newspapers");

    expect(data.hits[1]?.pageNumber).toBe(1);
  });

  it("carries an address that opens the leaf with the query applied", () => {
    const { data } = parse("newspapers");

    expect(data.hits[0]?.sourceUrl).toContain("sp=4");
    expect(data.hits[0]?.sourceUrl).toContain("q=");
  });

  it("names the identifier the item route takes", () => {
    const { data } = parse("newspapers");

    expect(data.hits[0]?.identifier).toBe("sn00000001/1893-11-04/ed-1");
  });

  it("centres the passage on the words when the page text carries them", () => {
    const { data } = parse("newspapers");
    const hit = data.hits[0]!;

    expect(hit.wordsLocated).toBe(true);
    expect(hit.excerpts.join(" ")).toContain("the lamps went out");
  });

  it("says so when the words are not in the text the row carries", () => {
    const { data } = parse("newspapers");
    const hit = data.hits[1]!;

    expect(hit.wordsLocated).toBe(false);
    expect(hit.excerpts[0]).toContain("ORCHARD DAILY REVIEW");
  });

  it("skips a page with no address, and counts it", () => {
    const { data, skipped } = parse("newspapers");

    expect(data.hits).toHaveLength(2);
    expect(skipped).toBe(1);
  });

  it("counts matching pages, not the rows returned", () => {
    const { data } = parse("newspapers");

    expect(data.paging.resultCount).toBe(4177);
    expect(data.hits).toHaveLength(2);
  });

  it("reports an empty corpus answer as empty", () => {
    const { data } = parse("newspapers-empty");

    expect(data.hits).toEqual([]);
    expect(data.paging.resultCount).toBe(0);
  });

  it("refuses to read a zero the site would not have its answer kept for", () => {
    const skip = skipCounter();
    const outcome = capture(() =>
      toNewspaperResults(fixture("newspapers-empty"), URL, "lamps", BUDGET, skip.onSkip, false),
    );

    expect(outcome.threw).toBe(true);
    expect((outcome.error as LocError).code).toBe("rate_limited");
  });

  it("fails to parse rather than reporting nothing when no row could be read", () => {
    const skip = skipCounter();
    const outcome = capture(() =>
      toNewspaperResults(
        { pagination: { of: 5 }, results: [{ title: "no address" }] },
        URL,
        "lamps",
        BUDGET,
        skip.onSkip,
      ),
    );

    expect(outcome.threw).toBe(true);
    expect((outcome.error as LocError).code).toBe("parse_failure");
  });
});
