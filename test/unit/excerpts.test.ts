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

/**
 * A term sitting inside a longer word is not the term. `located` governs the
 * label an answer puts on an excerpt, so a hit on a fragment presents a page
 * about something else as the passage that matched.
 */
describe("excerpts · a word rather than a run of letters", () => {
  const budget = { maxChars: 120, maxCount: 3 };

  const swallowed: [string, string][] = [
    ["art", "men are just as particular as women about wrinkles"],
    ["art", "It does so impartially wasting no words"],
    ["art", "look over their old harness and see if new parts are needed"],
    ["art", "Tho Wlnooakt Valloy ARtloulttuat Soclo ty liohl lts fair"],
    ["cat", "the treatment of Horses Cattle and Domestic Pets"],
    ["memorial", "Announcement was made of a PreMemorial dance"],
  ];

  for (const [term, page] of swallowed) {
    it(`does not locate "${term}" inside a longer word: ${page.slice(0, 40)}…`, () => {
      const { located, passages } = excerptsFor(page, [term], budget);

      expect(located).toBe(false);
      expect(passages[0]?.startsWith(page.slice(0, 10))).toBe(true);
    });
  }

  const carried: [string, string][] = [
    ["art", "the new Person Hall Art Gallery opened on Friday"],
    ["art", "KEY WEST ART CENTERSponsored by the city"],
    ["art", "the fair, art, and the show"],
    ["gallery", "(gallery) draws attention as one of the attractions"],
    ["memorial", "NEW YORKS GREAT WAR MEMORIAL TO BE NATIONS PRIDE"],
  ];

  for (const [term, page] of carried) {
    it(`locates "${term}" standing as a word: ${page.slice(0, 40)}…`, () => {
      const { located } = excerptsFor(page, [term], budget);

      expect(located).toBe(true);
    });
  }

  it("centres nothing on a fragment when another word of the query is a real match", () => {
    const page = "men are just as particular as women. The Art Gallery opened at noon.";
    const { located, passages } = excerptsFor(page, ["art", "gallery"], {
      maxChars: 30,
      maxCount: 5,
    });

    expect(located).toBe(true);
    expect(passages).toHaveLength(1);
    expect(passages[0]).toContain("Art Gallery");
    expect(passages.join(" ")).not.toContain("particular as women. The");
  });
});
