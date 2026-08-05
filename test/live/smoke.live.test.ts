/**
 * One request per route, against the site itself.
 *
 * It is skipped unless LOC_LIVE=1, because it is the only suite that leaves the
 * machine. It asserts the shape of what comes back rather than the content: a
 * catalogue changes, and a test that pins a title would fail for the wrong
 * reason. Requests stay spaced by the client's own pacing, so the suite takes
 * the better part of a minute by design.
 */

import { describe, expect, it } from "vitest";
import { LocClient } from "../../src/loc/client.js";

const live = process.env.LOC_LIVE === "1" ? describe : describe.skip;

live("the site itself", () => {
  const client = new LocClient();

  it("answers a catalogue search", async () => {
    const { data } = await client.searchItems({
      query: "detective",
      format: "books",
      onlineOnly: true,
      limit: 3,
      page: 1,
    });

    expect(data.paging.resultCount).toBeGreaterThan(0);
    expect(data.records.length).toBeGreaterThan(0);
    expect(data.records[0]?.sourceUrl).toContain("loc.gov");
  });

  it("narrows a catalogue search by year and by subject", async () => {
    const { data } = await client.searchItems({
      query: "detective",
      format: "books",
      facets: { language: "english" },
      yearFrom: 1920,
      yearTo: 1929,
      onlineOnly: true,
      limit: 3,
      page: 1,
    });

    expect(data.paging.resultCount).toBeGreaterThan(0);
  });

  it("answers a search of the scanned newspaper pages", async () => {
    const { data } = await client.searchNewspapers('"cure for influenza"', 3, 1, {
      maxChars: 300,
      maxCount: 2,
    });

    expect(data.paging.resultCount).toBeGreaterThan(0);
    expect(data.hits[0]?.publication).toBeTruthy();
    expect(data.hits[0]?.pageNumber).toBeGreaterThan(0);
    expect(data.hits[0]?.sourceUrl).toContain("loc.gov");
  });

  it("reads one record", async () => {
    const { data } = await client.getItem("2017645459");

    expect(data.title).toBeTruthy();
    expect(data.sourceUrl).toContain("2017645459");
  });

  it("reads a record whose identifier names several things", async () => {
    const { data } = await client.getItem("sn83045462/1929-02-03/ed-1");

    expect(data.identifier).toBe("sn83045462/1929-02-03/ed-1");
    expect(data.title).toBeTruthy();
  });

  it("reports a record the Library does not hold as an absence", async () => {
    await expect(client.getItem("zzzz-no-such-record-zzzz")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("lists the collections", async () => {
    const { data } = await client.listCollections(3, 1);

    expect(data.paging.resultCount).toBeGreaterThan(0);
    expect(data.collections[0]?.title).toBeTruthy();
  });
});
