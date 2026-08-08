/**
 * What the server is allowed to claim, taken across the whole surface.
 *
 * The registration is read through the protocol rather than off the module, so
 * a tool is held to what a client actually receives.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, INSTRUCTIONS } from "../../src/server.js";
import { LocClient } from "../../src/loc/client.js";
import { LocError } from "../../src/errors.js";
import { getItemDescription } from "../../src/tools/getItem.js";
import { searchItemsDescription } from "../../src/tools/searchItems.js";
import { searchNewspapersDescription } from "../../src/tools/searchNewspapers.js";
import { listCollectionsDescription } from "../../src/tools/listCollections.js";
import { loadConfig } from "../../src/config.js";
import {
  CATALOGUE_ROW,
  EPOCH,
  PAGE_WITHOUT_WORDS,
  PAGE_WITH_WORDS,
  cataloguePayload,
  itemPayload,
  jsonResponse,
  newspaperRow,
  newspapersPayload,
  outcome,
  paging,
  recordingFetch,
  settle,
  silent,
} from "./spec.support.js";

beforeEach(() => {
  vi.useFakeTimers({ now: EPOCH });
});
afterEach(() => {
  vi.useRealTimers();
});

const ALL_TEXT = [
  INSTRUCTIONS,
  searchNewspapersDescription,
  searchItemsDescription,
  getItemDescription,
  listCollectionsDescription,
].join("\n");

describe("what the server tells a model before it calls anything", () => {
  async function tools() {
    const recorder = recordingFetch(() => jsonResponse(cataloguePayload([CATALOGUE_ROW])));
    const server = createServer({
      config: { ...loadConfig({}), logLevel: "silent" },
      logger: silent,
      fetchImpl: recorder.fetchImpl,
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "spec", version: "0" });
    await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
    const listed = await client.listTools();
    await client.close();
    return listed.tools;
  }

  it("publishes the four tools the README names", async () => {
    const names = (await tools()).map((tool) => tool.name).sort();
    expect(names).toEqual(["get_item", "list_collections", "search_items", "search_newspapers"]);
  });

  it("declares every tool read-only, non-destructive, idempotent and open-world", async () => {
    for (const tool of await tools()) {
      expect(tool.annotations, `${tool.name} declares no annotations`).toBeDefined();
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
      expect(tool.annotations?.idempotentHint, tool.name).toBe(true);
      expect(tool.annotations?.openWorldHint, tool.name).toBe(true);
    }
  });

  it("declares an output schema for every tool", async () => {
    for (const tool of await tools()) {
      expect(tool.outputSchema, `${tool.name} declares no output schema`).toBeDefined();
      expect(tool.outputSchema?.type).toBe("object");
    }
  });

  it("names the arguments the contract fixes, and no synonyms of them", async () => {
    const byName = new Map((await tools()).map((tool) => [tool.name, tool]));
    const newspapers = byName.get("search_newspapers");
    const properties = Object.keys(
      (newspapers?.inputSchema.properties ?? {}) as Record<string, unknown>,
    );
    // The point of this assertion is that a narrowing carries the name the
    // contract fixes for it and never a synonym: a place is 'location' and a
    // span of years is 'year_from'/'year_to', the same words search_items uses,
    // so 'state', 'from_year' or 'newspaper' appearing here would be a failure.
    expect(properties.sort()).toEqual([
      "limit",
      "location",
      "max_excerpt_chars",
      "max_excerpts_per_match",
      "page",
      "publication",
      "query",
      "year_from",
      "year_to",
    ]);
  });

  it("says a rate limit is not an absence", () => {
    expect(INSTRUCTIONS).toMatch(/rate_limited/);
    expect(INSTRUCTIONS).toMatch(/never that the thing you asked for is missing/i);
  });

  it("says every result carries a link back", () => {
    expect(INSTRUCTIONS).toMatch(/source_url/);
    expect(INSTRUCTIONS).toMatch(/Credit the Library of Congress/i);
  });

  it("never calls the text returned with a newspaper row the passage that matched", () => {
    const claim =
      /(the )?(passage|excerpt|snippet)s? (that|which) match|matching (passage|excerpt)/i;
    expect(ALL_TEXT).not.toMatch(claim);
  });

  it("never promises the excerpt is centred on the words without the condition", () => {
    for (const sentence of ALL_TEXT.split(/(?<=\.)\s+/)) {
      if (/centred on|centered on/i.test(sentence)) {
        expect(sentence, `unconditional claim: ${sentence}`).toMatch(
          /words_located|when .*found|True when/i,
        );
      }
    }
  });
});

describe("words_located says what actually happened", () => {
  function client(fetchImpl: typeof fetch): LocClient {
    return new LocClient({ config: { logLevel: "silent" }, logger: silent, fetchImpl });
  }

  async function hits(query: string, text: string) {
    const recorder = recordingFetch(() =>
      jsonResponse(newspapersPayload([newspaperRow({ description: [text] })], paging(3, 2))),
    );
    const read = await settle(
      client(recorder.fetchImpl).searchNewspapers(query, 5, 1, { maxChars: 400, maxCount: 3 }),
    );
    return read.data.hits;
  }

  it("is true only when the returned text really carries the words", async () => {
    const [found] = await hits("lamps", PAGE_WITH_WORDS);
    expect(found?.wordsLocated).toBe(true);
    expect(found?.excerpts.join(" ").toLowerCase()).toContain("lamps");
  });

  it("is false when it does not, and the excerpt is then the opening of the page", async () => {
    const [missing] = await hits("lamps", PAGE_WITHOUT_WORDS);
    expect(missing?.wordsLocated).toBe(false);
    const first = missing?.excerpts[0] ?? "";
    expect(first.length).toBeGreaterThan(0);
    expect(PAGE_WITHOUT_WORDS.startsWith(first.replace(/…$/, "").trimEnd())).toBe(true);
  });

  // An excerpt is centred on a quoted run of words only where that run appears
  // as written, so text holding those words scattered has not located it and
  // the opening of the page is what comes back.
  it("is false when a quoted phrase is absent even though its words are present", async () => {
    const scattered =
      "SALT COUNTY HERALD The lamps of the hall were lit and the meeting went on " +
      "until the members walked out into the rain.";
    const [hit] = await hits('"the lamps went out"', scattered);
    expect(hit?.wordsLocated).toBe(false);
  });

  it("does not claim the words were located on a row carrying no text at all", async () => {
    const [hit] = await hits("lamps", "");
    if (hit) {
      expect(hit.wordsLocated).toBe(false);
      expect(hit.excerpts).toEqual([]);
    }
  });
});

describe("the error taxonomy the contract fixes", () => {
  const CODES = [
    "not_found",
    "invalid_input",
    "rate_limited",
    "parse_failure",
    "network_error",
    "timeout",
  ];

  function client(fetchImpl: typeof fetch, config: Record<string, unknown> = {}): LocClient {
    return new LocClient({
      config: { logLevel: "silent", ...config },
      logger: silent,
      fetchImpl,
    });
  }

  it("reports a code from the six, whatever goes wrong", async () => {
    const cases: Array<[string, typeof fetch]> = [
      ["404", recordingFetch(() => jsonResponse({ status: 404 }, { status: 404 })).fetchImpl],
      ["429", recordingFetch(() => jsonResponse({}, { status: 429 })).fetchImpl],
      ["500", recordingFetch(() => jsonResponse({}, { status: 500 })).fetchImpl],
      ["garbage", recordingFetch(() => jsonResponse("{{{", {})).fetchImpl],
      [
        "refused",
        (async () => {
          throw new TypeError("fetch failed");
        }) as unknown as typeof fetch,
      ],
    ];
    for (const [label, fetchImpl] of cases) {
      const { threw, error } = await outcome(client(fetchImpl).getItem("some-record"));
      expect(threw, `${label} did not fail`).toBe(true);
      expect(error, `${label} threw something other than a LocError`).toBeInstanceOf(LocError);
      expect(CODES, `${label} produced an unlisted code`).toContain((error as LocError).code);
    }
  });

  it("abandons a request that never answers, and calls it a timeout", async () => {
    const hanging = (async (
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) {
          reject(new DOMException("The operation was aborted.", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      })) as unknown as typeof fetch;

    const { threw, error } = await outcome(
      client(hanging, { timeoutMs: 1000, maxRetries: 0 }).getItem("never-answers"),
    );
    expect(threw).toBe(true);
    expect((error as LocError).code).toBe("timeout");
  });

  it("never says a rate limit means the thing is missing", async () => {
    const { error } = await outcome(
      client(recordingFetch(() => jsonResponse({}, { status: 429 })).fetchImpl).getItem("x"),
    );
    expect((error as LocError).code).toBe("rate_limited");
    expect((error as LocError).details.hint ?? "").toMatch(
      /nothing about whether the Library holds/i,
    );
  });

  it("points a parse failure at a report rather than at the caller's arguments", async () => {
    const { error } = await outcome(
      client(recordingFetch(() => jsonResponse({ nothing: true })).fetchImpl).getItem("x"),
    );
    expect((error as LocError).code).toBe("parse_failure");
    expect((error as LocError).details.hint ?? "").toMatch(/issues/);
  });
});

describe("a read says what it knows about itself", () => {
  function client(fetchImpl: typeof fetch): LocClient {
    return new LocClient({ config: { logLevel: "silent" }, logger: silent, fetchImpl });
  }

  it("reports nothing skipped when nothing was", async () => {
    const recorder = recordingFetch(() => jsonResponse(itemPayload()));
    const read = await settle(client(recorder.fetchImpl).getItem("glass-orchard-1971"));
    expect(read.skipped).toBeUndefined();
    expect(read.cached).toBe(false);
  });

  it("reports what it dropped when a row came back unreadable", async () => {
    const recorder = recordingFetch(() =>
      jsonResponse(
        cataloguePayload(
          [CATALOGUE_ROW, { date: "1900" }, { contributor: ["nobody"] }],
          paging(12, 3),
        ),
      ),
    );
    const read = await settle(
      client(recorder.fetchImpl).searchItems({
        query: "orchard",
        format: "books",
        onlineOnly: true,
        sort: "relevance",
        limit: 3,
        page: 1,
      } as never),
    );
    const dropped = 3 - read.data.records.length;
    if (dropped > 0) expect(read.skipped).toBe(dropped);
    expect(read.data.paging.resultCount).toBe(12);
  });

  it("does not store an answer nobody could read", async () => {
    let call = 0;
    const recorder = recordingFetch(() => {
      call += 1;
      return call === 1 ? jsonResponse({ nothing: true }) : jsonResponse(itemPayload());
    });
    const paced = client(recorder.fetchImpl);
    const first = await outcome(paced.getItem("glass-orchard-1971"));
    expect(first.threw).toBe(true);
    const second = await settle(paced.getItem("glass-orchard-1971"));
    expect(second.cached).toBe(false);
    expect(recorder.urls.length).toBe(2);
  });
});
