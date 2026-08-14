import { describe, expect, it } from "vitest";
import { LocError } from "../../src/errors.js";
import { toCollections, toItemDetail } from "../../src/loc/parse.js";
import { capture, fixture, skipCounter } from "./helpers.js";

const URL = "https://www.loc.gov/item/glass-orchard-1971/?fo=json";

describe("one record", () => {
  it("reads the fields a description needs", () => {
    const item = toItemDetail(fixture("item"), "glass-orchard-1971", URL);

    expect(item.title).toBe("The Glass Orchard & other records");
    expect(item.creator).toBe("Reame, Vashti, 1912-1988, author");
    expect(item.year).toBe(1971);
    expect(item.date).toBe("1971-06-04");
    expect(item.format).toBe("book");
    expect(item.callNumber).toBe("ML 1234");
    expect(item.rights).toBe("No known restrictions on publication.");
  });

  it("reads a name the route wrote as a link rather than dropping it", () => {
    const item = toItemDetail(fixture("item"), "glass-orchard-1971", URL);

    expect(item.subjects).toEqual(["orchards", "salt flats", "field recordings"]);
    expect(item.partOf).toEqual(["salt country archive", "music division"]);
  });

  it("joins the paragraphs of a description", () => {
    const item = toItemDetail(fixture("item"), "glass-orchard-1971", URL);

    expect(item.description).toContain("salt country");
    expect(item.description).toContain("Second paragraph");
  });

  it("strips the markup a citation is published with", () => {
    const item = toItemDetail(fixture("item"), "glass-orchard-1971", URL);

    expect(item.citations.apa).toContain("The Glass Orchard & other records");
    expect(item.citations.apa).not.toContain("<cite>");
  });

  it("counts the files behind a served copy", () => {
    const item = toItemDetail(fixture("item"), "glass-orchard-1971", URL);

    expect(item.resources[0]?.fileCount).toBe(1);
    expect(item.resources[0]?.caption).toBe("digital file from original");
  });

  it("reports absent terms of use as absent rather than as permission", () => {
    const item = toItemDetail(fixture("item-no-rights"), "salt-flats-letters", URL);

    expect(item.rights).toBeNull();
  });

  it("reports an empty description as nothing rather than as an empty string", () => {
    const item = toItemDetail(fixture("item-no-rights"), "salt-flats-letters", URL);

    expect(item.description).toBeNull();
  });

  it("reads a missing record stated in the body as an absence", () => {
    const outcome = capture(() => toItemDetail(fixture("item-missing"), "nothing-here", URL));

    expect(outcome.threw).toBe(true);
    expect((outcome.error as LocError).code).toBe("not_found");
  });

  it("reads an answer without the item block as a failure to parse", () => {
    const outcome = capture(() =>
      toItemDetail(fixture("item-no-block"), "glass-orchard-1971", URL),
    );

    expect(outcome.threw).toBe(true);
    expect((outcome.error as LocError).code).toBe("parse_failure");
  });

  it("reads an empty item block as an absence", () => {
    const outcome = capture(() => toItemDetail({ item: {} }, "nothing-here", URL));

    expect(outcome.threw).toBe(true);
    expect((outcome.error as LocError).code).toBe("not_found");
  });
});

describe("collections", () => {
  it("names a collection by its slug and counts what it gathers", () => {
    const skip = skipCounter();
    const { collections } = toCollections(fixture("collections"), URL, skip.onSkip);

    expect(collections[0]?.identifier).toBe("salt-country-field-recordings");
    expect(collections[0]?.itemCount).toBe(57);
    expect(collections[0]?.formats).toEqual(["audio", "manuscripts"]);
  });

  it("reports an uncounted collection as uncounted rather than as empty", () => {
    const skip = skipCounter();
    const { collections } = toCollections(fixture("collections"), URL, skip.onSkip);

    expect(collections[1]?.itemCount).toBeNull();
  });

  it("skips a row that names no collection, and counts it", () => {
    const skip = skipCounter();
    const { collections, paging } = toCollections(fixture("collections"), URL, skip.onSkip);

    expect(collections).toHaveLength(2);
    expect(skip.total()).toBe(1);
    expect(paging.resultCount).toBe(583);
  });

  it("reports a corpus the site says holds nothing as holding nothing", () => {
    const skip = skipCounter();
    const { collections, paging } = toCollections(
      fixture("collections-empty"),
      URL,
      skip.onSkip,
      true,
    );

    expect(collections).toEqual([]);
    expect(paging.resultCount).toBe(0);
  });

  it("refuses to read a zero the site would not have its answer kept for", () => {
    const skip = skipCounter();
    const outcome = capture(() =>
      toCollections(fixture("collections-empty"), URL, skip.onSkip, false),
    );

    expect(outcome.threw).toBe(true);
    expect((outcome.error as LocError).code).toBe("rate_limited");
  });
});
