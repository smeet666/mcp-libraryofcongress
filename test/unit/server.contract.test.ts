import { describe, expect, it } from "vitest";
import { z } from "zod";
import { INSTRUCTIONS, createServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";
import { getItemInput, getItemOutput } from "../../src/tools/getItem.js";
import { listCollectionsInput, listCollectionsOutput } from "../../src/tools/listCollections.js";
import { searchItemsInput, searchItemsOutput } from "../../src/tools/searchItems.js";
import { searchNewspapersInput, searchNewspapersOutput } from "../../src/tools/searchNewspapers.js";
import { silentLogger } from "./helpers.js";

interface RegisteredTool {
  description?: string;
  annotations?: Record<string, boolean>;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

function registered(): Record<string, RegisteredTool> {
  const server = createServer({ config: loadConfig({}), logger: silentLogger });
  return (server as unknown as { _registeredTools: Record<string, RegisteredTool> })
    ._registeredTools;
}

const TOOLS = ["search_newspapers", "search_items", "get_item", "list_collections"];

describe("what the server offers", () => {
  it("registers exactly the four tools", () => {
    expect(Object.keys(registered()).sort()).toEqual([...TOOLS].sort());
  });

  it("declares every tool as read-only", () => {
    for (const [name, tool] of Object.entries(registered())) {
      expect(tool.annotations, name).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    }
  });

  it("declares an input and an output schema on every tool", () => {
    for (const [name, tool] of Object.entries(registered())) {
      expect(tool.inputSchema, name).toBeDefined();
      expect(tool.outputSchema, name).toBeDefined();
    }
  });

  it("describes every tool in enough words to choose between them", () => {
    for (const [name, tool] of Object.entries(registered())) {
      expect((tool.description ?? "").length, name).toBeGreaterThan(200);
    }
  });

  it("tells a reader which question each tool answers", () => {
    expect(INSTRUCTIONS).toContain("search_newspapers");
    expect(INSTRUCTIONS).toContain("search_items");
    expect(INSTRUCTIONS).toContain("list_collections");
  });

  it("says that being asked to slow down is not an absence", () => {
    expect(INSTRUCTIONS).toContain("never that the thing you asked for is missing");
  });

  it("says that a record stating no terms is not a record granting permission", () => {
    expect(INSTRUCTIONS).toContain("not a record granting permission");
  });
});

describe("the arguments the two searches share", () => {
  const shape = (schema: z.ZodObject<z.ZodRawShape>) => Object.keys(schema.shape);

  it("names the catalogue arguments", () => {
    expect(shape(searchItemsInput)).toEqual(
      expect.arrayContaining([
        "query",
        "media_type",
        "year_from",
        "year_to",
        "sort",
        "limit",
        "page",
      ]),
    );
  });

  it("names the full-text arguments", () => {
    expect(shape(searchNewspapersInput)).toEqual([
      "query",
      "location",
      "publication",
      "year_from",
      "year_to",
      "limit",
      "page",
      "max_excerpt_chars",
      "max_excerpts_per_match",
    ]);
  });

  it("names a place and a span of years the same way in both searches", () => {
    for (const field of ["location", "year_from", "year_to"]) {
      expect(shape(searchItemsInput)).toContain(field);
      expect(shape(searchNewspapersInput)).toContain(field);
    }
  });

  it("returns one envelope from each search", () => {
    expect(shape(searchItemsOutput)).toEqual(["query", "total", "page", "items", "notes"]);
    expect(shape(searchNewspapersOutput)).toEqual(["query", "total", "page", "hits", "notes"]);
  });

  it("carries on every catalogue row what it takes to cite it", () => {
    const row = searchItemsOutput.shape.items.element as z.ZodObject<z.ZodRawShape>;

    expect(Object.keys(row.shape)).toEqual(
      expect.arrayContaining(["identifier", "title", "creator", "year", "source_url"]),
    );
  });

  it("carries on every match what it takes to cite the page it came from", () => {
    const hit = searchNewspapersOutput.shape.hits.element as z.ZodObject<z.ZodRawShape>;

    expect(Object.keys(hit.shape)).toEqual(
      expect.arrayContaining([
        "identifier",
        "title",
        "creator",
        "year",
        "excerpts",
        "source_url",
        "page_number",
        "published_on",
        "publication",
        "state",
      ]),
    );
  });

  it("takes an identifier and opt-in sections on the record reader", () => {
    expect(shape(getItemInput)).toEqual(
      expect.arrayContaining(["identifier", "sections", "offset"]),
    );
    expect(shape(getItemOutput)).toEqual(expect.arrayContaining(["next_offset", "notes"]));
  });

  it("pages the collection listing", () => {
    expect(shape(listCollectionsInput)).toEqual(expect.arrayContaining(["limit", "page"]));
    expect(shape(listCollectionsOutput)).toEqual(
      expect.arrayContaining(["total", "page", "collections", "notes"]),
    );
  });
});

describe("what the schemas promise", () => {
  it("accepts the media types the Library divides its catalogue into", () => {
    for (const kind of [
      "books",
      "photos",
      "maps",
      "audio",
      "film-and-videos",
      "manuscripts",
      "notated-music",
      "newspapers",
    ]) {
      expect(searchItemsInput.safeParse({ query: "x", media_type: kind }).success, kind).toBe(true);
    }
  });

  it("refuses a media type the Library keeps no catalogue for", () => {
    expect(searchItemsInput.safeParse({ query: "x", media_type: "software" }).success).toBe(false);
  });

  it("refuses a catalogue search that names no kind of thing", () => {
    expect(searchItemsInput.safeParse({ query: "x" }).success).toBe(false);
  });

  it("fills the budgets a full-text search leaves unset", () => {
    const parsed = searchNewspapersInput.parse({ query: "lamps" });

    expect(parsed.max_excerpt_chars).toBeGreaterThan(0);
    expect(parsed.max_excerpts_per_match).toBeGreaterThan(0);
    expect(parsed.page).toBe(1);
  });

  it("keeps only material with a copy to read unless told otherwise", () => {
    expect(searchItemsInput.parse({ query: "x", media_type: "books" }).online_only).toBe(true);
  });
});
