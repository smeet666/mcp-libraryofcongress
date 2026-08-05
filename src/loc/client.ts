/**
 * The one place that talks to the Library of Congress.
 *
 * It holds a single rate limiter and a single cache, so pacing applies to the
 * server as a whole rather than to whichever tool happens to be running. It
 * imports nothing from the MCP layer and is published on its own, so the same
 * code serves a plain script.
 *
 * Every read fetches, parses and only then stores: a response nobody could
 * parse must not be served back for the rest of the cache's lifetime.
 */

import { invalidInput } from "../errors.js";
import type { Config, Logger } from "../config.js";
import { MIN_ALLOWED_INTERVAL_MS, createLogger, loadConfig } from "../config.js";
import { REPO_URL } from "../version.js";
import type { CollectionResults, ItemDetail, NewspaperResults, SearchResults } from "../types.js";
import { Cache } from "./cache.js";
import { fetchJson } from "./http.js";
import type { ExcerptBudget } from "./parse.js";
import { toCollections, toItemDetail, toNewspaperResults, toSearchResults } from "./parse.js";
import { RateLimiter } from "./rateLimiter.js";
import type { CatalogueQuery, NewspaperFilters } from "./urls.js";
import { catalogueUrl, collectionsUrl, itemDocumentUrl, newspaperPagesUrl } from "./urls.js";

export interface ClientOptions {
  config?: Partial<Config>;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

/** Every read reports whether it went out, so a caller can say what it knows. */
export interface Read<T> {
  data: T;
  cached: boolean;
  /** Rows the site sent that could not be read, which paging still counts. */
  skipped?: number;
}

/**
 * The two things this server owes the Library, applied to whatever it is
 * handed.
 *
 * A configuration object assembled by a caller has not been through
 * `loadConfig`, so it can carry a missing value, a value of the wrong shape, or
 * a User-Agent that names somebody else. Requests stay spaced at the published
 * ceiling, and the address the Library would use to reach a human stays in the
 * User-Agent, whichever of those arrives.
 */
function withGuarantees(config: Config): Config {
  const defaults = loadConfig({});

  /** A setting that is absent or unreadable falls back rather than propagating. */
  const number = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const claimed = typeof config.userAgent === "string" ? config.userAgent.trim() : "";
  const identifier = defaults.userAgent;

  return {
    ...config,
    // A caller may say who they are. Appending rather than replacing means the
    // Library can always tell which software is calling, and reach someone.
    userAgent:
      claimed === "" || claimed.includes(REPO_URL) ? identifier : `${claimed} ${identifier}`,
    minIntervalMs: Math.max(
      MIN_ALLOWED_INTERVAL_MS,
      number(config.minIntervalMs, defaults.minIntervalMs),
    ),
    timeoutMs: number(config.timeoutMs, defaults.timeoutMs),
    newspaperTimeoutMs: number(config.newspaperTimeoutMs, defaults.newspaperTimeoutMs),
    maxRetries: number(config.maxRetries, defaults.maxRetries),
    cacheTtlMs: number(config.cacheTtlMs, defaults.cacheTtlMs),
    cacheMaxEntries: number(config.cacheMaxEntries, defaults.cacheMaxEntries),
  };
}

export class LocClient {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly limiter: RateLimiter;
  private readonly cache: Cache<unknown>;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: ClientOptions = {}) {
    const base = { ...loadConfig(), ...options.config };
    this.config = withGuarantees(base);
    this.logger = options.logger ?? createLogger(this.config.logLevel);
    this.limiter = new RateLimiter({ intervalMs: this.config.minIntervalMs });
    this.cache = new Cache(this.config.cacheTtlMs, this.config.cacheMaxEntries);
    this.fetchImpl = options.fetchImpl;
  }

  /** The pacing in force, which widens when the Library pushes back. */
  get intervalMs(): number {
    return this.limiter.currentIntervalMs;
  }

  /** What the Library sees this client call itself. */
  get userAgent(): string {
    return this.config.userAgent;
  }

  /**
   * `cacheKey` is stated rather than taken from the address, because two reads
   * of one address can produce different values: a passage cut to three hundred
   * characters is not the same value as the same passage cut to a thousand, and
   * serving one for the other would answer a budget the caller never set.
   */
  private async read<T>(
    cacheKey: string,
    url: string,
    parse: (payload: unknown, onSkip: (n: number) => void) => T,
    timeoutMs: number = this.config.timeoutMs,
  ): Promise<Read<T>> {
    const cached = this.cache.get(cacheKey) as T | undefined;
    if (cached !== undefined) {
      this.logger.debug(`cache hit ${cacheKey}`);
      return { data: cached, cached: true };
    }

    let skipped = 0;
    const payload = await this.limiter.schedule(() =>
      fetchJson({
        url,
        userAgent: this.config.userAgent,
        timeoutMs,
        maxRetries: this.config.maxRetries,
        limiter: this.limiter,
        logger: this.logger,
        ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
      }),
    );

    const data = parse(payload, (n) => {
      skipped += n;
      this.logger.warn(`skipped ${n} unreadable row(s) from ${url}`);
    });
    this.cache.set(cacheKey, data);
    return skipped > 0 ? { data, cached: false, skipped } : { data, cached: false };
  }

  searchItems(query: CatalogueQuery): Promise<Read<SearchResults>> {
    const url = catalogueUrl(query);
    return this.read(url, url, (payload, onSkip) => toSearchResults(payload, url, onSkip));
  }

  searchNewspapers(
    query: string,
    limit: number,
    page: number,
    budget: ExcerptBudget,
    filters: NewspaperFilters = {},
  ): Promise<Read<NewspaperResults>> {
    const trimmed = query.trim();
    if (trimmed === "") {
      return Promise.reject(invalidInput("Words to look for are required."));
    }
    const url = newspaperPagesUrl(trimmed, limit, page, filters);
    const key = `${url}#${budget.maxChars}x${budget.maxCount}`;
    return this.read(
      key,
      url,
      (payload, onSkip) => toNewspaperResults(payload, url, trimmed, budget, onSkip),
      // Reading the text of millions of pages takes the site far longer than
      // answering from the catalogue, so this route carries a budget of its own.
      this.config.newspaperTimeoutMs,
    );
  }

  getItem(identifier: string): Promise<Read<ItemDetail>> {
    const trimmed = identifier.trim();
    if (trimmed === "") {
      return Promise.reject(invalidInput("A record identifier is required."));
    }
    const url = itemDocumentUrl(trimmed);
    return this.read(url, url, (payload) => toItemDetail(payload, trimmed, url));
  }

  listCollections(limit: number, page: number): Promise<Read<CollectionResults>> {
    const url = collectionsUrl(limit, page);
    return this.read(url, url, (payload, onSkip) => toCollections(payload, url, onSkip));
  }
}
