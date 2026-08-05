/**
 * What addresses this server is allowed to build.
 *
 * loc.gov disallows /search for every client, so no combination of arguments,
 * through any tool, may produce that path. The suite drives every tool over a
 * wide spread of arguments and reads back only the addresses that were asked
 * for.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { LocClient } from "../../src/loc/client.js";
import { runSearchItems, searchItemsInput } from "../../src/tools/searchItems.js";
import { runSearchNewspapers, searchNewspapersInput } from "../../src/tools/searchNewspapers.js";
import { getItemInput, runGetItem } from "../../src/tools/getItem.js";
import { listCollectionsInput, runListCollections } from "../../src/tools/listCollections.js";
import { FORMAT_ROUTES } from "../../src/loc/paths.js";
import { REPO_URL } from "../../src/version.js";
import {
  CATALOGUE_ROW,
  COLLECTION_ROW,
  EPOCH,
  cataloguePayload,
  collectionsPayload,
  itemPayload,
  jsonResponse,
  newspaperRow,
  newspapersPayload,
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

/** Answers any address with something every parser can read. */
function omniFetch() {
  return recordingFetch(() => jsonResponse(EVERYTHING));
}

const EVERYTHING = {
  ...cataloguePayload([CATALOGUE_ROW]),
  ...itemPayload(),
};

function client(fetchImpl: typeof fetch): LocClient {
  return new LocClient({ config: { logLevel: "silent" }, logger: silent, fetchImpl });
}

/** Every address the four tools produce across a wide spread of arguments. */
async function everyAddress(): Promise<string[]> {
  const urls: string[] = [];

  for (const media of FORMAT_ROUTES as readonly string[]) {
    for (const sort of ["relevance", "newest", "oldest", "title"]) {
      for (const online of [true, false]) {
        const recorder = recordingFetch(() =>
          jsonResponse({ ...cataloguePayload([CATALOGUE_ROW]) }),
        );
        await settle(
          runSearchItems(
            client(recorder.fetchImpl),
            searchItemsInput.parse({
              query: 'search "everything" & more',
              media_type: media,
              sort,
              online_only: online,
              year_from: 1800,
              year_to: 1900,
              subject: "search",
              location: "search",
              language: "search",
              collection: "search",
              limit: 50,
              page: 7,
            }),
          ),
        );
        urls.push(...recorder.urls);
      }
    }
  }

  for (const page of [1, 2, 100]) {
    for (const limit of [1, 25]) {
      const recorder = recordingFetch(() => jsonResponse(newspapersPayload([newspaperRow()])));
      await settle(
        runSearchNewspapers(
          client(recorder.fetchImpl),
          searchNewspapersInput.parse({ query: '"search this phrase"', page, limit }),
        ),
      );
      urls.push(...recorder.urls);
    }
  }

  for (const identifier of [
    "2017645459",
    "sn83045462/1929-02-03/ed-1",
    "search",
    "collections/search/",
    "a b/c#d?e=f",
    "../../search",
  ]) {
    const recorder = recordingFetch(() => jsonResponse(itemPayload()));
    await settle(
      runGetItem(
        client(recorder.fetchImpl),
        getItemInput.parse({ identifier, sections: ["basic", "citations", "resources"] }),
      ),
    );
    urls.push(...recorder.urls);
  }

  for (const page of [1, 100]) {
    const recorder = recordingFetch(() => jsonResponse(collectionsPayload([COLLECTION_ROW])));
    await settle(
      runListCollections(
        client(recorder.fetchImpl),
        listCollectionsInput.parse({ page, limit: 50 }),
      ),
    );
    urls.push(...recorder.urls);
  }

  return urls;
}

