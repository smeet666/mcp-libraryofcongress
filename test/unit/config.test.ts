import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_NEWSPAPER_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  MIN_ALLOWED_INTERVAL_MS,
  createLogger,
  loadConfig,
} from "../../src/config.js";
import { LocClient } from "../../src/loc/client.js";
import { REPO_URL } from "../../src/version.js";
import { captureAsync, hangingFetch, settle, silentLogger } from "./helpers.js";

let written: string[] = [];

beforeEach(() => {
  written = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settings", () => {
  it("paces itself at the ceiling the Library publishes", () => {
    expect(loadConfig({}).minIntervalMs).toBe(DEFAULT_INTERVAL_MS);
  });

  it("names itself and a contact address", () => {
    expect(loadConfig({}).userAgent).toBe(DEFAULT_USER_AGENT);
    expect(loadConfig({}).userAgent).toContain(REPO_URL);
  });

  it("keeps the contact address when a caller names themselves", () => {
    const agent = loadConfig({ LOC_USER_AGENT: "Someone/2.0" }).userAgent;

    expect(agent).toContain("Someone/2.0");
    expect(agent).toContain(REPO_URL);
  });

  it("accepts a wider spacing", () => {
    expect(loadConfig({ LOC_MIN_INTERVAL_MS: "20000" }).minIntervalMs).toBe(20_000);
  });

  it("refuses a spacing below the floor, and says so", () => {
    expect(loadConfig({ LOC_MIN_INTERVAL_MS: "10" }).minIntervalMs).toBe(DEFAULT_INTERVAL_MS);
    expect(written.join("")).toContain("LOC_MIN_INTERVAL_MS");
  });

  it("falls back on a value that is not a whole number, and says so", () => {
    expect(loadConfig({ LOC_TIMEOUT_MS: "soon" }).timeoutMs).toBe(30_000);
    expect(written.join("")).toContain("LOC_TIMEOUT_MS");
  });

  it("gives the newspaper corpus a wider deadline than the rest of the site", () => {
    const config = loadConfig({});

    expect(config.newspaperTimeoutMs).toBe(DEFAULT_NEWSPAPER_TIMEOUT_MS);
    expect(config.newspaperTimeoutMs).toBeGreaterThan(config.timeoutMs);
  });

  it("accepts a newspaper deadline of its own", () => {
    expect(loadConfig({ LOC_NEWSPAPER_TIMEOUT_MS: "150000" }).newspaperTimeoutMs).toBe(150_000);
  });

  it("falls back on a newspaper deadline it cannot read, and says so", () => {
    expect(loadConfig({ LOC_NEWSPAPER_TIMEOUT_MS: "later" }).newspaperTimeoutMs).toBe(
      DEFAULT_NEWSPAPER_TIMEOUT_MS,
    );
    expect(written.join("")).toContain("LOC_NEWSPAPER_TIMEOUT_MS");
  });

  it("falls back on an unknown log level, and says so", () => {
    expect(loadConfig({ LOC_LOG_LEVEL: "chatty" }).logLevel).toBe("error");
    expect(written.join("")).toContain("LOC_LOG_LEVEL");
  });

  it("writes diagnostics to stderr rather than to the protocol stream", () => {
    createLogger("debug").debug("hello");

    expect(written.join("")).toContain("hello");
  });

  it("says nothing at all when silenced", () => {
    createLogger("silent").error("boom");

    expect(written.join("")).toBe("");
  });
});

describe("the guarantees a published client keeps", () => {
  it("holds the floor against a configuration object handed in", () => {
    const client = new LocClient({ config: { minIntervalMs: 1 } });

    expect(client.intervalMs).toBe(MIN_ALLOWED_INTERVAL_MS);
  });

  it("holds the floor against a value of the wrong shape", () => {
    const client = new LocClient({ config: { minIntervalMs: "fast" as unknown as number } });

    expect(client.intervalMs).toBe(DEFAULT_INTERVAL_MS);
  });

  it("keeps the contact address when a caller replaces the User-Agent", () => {
    const client = new LocClient({ config: { userAgent: "Anonymous/1.0" } });

    expect(client.userAgent).toContain("Anonymous/1.0");
    expect(client.userAgent).toContain(REPO_URL);
  });

  it("does not repeat itself when handed the User-Agent it already uses", () => {
    const client = new LocClient({ config: { userAgent: DEFAULT_USER_AGENT } });

    expect(client.userAgent).toBe(DEFAULT_USER_AGENT);
  });

  it("keeps the contact address when handed an empty User-Agent", () => {
    const client = new LocClient({ config: { userAgent: "   " } });

    expect(client.userAgent).toBe(DEFAULT_USER_AGENT);
  });

  it("spends the newspaper deadline on the newspaper route and the other on the rest", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2024, 0, 1, 0, 0, 0));
    /** Wider than either deadline, so both calls reach their outcome. */
    const AMPLE_MS = 600_000;
    const build = () =>
      new LocClient({
        config: { timeoutMs: 5000, newspaperTimeoutMs: 45_000, maxRetries: 0, logLevel: "silent" },
        logger: silentLogger,
        fetchImpl: hangingFetch(),
      });

    try {
      const onNewspapers = await captureAsync(() =>
        settle(build().searchNewspapers("lamps", 2, 1, { maxChars: 100, maxCount: 1 }), AMPLE_MS),
      );
      const onItem = await captureAsync(() => settle(build().getItem("never-answers"), AMPLE_MS));

      expect((onNewspapers.error as Error).message).toContain("45000ms");
      expect((onItem.error as Error).message).toContain("5000ms");
    } finally {
      vi.useRealTimers();
    }
  });
});
