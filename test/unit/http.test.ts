import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocError } from "../../src/errors.js";
import { fetchJson, fetchText, parseRetryAfter } from "../../src/loc/http.js";
import { RateLimiter } from "../../src/loc/rateLimiter.js";
import {
  captureAsync,
  hangingFetch,
  jsonResponse,
  scriptedFetch,
  settle,
  silentLogger,
} from "./helpers.js";

const EPOCH = Date.UTC(2024, 0, 1, 0, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

function options(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return {
    url: "https://www.loc.gov/books/?q=test",
    userAgent: "test-agent",
    timeoutMs: 5000,
    maxRetries: 3,
    limiter: new RateLimiter({ intervalMs: 6000 }),
    logger: silentLogger,
    fetchImpl,
    ...overrides,
  };
}

describe("reading a Retry-After header", () => {
  it("reads a number of seconds", () => {
    expect(parseRetryAfter("30")).toBe(30_000);
  });

  it("reads a date as the wait it implies", () => {
    expect(parseRetryAfter(new Date(EPOCH + 45_000).toUTCString(), EPOCH)).toBe(45_000);
  });

  it("reads a date already past as no wait at all", () => {
    expect(parseRetryAfter(new Date(EPOCH - 45_000).toUTCString(), EPOCH)).toBe(0);
  });

  it("returns nothing when the header says neither", () => {
    expect(parseRetryAfter("soon")).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });
});

describe("one request", () => {
  it("names this server and a contact address to the site", async () => {
    const calls: Array<Parameters<typeof fetch>[1]> = [];
    const fetchImpl = (async (_url: string, init: Parameters<typeof fetch>[1]) => {
      calls.push(init);
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;

    await settle(fetchText(options(fetchImpl)), 60_000);

    expect((calls[0]?.headers as Record<string, string> | undefined)?.["user-agent"]).toBe(
      "test-agent",
    );
  });

  it("reports a refusal to run the request as the caller's to fix", async () => {
    const { fetchImpl } = scriptedFetch([() => new Response("no", { status: 400 })]);
    const outcome = await captureAsync(() => settle(fetchText(options(fetchImpl)), 60_000));

    expect((outcome.error as LocError).code).toBe("invalid_input");
  });

  it("reports an address the site holds nothing at as an absence", async () => {
    const { fetchImpl, count } = scriptedFetch([() => new Response("no", { status: 404 })]);
    const outcome = await captureAsync(() => settle(fetchText(options(fetchImpl)), 60_000));

    expect((outcome.error as LocError).code).toBe("not_found");
    // A settled question is not asked again.
    expect(count()).toBe(1);
  });

  it("reports push-back as push-back rather than as an absence", async () => {
    const { fetchImpl } = scriptedFetch([
      () => new Response("slow down", { status: 429, headers: { "retry-after": "1" } }),
    ]);
    const outcome = await captureAsync(() =>
      settle(fetchText(options(fetchImpl, { maxRetries: 0 })), 120_000),
    );

    expect((outcome.error as LocError).code).toBe("rate_limited");
    expect((outcome.error as LocError).details.hint).toContain(
      "says nothing about whether the Library holds what you asked for",
    );
  });

  it("reports a wait too long to take rather than sleeping through it", async () => {
    const { fetchImpl, count } = scriptedFetch([
      () => new Response("later", { status: 429, headers: { "retry-after": "3600" } }),
    ]);
    const outcome = await captureAsync(() => settle(fetchText(options(fetchImpl)), 120_000));

    expect((outcome.error as LocError).code).toBe("rate_limited");
    expect((outcome.error as LocError).message).toContain("3600 seconds");
    expect(count()).toBe(1);
  });

  it("waits exactly as long as it was asked to before trying again", async () => {
    const { fetchImpl, at } = scriptedFetch([
      () => new Response("slow", { status: 429, headers: { "retry-after": "10" } }),
      () => jsonResponse({ ok: true }),
    ]);
    await settle(fetchText(options(fetchImpl)), 120_000);

    // The first attempt starts at once. The second waits the ten seconds asked
    // for, and those ten count toward the spacing the limiter owes, which has
    // doubled under push-back: the attempt lands one whole interval later.
    expect(at[0]).toBe(EPOCH);
    expect(at[1]).toBe(EPOCH + 12_000);
  });

  it("tries again after a transient failure and returns the answer", async () => {
    const { fetchImpl, count } = scriptedFetch([
      () => new Response("busy", { status: 503, headers: { "retry-after": "1" } }),
      () => jsonResponse({ ok: true }),
    ]);
    const answer = await settle(fetchText(options(fetchImpl)), 120_000);

    expect(answer.payload).toBe('{"ok":true}');
    expect(count()).toBe(2);
  });

  it("reads an answer the site allows to be kept as one the site stands behind", async () => {
    const { fetchImpl } = scriptedFetch([
      () =>
        jsonResponse({ ok: true }, { headers: { "cache-control": "no-transform, max-age=86400" } }),
    ]);
    const answer = await settle(fetchJson(options(fetchImpl)), 60_000);

    expect(answer.settled).toBe(true);
  });

  it("takes an answer the site refuses to have kept as one it does not stand behind", async () => {
    const { fetchImpl } = scriptedFetch([
      () =>
        jsonResponse(
          { ok: true },
          { headers: { "cache-control": "no-transform, no-cache, max-age=0" } },
        ),
    ]);
    const answer = await settle(fetchJson(options(fetchImpl)), 60_000);

    expect(answer.settled).toBe(false);
  });

  it("reads an answer saying nothing about keeping it as one the site stands behind", async () => {
    const { fetchImpl } = scriptedFetch([() => jsonResponse({ ok: true })]);
    const answer = await settle(fetchJson(options(fetchImpl)), 60_000);

    expect(answer.settled).toBe(true);
  });

  it("gives up on a request that never answers rather than holding the slot", async () => {
    const outcome = await captureAsync(() => settle(fetchText(options(hangingFetch())), 300_000));

    expect((outcome.error as LocError).code).toBe("timeout");
  });

  it("reports an answer that is not JSON as unreadable rather than as empty", async () => {
    const { fetchImpl } = scriptedFetch([
      () => new Response("<html>maintenance</html>", { status: 200 }),
    ]);
    const outcome = await captureAsync(() => settle(fetchJson(options(fetchImpl)), 60_000));

    expect((outcome.error as LocError).code).toBe("parse_failure");
  });

  it("reports an answer cut off in transit as unreadable", async () => {
    const { fetchImpl } = scriptedFetch([
      () => new Response('{"results": [{"title": "cut', { status: 200 }),
    ]);
    const outcome = await captureAsync(() => settle(fetchJson(options(fetchImpl)), 60_000));

    expect((outcome.error as LocError).code).toBe("parse_failure");
  });
});