describe("the disallowed route is never built", () => {
  it("produced enough addresses for the question to mean something", async () => {
    const urls = await everyAddress();
    expect(urls.length).toBeGreaterThan(60);
  });

  /*
   * RED, and left red on purpose.
   *
   * CONTRACT.md: "Robots are read as written. A path a site disallows is not
   * called, whatever a workaround would make possible." The README repeats it:
   * "no address this server builds reaches that path".
   *
   * get_item joins the identifier into the path without neutralising relative
   * segments, so an identifier of "../../search" resolves to
   * https://www.loc.gov/search/?fo=json and "../search/everything" to
   * https://www.loc.gov/search/everything/?fo=json. The request goes out. The
   * identifier need not be hostile to get there: identifiers are opaque strings
   * taken from another tool's output, and one carrying "../" is enough.
   *
   * Two defensible fixes: refuse an identifier containing a "." or ".." segment
   * as invalid_input, or percent-encode the dots so the segment stays inside
   * /item/. Either keeps the promise; neither is in place.
   */
  it("never asks for a path the robots file disallows", async () => {
    for (const raw of await everyAddress()) {
      const url = new URL(raw);
      expect(url.pathname, `the address ${raw} reaches the disallowed /search`).not.toMatch(
        /^\/search(\/|$)/,
      );
    }
  });

  it("keeps an identifier inside the route it belongs to", async () => {
    const recorder = omniFetch();
    await settle(
      runGetItem(client(recorder.fetchImpl), getItemInput.parse({ identifier: "../../search" })),
    );
    for (const raw of recorder.urls) {
      expect(new URL(raw).pathname, `${raw} left the /item/ route`).toMatch(/^\/(item|resource)\//);
    }
  });

  it("does not mistake a legitimate identifier that reads like the route", async () => {
    // "/item/search/" is not "/search": the robots rule names the second only.
    const recorder = omniFetch();
    await settle(
      runGetItem(client(recorder.fetchImpl), getItemInput.parse({ identifier: "search" })),
    );
    expect(new URL(recorder.urls[0] as string).pathname).toBe("/item/search/");
  });

  it("cannot be pushed onto /search by an argument that spells it", async () => {
    const recorder = omniFetch();
    await settle(
      runSearchItems(
        client(recorder.fetchImpl),
        searchItemsInput.parse({
          query: "../search",
          media_type: "books",
          collection: "/search/",
          subject: "search",
        }),
      ),
    );
    for (const raw of recorder.urls) {
      expect(new URL(raw).pathname.split("/").filter(Boolean)).not.toContain("search");
    }
  });

  /*
   * RED, for the same reason as the sweep above, stated on the single argument
   * that produces it: "../search/everything" resolves to /search/everything/.
   */
  it("cannot be pushed onto /search by an identifier that spells it", async () => {
    const recorder = omniFetch();
    await settle(
      runGetItem(
        client(recorder.fetchImpl),
        getItemInput.parse({ identifier: "../search/everything" }),
      ),
    );
    for (const raw of recorder.urls) {
      expect(new URL(raw).pathname).not.toMatch(/^\/search(\/|$)/);
    }
  });
});

describe("every address is well formed and points at the Library", () => {
  it("parses, uses https and names a loc.gov host", async () => {
    for (const raw of await everyAddress()) {
      const url = new URL(raw);
      expect(url.protocol).toBe("https:");
      expect(url.hostname.endsWith("loc.gov"), `${raw} is not a loc.gov address`).toBe(true);
    }
  });

  it("asks for a machine-readable answer rather than a page", async () => {
    for (const raw of await everyAddress()) {
      expect(new URL(raw).searchParams.get("fo"), `${raw} does not ask for JSON`).toBe("json");
    }
  });

  it("escapes an identifier carrying spaces and reserved characters", async () => {
    const recorder = omniFetch();
    await settle(
      runGetItem(client(recorder.fetchImpl), getItemInput.parse({ identifier: "a b/c#d?e=f" })),
    );
    const url = new URL(recorder.urls[0] as string);
    // A '#' or '?' left raw would silently truncate the address.
    expect(url.pathname).not.toContain(" ");
    expect(url.hash).toBe("");
    expect(url.searchParams.get("e")).toBeNull();
  });

  it("keeps the slashes of a newspaper issue identifier as path segments", async () => {
    const recorder = omniFetch();
    await settle(
      runGetItem(
        client(recorder.fetchImpl),
        getItemInput.parse({ identifier: "sn83045462/1929-02-03/ed-1" }),
      ),
    );
    const path = new URL(recorder.urls[0] as string).pathname;
    expect(path).toContain("sn83045462");
    expect(path).toContain("1929-02-03");
    expect(path).toContain("ed-1");
  });
});

describe("the User-Agent always reaches a human", () => {
  it("carries the project identifier by default", async () => {
    const recorder = omniFetch();
    await settle(runListCollections(client(recorder.fetchImpl), listCollectionsInput.parse({})));
    const agent = String(
      (recorder.headers[0] ?? {})["user-agent"] ?? (recorder.headers[0] ?? {})["User-Agent"],
    );
    expect(agent).toContain("mcp-libraryofcongress");
    expect(agent).toContain(REPO_URL);
  });

  it("keeps the contact address when a caller names itself", async () => {
    const recorder = omniFetch();
    const named = new LocClient({
      config: { userAgent: "SomebodyElse/1.0 (+https://example.invalid)", logLevel: "silent" },
      logger: silent,
      fetchImpl: recorder.fetchImpl,
    });
    await settle(runListCollections(named, listCollectionsInput.parse({})));
    const agent = String(
      (recorder.headers[0] ?? {})["user-agent"] ?? (recorder.headers[0] ?? {})["User-Agent"],
    );
    expect(agent).toContain("SomebodyElse/1.0");
    expect(agent).toContain(REPO_URL);
  });

  it("cannot be stripped by a caller handing in an empty one", async () => {
    const recorder = omniFetch();
    const anonymous = new LocClient({
      config: { userAgent: "   ", logLevel: "silent" },
      logger: silent,
      fetchImpl: recorder.fetchImpl,
    });
    expect(anonymous.userAgent).toContain(REPO_URL);
    await settle(runListCollections(anonymous, listCollectionsInput.parse({})));
    const agent = String(
      (recorder.headers[0] ?? {})["user-agent"] ?? (recorder.headers[0] ?? {})["User-Agent"],
    );
    expect(agent).toContain(REPO_URL);
  });
});
