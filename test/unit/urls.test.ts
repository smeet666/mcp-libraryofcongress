import { describe, expect, it } from "vitest";
import {
  catalogueUrl,
  collectionsUrl,
  facetString,
  identifierFrom,
  itemDocumentUrl,
  newspaperPagesUrl,
} from "../../src/loc/urls.js";

const base = {
  query: "detective",
  format: "books" as const,
  onlineOnly: true,
  limit: 10,
  page: 1,
};

describe("addresses", () => {
  it("asks each catalogue at its own route", () => {
    expect(catalogueUrl(base)).toContain("https://www.loc.gov/books/?");
    expect(catalogueUrl({ ...base, format: "photos" })).toContain("https://www.loc.gov/photos/?");
  });

  it("never builds an address the site disallows", () => {
    const built = [
      catalogueUrl(base),
      newspaperPagesUrl("lamps", 5, 1),
      newspaperPagesUrl("lamps", 5, 1, {
        facets: { state: "new york", publication: "the sun (new york [n.y.]) 1833-1916" },
        yearFrom: 1900,
        yearTo: 1910,
      }),
      collectionsUrl(10, 1),
      itemDocumentUrl("2017645459"),
    ];

    for (const url of built) expect(new URL(url).pathname.startsWith("/search")).toBe(false);
  });

  it("asks for the two blocks it reads and no more", () => {
    const url = new URL(catalogueUrl(base));

    expect(url.searchParams.get("at")).toBe("results,pagination");
    expect(url.searchParams.get("fo")).toBe("json");
  });

  it("writes a year range as the site writes it", () => {
    const url = new URL(catalogueUrl({ ...base, yearFrom: 1920, yearTo: 1929 }));

    expect(url.searchParams.get("dates")).toBe("1920/1929");
  });

  it("writes an open end as the far bound rather than leaving it out", () => {
    expect(new URL(catalogueUrl({ ...base, yearFrom: 1920 })).searchParams.get("dates")).toBe(
      "1920/9999",
    );
    expect(new URL(catalogueUrl({ ...base, yearTo: 1929 })).searchParams.get("dates")).toBe(
      "1000/1929",
    );
  });

  it("sends no date range when neither end was asked for", () => {
    expect(new URL(catalogueUrl(base)).searchParams.has("dates")).toBe(false);
  });

  it("narrows a newspaper search to a state, a paper and a span of years", () => {
    const url = new URL(
      newspaperPagesUrl("lamps", 5, 1, {
        facets: {
          state: "New York",
          publication: "New-York Tribune (New York [N.Y.]) 1866-1924",
        },
        yearFrom: 1900,
        yearTo: 1910,
      }),
    );

    expect(url.searchParams.get("fa")).toBe(
      "location_state:new york|partof_title:new-york tribune (new york [n.y.]) 1866-1924",
    );
    expect(url.searchParams.get("dates")).toBe("1900/1910");
  });

  it("writes an open end of a newspaper span as the far bound", () => {
    expect(
      new URL(newspaperPagesUrl("lamps", 5, 1, { yearFrom: 1900 })).searchParams.get("dates"),
    ).toBe("1900/9999");
    expect(
      new URL(newspaperPagesUrl("lamps", 5, 1, { yearTo: 1910 })).searchParams.get("dates"),
    ).toBe("1000/1910");
  });

  it("sends no narrowing on a newspaper search that asked for none", () => {
    const url = new URL(newspaperPagesUrl("lamps", 5, 1));

    expect(url.searchParams.has("fa")).toBe(false);
    expect(url.searchParams.has("dates")).toBe(false);
  });

  it("joins facets the way the site reads them", () => {
    expect(facetString({ subject: "Crime", language: "English" })).toBe(
      "subject:crime|language:english",
    );
  });

  it("leaves out a facet whose value is blank", () => {
    expect(facetString({ subject: "  ", language: "english" })).toBe("language:english");
  });

  it("sends no sort parameter for the site's own default order", () => {
    expect(new URL(catalogueUrl({ ...base, sort: "relevance" })).searchParams.has("sb")).toBe(
      false,
    );
    expect(new URL(catalogueUrl({ ...base, sort: "newest" })).searchParams.get("sb")).toBe(
      "date_desc",
    );
  });

  it("widens past digitised material only when asked to", () => {
    expect(new URL(catalogueUrl(base)).searchParams.has("all")).toBe(false);
    expect(new URL(catalogueUrl({ ...base, onlineOnly: false })).searchParams.get("all")).toBe(
      "true",
    );
  });

  it("keeps the separators of an identifier that names several things", () => {
    expect(itemDocumentUrl("sn83045462/1929-02-03/ed-1")).toBe(
      "https://www.loc.gov/item/sn83045462/1929-02-03/ed-1/?fo=json",
    );
  });

  it("encodes each segment so a value cannot open a path of its own", () => {
    expect(itemDocumentUrl("a b/c?d=e")).toBe("https://www.loc.gov/item/a%20b/c%3Fd%3De/?fo=json");
  });

  it("refuses an identifier that climbs out of the item route", () => {
    expect(() => itemDocumentUrl("../../search")).toThrow(/relative path segment/i);
  });

  it("refuses an identifier carrying a control character, and names none back", () => {
    const control = String.fromCharCode(1);
    let message = "";
    try {
      itemDocumentUrl(`2017${control}645459`);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/control character/i);
    expect(message).not.toContain("2017");
    expect(message).not.toContain(control);
  });

  it("reads an identifier written with stray separators", () => {
    expect(itemDocumentUrl("/2017645459/")).toBe("https://www.loc.gov/item/2017645459/?fo=json");
  });
});

describe("identifiers", () => {
  it("reads one out of an item address", () => {
    expect(identifierFrom("https://www.loc.gov/item/2017645459/")).toBe("2017645459");
  });

  it("reads one out of a newspaper page address", () => {
    expect(identifierFrom("https://www.loc.gov/resource/sn83045462/1929-02-03/ed-1/?sp=82")).toBe(
      "sn83045462/1929-02-03/ed-1",
    );
  });

  it("reads one out of a catalogue address with no scheme", () => {
    expect(identifierFrom("//lccn.loc.gov/2003619106")).toBe("2003619106");
  });

  it("names nothing for a collection address, which the item route cannot read", () => {
    expect(
      identifierFrom("https://www.loc.gov/collections/liturgical-chants/about-this-collection/"),
    ).toBeNull();
    expect(identifierFrom("https://www.loc.gov/collections/liturgical-chants/")).toBeNull();
  });

  it("returns nothing rather than a guess for an address it does not know", () => {
    expect(identifierFrom("https://example.invalid/whatever/")).toBeNull();
    expect(identifierFrom("not an address")).toBeNull();
    expect(identifierFrom(null)).toBeNull();
    expect(identifierFrom("   ")).toBeNull();
  });
});
