import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_INTERVAL_MS } from "../../src/config.js";
import { Cache } from "../../src/loc/cache.js";
import { LocClient } from "../../src/loc/client.js";
import { RateLimiter } from "../../src/loc/rateLimiter.js";
import {
  fixture,
  jsonResponse,
  scriptedFetch,
  settle,
  settlesAt,
  silentLogger,
} from "./helpers.js";

/** A fixed instant, so every reading below is a difference from the same zero. */
const EPOCH = Date.UTC(2024, 0, 1, 0, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("spacing between requests", () => {
  it("leaves the interval between two calls", async () => {
    const limiter = new RateLimiter({ intervalMs: 6000 });

    const first = settlesAt(limiter.beforeRequest());
    await vi.advanceTimersByTimeAsync(0);
    const second = settlesAt(limiter.schedule(() => limiter.beforeRequest()));
    await vi.advanceTimersByTimeAsync(6000);

    expect(await first).toBe(EPOCH);
    expect(await second).toBe(EPOCH + 6000);
  });

  it("widens when the site asks for room", () => {
    const limiter = new RateLimiter({ intervalMs: 6000 });
    limiter.pushBack();

    expect(limiter.currentIntervalMs).toBe(12_000);
  });

  it("never widens past its ceiling", () => {
    const limiter = new RateLimiter({ intervalMs: 6000, maxIntervalMs: 12_000 });
    limiter.pushBack();
    limiter.pushBack();
    limiter.pushBack();

    expect(limiter.currentIntervalMs).toBe(12_000);
  });

  it("takes several clean answers to narrow again", () => {
    const limiter = new RateLimiter({ intervalMs: 6000 });
    limiter.pushBack();

    limiter.succeeded();
    limiter.succeeded();
    expect(limiter.currentIntervalMs).toBe(12_000);

    limiter.succeeded();
    expect(limiter.currentIntervalMs).toBe(6000);
  });

  it("stays at its base after a run of clean answers", () => {
    const limiter = new RateLimiter({ intervalMs: 6000 });
    for (let i = 0; i < 10; i += 1) limiter.succeeded();

    expect(limiter.currentIntervalMs).toBe(6000);
  });

  it("runs one request at a time", async () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });
    const order: string[] = [];

    const first = limiter.schedule(async () => {
      order.push("first in");
      await new Promise((resolve) => setTimeout(resolve, 500));
      order.push("first out");
    });
    const second = limiter.schedule(async () => {
      order.push("second in");
    });

    await vi.advanceTimersByTimeAsync(1000);
    await first;
    await second;

    expect(order).toEqual(["first in", "first out", "second in"]);
  });

  it("keeps its place in the queue when a task fails", async () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });
    const failing = limiter.schedule(async () => {
      throw new Error("no");
    });
    const held = failing.catch(() => "handled");
    const after = limiter.schedule(async () => "ran");

    await vi.advanceTimersByTimeAsync(1000);

    expect(await held).toBe("handled");
    expect(await after).toBe("ran");
  });
});

describe("a client at work", () => {
  it("spaces two reads of different addresses by the interval", async () => {
    const { fetchImpl, at } = scriptedFetch([
      () => jsonResponse(fixture("catalogue")),
      () => jsonResponse(fixture("collections")),
    ]);
    const client = new LocClient({ logger: silentLogger, fetchImpl });

    const first = client.searchItems({
      query: "detective",
      format: "books",
      onlineOnly: true,
      limit: 3,
      page: 1,
    });
    const second = first.then(() => client.listCollections(2, 1));

    await settle(second, 60_000);

    expect(at[0]).toBe(EPOCH);
    expect(at[1]).toBe(EPOCH + DEFAULT_INTERVAL_MS);
  });

  it("answers a repeated question without asking the site again", async () => {
    const { fetchImpl, count } = scriptedFetch([() => jsonResponse(fixture("catalogue"))]);
    const client = new LocClient({ logger: silentLogger, fetchImpl });
    const query = {
      query: "detective",
      format: "books" as const,
      onlineOnly: true,
      limit: 3,
      page: 1,
    };

    const first = await settle(client.searchItems(query), 60_000);
    const second = await settle(client.searchItems(query), 60_000);

    expect(count()).toBe(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
  });

  it("does not serve one excerpt budget in place of another", async () => {
    const { fetchImpl, count } = scriptedFetch([
      () => jsonResponse(fixture("newspapers")),
      () => jsonResponse(fixture("newspapers")),
    ]);
    const client = new LocClient({ logger: silentLogger, fetchImpl });

    const narrow = await settle(
      client.searchNewspapers("lamps", 2, 1, { maxChars: 100, maxCount: 1 }),
      60_000,
    );
    const wide = await settle(
      client.searchNewspapers("lamps", 2, 1, { maxChars: 400, maxCount: 3 }),
      60_000,
    );

    expect(count()).toBe(2);
    expect(wide.cached).toBe(false);
    expect(narrow.data.hits[0]?.excerpts[0]?.length).toBeLessThan(
      wide.data.hits[0]!.excerpts[0]!.length,
    );
  });
});

describe("the store", () => {
  it("forgets an entry once its lifetime has passed", () => {
    const cache = new Cache<string>(1000, 10);
    cache.set("a", "value");

    vi.setSystemTime(EPOCH + 1001);

    expect(cache.get("a")).toBeUndefined();
  });

  it("keeps an entry within its lifetime", () => {
    const cache = new Cache<string>(1000, 10);
    cache.set("a", "value");

    vi.setSystemTime(EPOCH + 999);

    expect(cache.get("a")).toBe("value");
  });

  it("writes nothing when given no lifetime", () => {
    const cache = new Cache<string>(0, 10);
    cache.set("a", "value");

    expect(cache.size).toBe(0);
  });

  it("drops the least recently read entry when it is full", () => {
    const cache = new Cache<string>(10_000, 2);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.get("a");
    cache.set("c", "3");

    expect(cache.get("a")).toBe("1");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe("3");
  });
});
