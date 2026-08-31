/**
 * One request per route, against the site itself.
 *
 * It is skipped unless LOC_LIVE=1, because it is the only suite that leaves the
 * machine. It asserts the shape of what comes back rather than the content: a
 * catalogue changes, and a test that pins a title would fail for the wrong
 * reason. Requests stay spaced by the client's own pacing, so the suite takes
 * the better part of a minute by design.
 *
 * Two outcomes are told apart here, because only one of them is worth waking
 * somebody for. A field or a route the Library changed is a broken contract and
 * fails the suite, naming what moved. A site that refused, timed out or could
 * not be reached says nothing about the contract: that night is written to
 * stderr and the case is left out, since a canary that reddens on a bad night
 * teaches nobody anything and stops being read.
 */

import process from "node:process";
import { describe, expect, it, type TestContext } from "vitest";
import { LocClient, type Read } from "../../src/loc/client.js";
import { LocError } from "../../src/errors.js";
import { loadConfig } from "../../src/config.js";
import { longestReadMs } from "../../src/loc/http.js";

const live = process.env.LOC_LIVE === "1" ? describe : describe.skip;

/**
 * What each case below is allowed to take, read from the client's own patience.
 *
 * A read that meets silence or push-back spends deadlines, waits and spacing in
 * series, and it reports what the Library did only once it has spent them all.
 * A runner that gives up first replaces that report with a timeout of its own,
 * which reddens this suite on a slow night and says the contract moved. The
 * longest of the two route deadlines governs the whole suite, so every case is
 * covered by one figure that follows whatever settings the run was given.
 */
const CONFIG = loadConfig();
const BUDGET_MS = longestReadMs({
  timeoutMs: Math.max(CONFIG.timeoutMs, CONFIG.newspaperTimeoutMs),
  maxRetries: CONFIG.maxRetries,
  intervalMs: CONFIG.minIntervalMs,
});

/** Codes that name the state of the site rather than the shape of its answers. */
const UPSTREAM_TROUBLE = new Set(["rate_limited", "network_error", "timeout"]);

const codeOf = (error: unknown): string | null => (error instanceof LocError ? error.code : null);

function leaveOut(ctx: TestContext, route: string, error: LocError): void {
  process.stderr.write(
    `${route}: the Library did not answer this run [${error.code}] ${error.message}\n`,
  );
  ctx.skip();
}

/** One live read, or nothing at all when the site could not answer. */
async function readOrLeaveOut<T>(
  ctx: TestContext,
  route: string,
  read: () => Promise<Read<T>>,
): Promise<T | null> {
  try {
    return (await read()).data;
  } catch (error) {
    const code = codeOf(error);
    if (code !== null && UPSTREAM_TROUBLE.has(code)) {
      leaveOut(ctx, route, error as LocError);
      return null;
    }
    throw error;
  }
}

live("the site itself", { timeout: BUDGET_MS }, () => {
  const client = new LocClient();

  it("answers a catalogue search", async (ctx) => {
    const data = await readOrLeaveOut(ctx, "the books catalogue", () =>
      client.searchItems({
        query: "detective",
        format: "books",
        onlineOnly: true,
        limit: 3,
        page: 1,
      }),
    );
    if (data === null) {
      return;
    }

    expect(
      data.paging.resultCount,
      "pagination.of no longer counts the matching records",
    ).toBeGreaterThan(0);
    expect(
      data.records.length,
      "the catalogue route no longer carries its rows under results",
    ).toBeGreaterThan(0);
    expect(data.records[0]?.sourceUrl, "a row no longer carries an address on loc.gov").toContain(
      "loc.gov",
    );
  });

  it("narrows a catalogue search by year and by subject", async (ctx) => {
    const data = await readOrLeaveOut(ctx, "the books catalogue, narrowed", () =>
      client.searchItems({
        query: "detective",
        format: "books",
        facets: { language: "english" },
        yearFrom: 1920,
        yearTo: 1929,
        onlineOnly: true,
        limit: 3,
        page: 1,
      }),
    );
    if (data === null) {
      return;
    }

    expect(
      data.paging.resultCount,
      "the dates and fa parameters no longer narrow to a set with anything in it",
    ).toBeGreaterThan(0);
  });

  it("answers a search of the scanned newspaper pages", async (ctx) => {
    const data = await readOrLeaveOut(ctx, "the newspaper corpus", () =>
      client.searchNewspapers('"cure for influenza"', 3, 1, {
        maxChars: 300,
        maxCount: 2,
      }),
    );
    if (data === null) {
      return;
    }

    expect(
      data.paging.resultCount,
      "pagination.of no longer counts the matching pages",
    ).toBeGreaterThan(0);
    expect(
      data.hits[0]?.publication,
      "a page no longer names its paper under partof_title",
    ).toBeTruthy();
    expect(
      data.hits[0]?.pageNumber,
      "a page no longer carries its leaf under number_page",
    ).toBeGreaterThan(0);
    expect(data.hits[0]?.sourceUrl, "a page no longer carries an address on loc.gov").toContain(
      "loc.gov",
    );
  });

  it("reads one record", async (ctx) => {
    const data = await readOrLeaveOut(ctx, "the item route", () => client.getItem("2017645459"));
    if (data === null) {
      return;
    }

    expect(data.title, "the item route no longer carries a title").toBeTruthy();
    expect(data.sourceUrl, "the item route no longer carries the address of the record").toContain(
      "2017645459",
    );
  });

  it("reads a record whose identifier names several things", async (ctx) => {
    const data = await readOrLeaveOut(ctx, "the item route, for a newspaper page", () =>
      client.getItem("sn83045462/1929-02-03/ed-1"),
    );
    if (data === null) {
      return;
    }

    expect(
      data.identifier,
      "an identifier made of a paper, a date and an edition no longer resolves",
    ).toBe("sn83045462/1929-02-03/ed-1");
    expect(data.title, "the item route no longer carries a title").toBeTruthy();
  });

  it("reports a record the Library does not hold as an absence", async (ctx) => {
    try {
      await client.getItem("zzzz-no-such-record-zzzz");
    } catch (error) {
      const code = codeOf(error);
      if (code !== null && UPSTREAM_TROUBLE.has(code)) {
        leaveOut(ctx, "the item route, for a record nobody holds", error as LocError);
        return;
      }
      expect(code, "a record the Library does not hold no longer comes back as an absence").toBe(
        "not_found",
      );
      return;
    }
    expect.fail("a record the Library does not hold came back as a record");
  });

  it("lists the collections", async (ctx) => {
    const data = await readOrLeaveOut(ctx, "the collections route", () =>
      client.listCollections(3, 1),
    );
    if (data === null) {
      return;
    }

    expect(
      data.paging.resultCount,
      "pagination.of no longer counts the collections the Library publishes",
    ).toBeGreaterThan(0);
    expect(data.collections[0]?.title, "a collection row no longer carries a title").toBeTruthy();
  });
});
