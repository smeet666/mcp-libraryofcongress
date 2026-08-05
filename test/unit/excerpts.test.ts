import { describe, expect, it } from "vitest";
import { excerptsFor, queryTerms } from "../../src/loc/parse.js";

describe("query terms", () => {
  it("keeps a quoted phrase whole", () => {
    expect(queryTerms('"the lamps went out"')).toEqual(["the lamps went out"]);
  });

  it("reads unquoted words separately", () => {
    expect(queryTerms("influenza quarantine")).toEqual(["influenza", "quarantine"]);
  });

  it("sets aside words that occur on every line", () => {
    expect(queryTerms("the war and the peace")).toEqual(["war", "peace"]);
  });

  it("takes a phrase and the words outside it together", () => {
    expect(queryTerms('"salt flats" orchard')).toEqual(["salt flats", "orchard"]);
  });

  it("names each term once", () => {
    expect(queryTerms("orchard orchard ORCHARD")).toEqual(["orchard"]);
  });
});

describe("excerpts", () => {
  const page =
    "one two three four five six seven eight lamps nine ten eleven twelve thirteen fourteen";

  it("centres a passage on the words that were found", () => {
    const { passages, located } = excerptsFor(page, ["lamps"], { maxChars: 40, maxCount: 3 });

    expect(located).toBe(true);
    expect(passages).toHaveLength(1);
    expect(passages[0]).toContain("lamps");
    expect(passages[0]?.startsWith("…")).toBe(true);
    expect(passages[0]?.endsWith("…")).toBe(true);
  });

  it("keeps a passage within the budget it was given", () => {
    const { passages } = excerptsFor(page, ["lamps"], { maxChars: 30, maxCount: 3 });

    // The ellipses mark where the passage was cut and sit outside the budget.
    expect(passages[0]!.replace(/…/g, "").length).toBeLessThanOrEqual(30);
  });

  it("returns the opening of the page and says the words were not found", () => {
    const { passages, located } = excerptsFor(page, ["quarantine"], {
      maxChars: 30,
      maxCount: 3,
    });

    expect(located).toBe(false);
    expect(passages).toHaveLength(1);
    expect(passages[0]?.startsWith("one two")).toBe(true);
  });

  it("joins two matches that would otherwise repeat the same words", () => {
    const text = "alpha lamps beta lamps gamma";
    const { passages } = excerptsFor(text, ["lamps"], { maxChars: 40, maxCount: 5 });

    expect(passages).toHaveLength(1);
  });

  it("keeps at most the number of passages asked for", () => {
    const text = Array.from({ length: 10 }, (_, i) => `${"filler ".repeat(20)}lamps ${i}`).join(
      " ",
    );
    const { passages } = excerptsFor(text, ["lamps"], { maxChars: 40, maxCount: 2 });

    expect(passages).toHaveLength(2);
  });

  it("reports no passage at all for a page carrying no text", () => {
    const { passages, located } = excerptsFor("   ", ["lamps"], { maxChars: 40, maxCount: 3 });

    expect(passages).toEqual([]);
    expect(located).toBe(false);
  });

  it("finds a phrase spelled in another case", () => {
    const { located, passages } = excerptsFor(
      "THE LAMPS WENT OUT at dusk",
      ["the lamps went out"],
      {
        maxChars: 60,
        maxCount: 2,
      },
    );

    expect(located).toBe(true);
    expect(passages[0]).toContain("LAMPS");
  });

  it("does not mark a passage as cut when it holds the whole page", () => {
    const { passages } = excerptsFor("lamps", ["lamps"], { maxChars: 200, maxCount: 2 });

    expect(passages).toEqual(["lamps"]);
  });
});
