import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocClient } from "../../src/loc/client.js";
import { runGetItem } from "../../src/tools/getItem.js";
import { runListCollections } from "../../src/tools/listCollections.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import { runSearchNewspapers } from "../../src/tools/searchNewspapers.js";
import type { ToolResult } from "../../src/tools/shared.js";
import { fixture, jsonResponse, scriptedFetch, settle, silentLogger } from "./helpers.js";

const EPOCH = Date.UTC(2024, 0, 1, 0, 0, 0);
/** Wider than any wait a call in this file can take. */
const AMPLE_MS = 600_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

function clientFor(steps: Array<() => Response>) {
  const { fetchImpl, count } = scriptedFetch(steps);
  return { client: new LocClient({ logger: silentLogger, fetchImpl }), count };
}

/**
 * The site's answer while its search is failing: a rendered page holding no
 * rows, which it refuses to have kept. A settled answer carries a lifetime.
 */
const unkeepable = (body: unknown) =>
  jsonResponse(body, { headers: { "cache-control": "no-transform, no-cache, max-age=0" } });

const structured = (result: ToolResult) => result.structuredContent as Record<string, unknown>;
const text = (result: ToolResult) => result.content[0]!.text;
const notesOf = (result: ToolResult) => structured(result).notes as string[];

const newspaperArgs = {
  query: '"the lamps went out"',
  limit: 10,
  page: 1,
  max_excerpt_chars: 300,
  max_excerpts_per_match: 3,
};

const itemArgs = {
  query: "detective",
  media_type: "books",
  online_only: true,
  sort: "relevance" as const,
  limit: 10,
  page: 1,
};

describe("search_newspapers", () => {
  it("returns the envelope a caller reads", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("newspapers"))]);
    const result = await settle(runSearchNewspapers(client, newspaperArgs), AMPLE_MS);

    expect(Object.keys(structured(result)).sort()).toEqual([
      "hits",
      "notes",
      "page",
      "query",
      "total",
    ]);
  });

  it("counts matching pages rather than the rows it shows", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("newspapers"))]);
    const result = await settle(runSearchNewspapers(client, newspaperArgs), AMPLE_MS);

    expect(structured(result).total).toBe(4177);
    expect((structured(result).hits as unknown[]).length).toBe(2);
    expect(notesOf(result).join(" ")).toContain("4177 pages match and 2 are shown");
  });

  it("says the excerpts were machine-read", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("newspapers"))]);
    const result = await settle(runSearchNewspapers(client, newspaperArgs), AMPLE_MS);

    expect(notesOf(result).join(" ")).toContain("read off the scanned page");
    expect(text(result)).toContain("read off the scanned page");
  });

  it("says which matches show the opening of a page rather than the passage", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("newspapers"))]);
    const result = await settle(runSearchNewspapers(client, newspaperArgs), AMPLE_MS);

    expect(notesOf(result).join(" ")).toContain("1 of 2 matches");
  });

  it("reports rows it could not read", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("newspapers"))]);
    const result = await settle(runSearchNewspapers(client, newspaperArgs), AMPLE_MS);

    expect(notesOf(result).join(" ")).toContain("1 match came back in a shape");
  });

  it("says nothing was found rather than failing", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("newspapers-empty"))]);
    const result = await settle(runSearchNewspapers(client, newspaperArgs), AMPLE_MS);

    expect(structured(result).total).toBe(0);
    expect(result.isError).toBeUndefined();
    expect(notesOf(result).join(" ")).toContain("matched no digitised newspaper page");
  });

  it("keeps a passage within the budget it was given", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("newspapers"))]);
    const result = await settle(
      runSearchNewspapers(client, { ...newspaperArgs, max_excerpt_chars: 100 }),
      AMPLE_MS,
    );
    const hits = structured(result).hits as Array<{ excerpts: string[] }>;

    for (const hit of hits) {
      for (const excerpt of hit.excerpts) expect(excerpt.length).toBeLessThanOrEqual(102);
    }
  });

  it("reports a failure as a failure rather than as an empty answer", async () => {
    const { client } = clientFor([() => new Response("<html>", { status: 200 })]);
    const result = await settle(runSearchNewspapers(client, newspaperArgs), AMPLE_MS);

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("[parse_failure]");
    expect(result.structuredContent).toBeUndefined();
  });

  it("carries a state, a paper and a span of years into the address it asks for", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return jsonResponse(fixture("newspapers"));
    }) as unknown as typeof fetch;
    const client = new LocClient({ logger: silentLogger, fetchImpl });

    await settle(
      runSearchNewspapers(client, {
        ...newspaperArgs,
        location: "new york",
        publication: "the sun (new york [n.y.]) 1833-1916",
        year_from: 1900,
        year_to: 1910,
      }),
      AMPLE_MS,
    );
    const asked = new URL(calls[0]!);

    expect(asked.searchParams.get("fa")).toBe(
      "location_state:new york|partof_title:the sun (new york [n.y.]) 1833-1916",
    );
    expect(asked.searchParams.get("dates")).toBe("1900/1910");
  });

  it("says a newspaper filter was set aside rather than reporting an empty corpus", async () => {
    const { client } = clientFor([
      () => jsonResponse(fixture("newspapers-empty")),
      () => jsonResponse(fixture("newspapers")),
    ]);
    const result = await settle(
      runSearchNewspapers(client, { ...newspaperArgs, location: "atlantis" }),
      AMPLE_MS,
    );

    expect(structured(result).total).toBe(4177);
    expect(notesOf(result).join(" ")).toContain('location="atlantis"');
    expect(notesOf(result).join(" ")).toContain("set aside");
  });

  it("refuses a span of years that runs backwards", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("newspapers"))]);
    const result = await settle(
      runSearchNewspapers(client, { ...newspaperArgs, year_from: 1920, year_to: 1910 }),
      AMPLE_MS,
    );

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("[invalid_input]");
  });
});

