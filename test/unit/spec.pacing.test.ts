/**
 * The floor on how fast this server may call the Library.
 *
 * CONTRACT.md: "One request at a time, with a minimum interval. The floor
 * cannot be lowered through configuration or through the published client entry
 * point." Every reading below comes from a fake clock; nothing here measures
 * wall time and no assertion carries a tolerance.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { LocClient } from "../../src/loc/client.js";
import { MIN_ALLOWED_INTERVAL_MS, DEFAULT_INTERVAL_MS, loadConfig } from "../../src/config.js";
import { getItemInput, runGetItem } from "../../src/tools/getItem.js";
import { searchItemsInput, runSearchItems } from "../../src/tools/searchItems.js";
import {
  CATALOGUE_ROW,
  EPOCH,
  cataloguePayload,
  itemPayload,
  jsonResponse,
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

describe("the pacing floor cannot be lowered", () => {
  it("defaults to the spacing the published ceiling asks for", () => {
    expect(loadConfig({}).minIntervalMs).toBe(DEFAULT_INTERVAL_MS);
    expect(DEFAULT_INTERVAL_MS).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
  });

  it("refuses an environment variable below the floor", () => {
    expect(loadConfig({ LOC_MIN_INTERVAL_MS: "1" }).minIntervalMs).toBeGreaterThanOrEqual(
      MIN_ALLOWED_INTERVAL_MS,
    );
    expect(loadConfig({ LOC_MIN_INTERVAL_MS: "0" }).minIntervalMs).toBeGreaterThanOrEqual(
      MIN_ALLOWED_INTERVAL_MS,
    );
    expect(loadConfig({ LOC_MIN_INTERVAL_MS: "-5000" }).minIntervalMs).toBeGreaterThanOrEqual(
      MIN_ALLOWED_INTERVAL_MS,
    );
  });

  it("refuses a value that is not a whole number of milliseconds", () => {
    for (const raw of ["fast", "3000.5", "1e-3", "Infinity", "NaN", " "]) {
      expect(
        loadConfig({ LOC_MIN_INTERVAL_MS: raw }).minIntervalMs,
        `LOC_MIN_INTERVAL_MS=${raw} lowered the floor`,
      ).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
    }
  });

  it("holds the floor against a configuration object handed to the published client", () => {
    for (const claimed of [0, 1, -1, 999, 2999]) {
      const client = new LocClient({ config: { minIntervalMs: claimed }, logger: silent });
      expect(
        client.intervalMs,
        `a caller asking for ${claimed}ms got ${client.intervalMs}ms`,
      ).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
    }
  });

  it("holds the floor against a value of the wrong shape", () => {
    for (const claimed of [
      undefined,
      null,
      Number.NaN,
      "1",
      "fast",
      Number.NEGATIVE_INFINITY,
    ] as unknown[]) {
      const client = new LocClient({
        config: { minIntervalMs: claimed as number },
        logger: silent,
      });
      expect(
        client.intervalMs,
        `a caller handing in ${String(claimed)} got ${client.intervalMs}ms`,
      ).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
    }
  });

  it("lets a caller slow down, since only the floor is fixed", () => {
    const client = new LocClient({ config: { minIntervalMs: 20_000 }, logger: silent });
    expect(client.intervalMs).toBe(20_000);
  });
});

describe("the floor is what the network actually sees", () => {
  const item = () => jsonResponse(itemPayload());

  async function gapBetweenTwoReads(minIntervalMs: number): Promise<number> {
    const recorder = recordingFetch(item);
    const client = new LocClient({
      config: { minIntervalMs, logLevel: "silent", cacheTtlMs: 0 },
      logger: silent,
      fetchImpl: recorder.fetchImpl,
    });
    const both = Promise.all([
      client.getItem("first-record").catch(() => undefined),
      client.getItem("second-record").catch(() => undefined),
    ]);
    await settle(both);
    expect(recorder.at.length).toBe(2);
    return (recorder.at[1] as number) - (recorder.at[0] as number);
  }

  it("spaces two reads by at least the floor even when asked for none", async () => {
    expect(await gapBetweenTwoReads(1)).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
  });

  it("spaces two reads by the default when nothing is configured", async () => {
    expect(await gapBetweenTwoReads(DEFAULT_INTERVAL_MS)).toBeGreaterThanOrEqual(
      DEFAULT_INTERVAL_MS,
    );
  });

  it("paces the server as a whole rather than one tool at a time", async () => {
    const recorder = recordingFetch(() =>
      jsonResponse({ ...cataloguePayload([CATALOGUE_ROW]), ...itemPayload() }),
    );
    const client = new LocClient({
      config: { minIntervalMs: 1, logLevel: "silent", cacheTtlMs: 0 },
      logger: silent,
      fetchImpl: recorder.fetchImpl,
    });
    const work = Promise.all([
      runGetItem(client, getItemInput.parse({ identifier: "one" })),
      runSearchItems(client, searchItemsInput.parse({ query: "two", media_type: "books" })),
      runGetItem(client, getItemInput.parse({ identifier: "three" })),
    ]);
    await settle(work);
    expect(recorder.at.length).toBe(3);
    for (let i = 1; i < recorder.at.length; i += 1) {
      const gap = (recorder.at[i] as number) - (recorder.at[i - 1] as number);
      expect(gap, `requests ${i} and ${i + 1} were ${gap}ms apart`).toBeGreaterThanOrEqual(
        MIN_ALLOWED_INTERVAL_MS,
      );
    }
  });

  it("sends one request at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = (async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return jsonResponse(itemPayload());
    }) as unknown as typeof fetch;
    const client = new LocClient({
      config: { minIntervalMs: 1, logLevel: "silent", cacheTtlMs: 0 },
      logger: silent,
      fetchImpl,
    });
    await settle(
      Promise.all([
        client.getItem("a").catch(() => undefined),
        client.getItem("b").catch(() => undefined),
        client.getItem("c").catch(() => undefined),
      ]),
    );
    expect(peak).toBe(1);
  });

  it("does not spend a slot on an answer it already holds", async () => {
    const recorder = recordingFetch(item);
    const client = new LocClient({
      config: { minIntervalMs: 1, logLevel: "silent" },
      logger: silent,
      fetchImpl: recorder.fetchImpl,
    });
    await settle(client.getItem("same-record"));
    const before = recorder.at.length;
    const second = await settle(client.getItem("same-record"));
    expect(recorder.at.length).toBe(before);
    expect(second.cached).toBe(true);
  });
});

describe("what the client reports about itself", () => {
  it("states the pacing in force", () => {
    const client = new LocClient({ config: { minIntervalMs: 8000 }, logger: silent });
    expect(client.intervalMs).toBe(8000);
  });

  it("widens rather than narrows when the Library pushes back", async () => {
    const recorder = recordingFetch(() => jsonResponse({ error: "slow" }, { status: 429 }));
    const client = new LocClient({
      config: { minIntervalMs: MIN_ALLOWED_INTERVAL_MS, logLevel: "silent", maxRetries: 1 },
      logger: silent,
      fetchImpl: recorder.fetchImpl,
    });
    await settle(client.getItem("pushed-back").catch(() => undefined));
    expect(client.intervalMs).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
  });
});
