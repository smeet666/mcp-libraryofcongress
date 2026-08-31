/**
 * What a single read can take, and who has to know it.
 *
 * A read that meets silence or push-back is not one request: it is a series of
 * them, each holding its own deadline, with a wait and a spacing gap in front
 * of it. Anything that puts a deadline on a read from outside, a test runner
 * above all, has to allow for that whole series. Cut it shorter and the read is
 * killed before it can report what happened, which turns a slow night at the
 * Library into a canary that says the contract moved.
 *
 * So the budget is published by the module that spends it, and the tests below
 * hold it to what that module actually takes. The bound is compared against the
 * clock rather than against a number written here: a number written here would
 * be a second opinion, and the two would drift apart.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchText, longestReadMs } from "../../src/loc/http.js";
import { RateLimiter } from "../../src/loc/rateLimiter.js";
import { captureAsync, hangingFetch, settlesAt, silentLogger } from "./helpers.js";

const EPOCH = Date.UTC(2024, 0, 1, 0, 0, 0);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The pacing and patience a read is given, named once for both halves. */
const PATIENCE = { timeoutMs: 5000, maxRetries: 3, intervalMs: 6000 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
  // The backoff carries jitter so several clients do not return in step. Held
  // at its widest, the measurement below is the worst case rather than a draw.
  vi.spyOn(Math, "random").mockReturnValue(0.999);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function options(fetchImpl: typeof fetch, limiter = new RateLimiter({ intervalMs: 6000 })) {
  return {
    url: "https://www.loc.gov/collections/?fo=json",
    userAgent: "test-agent",
    timeoutMs: PATIENCE.timeoutMs,
    maxRetries: PATIENCE.maxRetries,
    limiter,
    logger: silentLogger,
    fetchImpl,
  };
}

/** How long a read took on the fake clock, whatever its outcome. */
async function tookMs(read: Promise<unknown>): Promise<number> {
  const settledAt = settlesAt(read);
  await vi.advanceTimersByTimeAsync(longestReadMs(PATIENCE) * 4);
  return (await settledAt) - EPOCH;
}

describe("the budget a read is given", () => {
  it("covers a route that never answers, deadline after deadline", async () => {
    const read = captureAsync(() => fetchText(options(hangingFetch())));

    expect(
      await tookMs(read),
      "a read killed before it reports leaves the caller with a runner's error rather than the site's",
    ).toBeLessThanOrEqual(longestReadMs(PATIENCE));
  });

  it("covers a route that asks for room on every attempt", async () => {
    const pushingBack = (async () =>
      new Response("slow down", {
        status: 429,
        headers: { "retry-after": "30" },
      })) as unknown as typeof fetch;

    const read = captureAsync(() => fetchText(options(pushingBack)));

    expect(
      await tookMs(read),
      "the wait a refusal asks for is part of the read, and the budget carries it",
    ).toBeLessThanOrEqual(longestReadMs(PATIENCE));
  });

  it("covers a read whose spacing has already widened under push-back", async () => {
    // Push-back doubles the gap up to a ceiling, so a read made after a rough
    // patch waits several times longer before each attempt than a first one.
    const limiter = new RateLimiter({ intervalMs: PATIENCE.intervalMs });
    for (let widened = 0; widened < 10; widened += 1) {
      limiter.pushBack();
    }

    const read = captureAsync(() => fetchText(options(hangingFetch(), limiter)));

    expect(
      await tookMs(read),
      "a budget that assumes the base spacing is short exactly when the site is struggling",
    ).toBeLessThanOrEqual(longestReadMs(PATIENCE));
  });

  it("grows with the deadline the route is given", () => {
    expect(
      longestReadMs({ ...PATIENCE, timeoutMs: PATIENCE.timeoutMs * 4 }),
      "the newspaper corpus is read with a longer deadline, and its budget follows",
    ).toBeGreaterThan(longestReadMs(PATIENCE));
  });
});

describe("the deadline the live suite runs under", () => {
  const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts as Record<
    string,
    string
  >;
  const workflow = readFileSync(join(ROOT, ".github", "workflows", "live-canary.yml"), "utf8");

  /** A setting the canary passes to the client, read from the workflow itself. */
  const canarySetting = (name: string, fallback: number): number => {
    const found = new RegExp(`${name}:\\s*"(\\d+)"`).exec(workflow);
    return found?.[1] === undefined ? fallback : Number(found[1]);
  };

  it("is taken from the module that spends it, rather than written beside it", () => {
    const suite = readFileSync(join(ROOT, "test", "live", "smoke.live.test.ts"), "utf8");

    expect(
      suite,
      "a deadline written as a number beside the suite is a second opinion, and it drifts",
    ).toContain("longestReadMs(");
    expect(
      suite.replace(/\s+/g, " "),
      "the budget governs the suite, so no test can be added without it",
    ).toMatch(/timeout: [A-Z_]+/);
  });

  it("is wide enough for a read made with the settings the canary passes", () => {
    const capped = /--testTimeout=(\d+)/.exec(scripts["test:live"] ?? "");
    if (capped === null) {
      return;
    }

    const budget = longestReadMs({
      timeoutMs: canarySetting("LOC_TIMEOUT_MS", 20_000),
      maxRetries: canarySetting("LOC_MAX_RETRIES", 3),
      intervalMs: canarySetting("LOC_MIN_INTERVAL_MS", 6000),
    });

    expect(
      Number(capped[1]),
      "a runner that gives up first reports a slow night as a broken contract, which is the one thing this canary must never say",
    ).toBeGreaterThanOrEqual(budget);
  });
});