describe("search_items", () => {
  it("returns the envelope a caller reads", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("catalogue"))]);
    const result = await settle(runSearchItems(client, itemArgs), AMPLE_MS);

    expect(Object.keys(structured(result)).sort()).toEqual([
      "items",
      "notes",
      "page",
      "query",
      "total",
    ]);
  });

  it("asks the route the media type names", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return jsonResponse(fixture("catalogue"));
    }) as unknown as typeof fetch;
    const client = new LocClient({ logger: silentLogger, fetchImpl });

    await settle(runSearchItems(client, { ...itemArgs, media_type: "maps" }), AMPLE_MS);

    expect(calls[0]).toContain("/maps/");
  });

  it("sets a filter aside rather than reporting an absence it did not establish", async () => {
    const { client, count } = clientFor([
      () => jsonResponse(fixture("catalogue-empty")),
      () => jsonResponse(fixture("catalogue")),
    ]);
    const result = await settle(
      runSearchItems(client, { ...itemArgs, subject: "no such subject" }),
      AMPLE_MS,
    );

    expect(count()).toBe(2);
    expect(structured(result).total).toBe(431);
    expect(notesOf(result).join(" ")).toContain('subject="no such subject"');
    expect(notesOf(result).join(" ")).toContain("unfiltered");
  });

  it("reports a genuine absence as an absence", async () => {
    const { client, count } = clientFor([
      () => jsonResponse(fixture("catalogue-empty")),
      () => jsonResponse(fixture("catalogue-empty")),
    ]);
    const result = await settle(
      runSearchItems(client, { ...itemArgs, subject: "no such subject" }),
      AMPLE_MS,
    );

    expect(count()).toBe(2);
    expect(structured(result).total).toBe(0);
    expect(notesOf(result).join(" ")).toContain("Nothing in the books catalogue matches");
  });

  it("reports a failing site as a failure rather than as a catalogue matching nothing", async () => {
    const { client } = clientFor([() => unkeepable(fixture("catalogue-empty"))]);
    const result = await settle(runSearchItems(client, itemArgs), AMPLE_MS);

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("[rate_limited]");
  });

  it("asks the site once when nothing was narrowed", async () => {
    const { client, count } = clientFor([() => jsonResponse(fixture("catalogue-empty"))]);
    await settle(runSearchItems(client, itemArgs), AMPLE_MS);

    expect(count()).toBe(1);
  });

  it("refuses a range that runs backwards", async () => {
    const { client, count } = clientFor([() => jsonResponse(fixture("catalogue"))]);
    const result = await settle(
      runSearchItems(client, { ...itemArgs, year_from: 1990, year_to: 1900 }),
      AMPLE_MS,
    );

    expect(result.isError).toBe(true);
    expect(count()).toBe(0);
  });

  it("warns that a record spanning years can carry a date outside the range", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("catalogue"))]);
    const result = await settle(
      runSearchItems(client, { ...itemArgs, year_from: 1920, year_to: 1929 }),
      AMPLE_MS,
    );

    expect(notesOf(result).join(" ")).toContain("matches on any of them");
  });

  it("warns when a wider search takes in records with no copy to read", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("catalogue"))]);
    const result = await settle(
      runSearchItems(client, { ...itemArgs, online_only: false }),
      AMPLE_MS,
    );

    expect(notesOf(result).join(" ")).toContain("no digitised copy");
  });

  it("says a page past the last one is past the last one", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("catalogue-past-end"))]);
    const result = await settle(runSearchItems(client, { ...itemArgs, page: 99 }), AMPLE_MS);

    expect(structured(result).total).toBe(431);
    expect(notesOf(result).join(" ")).toContain("past the last row");
  });
});

describe("get_item", () => {
  it("returns the basic record without the sections that were not asked for", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("item"))]);
    const result = await settle(
      runGetItem(client, {
        identifier: "glass-orchard-1971",
        sections: ["basic"],
        offset: 0,
        max_description_chars: 2000,
      }),
      AMPLE_MS,
    );

    expect(structured(result).citations).toBeUndefined();
    expect(structured(result).resources).toBeUndefined();
    expect(structured(result).full_metadata).toBeUndefined();
  });

  it("returns a section that was asked for", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("item"))]);
    const result = await settle(
      runGetItem(client, {
        identifier: "glass-orchard-1971",
        sections: ["basic", "citations", "resources"],
        offset: 0,
        max_description_chars: 2000,
      }),
      AMPLE_MS,
    );

    expect(Object.keys(structured(result).citations as object)).toContain("apa");
    expect((structured(result).resources as unknown[]).length).toBe(1);
  });

  it("says what may be reused is unstated rather than staying silent", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("item-no-rights"))]);
    const result = await settle(
      runGetItem(client, {
        identifier: "salt-flats-letters",
        sections: ["basic"],
        offset: 0,
        max_description_chars: 2000,
      }),
      AMPLE_MS,
    );

    expect(structured(result).rights).toBeNull();
    expect(notesOf(result).join(" ")).toContain("Silence is not permission");
  });

  it("paginates a long description and resumes where it left off", async () => {
    const { client } = clientFor([
      () => jsonResponse(fixture("item-long-description")),
      () => jsonResponse(fixture("item-long-description")),
    ]);
    const args = {
      identifier: "long-description",
      sections: ["basic" as const],
      offset: 0,
      max_description_chars: 200,
    };

    const first = await settle(runGetItem(client, args), AMPLE_MS);
    const next = structured(first).next_offset as number;
    const second = await settle(runGetItem(client, { ...args, offset: next }), AMPLE_MS);

    expect(next).toBeGreaterThan(0);
    expect(structured(second).description).not.toBe(structured(first).description);
    expect(String(structured(second).description).trim().startsWith("Paragraph")).toBe(true);
  });

  it("says an offset past the end is past the end rather than answering empty", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("item-long-description"))]);
    const result = await settle(
      runGetItem(client, {
        identifier: "long-description",
        sections: ["basic"],
        offset: 99_999,
        max_description_chars: 200,
      }),
      AMPLE_MS,
    );

    expect(structured(result).description).toBeNull();
    expect(notesOf(result).join(" ")).toContain("past the end");
  });

  it("reports a record the Library does not hold as an absence", async () => {
    const { client } = clientFor([() => new Response("{}", { status: 404 })]);
    const result = await settle(
      runGetItem(client, {
        identifier: "nothing-here",
        sections: ["basic"],
        offset: 0,
        max_description_chars: 2000,
      }),
      AMPLE_MS,
    );

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("[not_found]");
  });
});

describe("list_collections", () => {
  it("reports a failing site as a failure rather than as a Library holding nothing", async () => {
    const { client } = clientFor([() => unkeepable(fixture("collections-empty"))]);
    const result = await settle(
      runListCollections(client, {
        limit: 2,
        page: 1,
        searchable_only: false,
        max_description_chars: 300,
      }),
      AMPLE_MS,
    );

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("[rate_limited]");
    expect(text(result)).not.toContain("published no collection");
  });

  it("counts collections rather than the rows it shows", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("collections"))]);
    const result = await settle(
      runListCollections(client, {
        limit: 2,
        page: 1,
        searchable_only: false,
        max_description_chars: 300,
      }),
      AMPLE_MS,
    );

    expect(structured(result).total).toBe(583);
    expect((structured(result).collections as unknown[]).length).toBe(2);
  });

  it("carries the wording the catalogue filter takes", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("collections"))]);
    const result = await settle(
      runListCollections(client, {
        limit: 2,
        page: 1,
        searchable_only: false,
        max_description_chars: 300,
      }),
      AMPLE_MS,
    );
    const rows = structured(result).collections as Array<{ collection_filter: string }>;

    expect(rows[0]?.collection_filter).toBe("salt country field recordings");
  });

  it("reports an uncounted collection as uncounted rather than as empty", async () => {
    const { client } = clientFor([() => jsonResponse(fixture("collections"))]);
    const result = await settle(
      runListCollections(client, {
        limit: 2,
        page: 1,
        searchable_only: false,
        max_description_chars: 300,
      }),
      AMPLE_MS,
    );
    const rows = structured(result).collections as Array<{ item_count: number | null }>;

    expect(rows[1]?.item_count).toBeNull();
    expect(text(result)).not.toContain("0 records");
  });
});
