/**
 * Settings, read from the environment.
 *
 * A value that cannot be read warns and falls back rather than stopping the
 * server: a typo in one variable should not take away every tool. Warnings go
 * to stderr, because stdout carries the protocol and anything written there
 * corrupts the session.
 */

import { PKG_VERSION, REPO_URL } from "./version.js";

export const LOG_LEVELS = ["silent", "error", "info", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * The Library publishes two ceilings: twenty requests a minute for the JSON
 * responses, and ten a minute across the site as a whole. The lower of the two
 * governs here, which is one request every six seconds.
 *
 * Configuration can slow the server down. It cannot take the spacing below this
 * floor, whether the setting arrives through the environment or through a
 * configuration object handed to the published client.
 */
export const MIN_ALLOWED_INTERVAL_MS = 3000;
/** Beyond this a request would look hung rather than paced. */
export const MAX_ALLOWED_INTERVAL_MS = 60_000;
/** The spacing the published ceiling asks for. */
export const DEFAULT_INTERVAL_MS = 6000;

/**
 * The deadline the full-text newspaper route is given.
 *
 * That route searches the machine-read text of millions of pages, and it answers
 * far more slowly than the catalogue: measured on the live site, a query holding
 * two quoted phrases takes between thirty-two and thirty-seven seconds to come
 * back, and the site's own edge takes up to fifty-six seconds before it gives up
 * and returns a 5xx. A minute and a half clears both, so a slow answer arrives
 * instead of being reported as silence, while a request that truly hangs still
 * releases the single request slot rather than holding it indefinitely.
 */
export const DEFAULT_NEWSPAPER_TIMEOUT_MS = 90_000;

export interface Config {
  userAgent: string;
  minIntervalMs: number;
  timeoutMs: number;
  /** Deadline for the full-text newspaper route, which is the slow one. */
  newspaperTimeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  logLevel: LogLevel;
}

export const DEFAULT_USER_AGENT = `mcp-libraryofcongress/${PKG_VERSION} (+${REPO_URL})`;

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(level: LogLevel): Logger {
  const rank = LOG_LEVELS.indexOf(level);
  const write = (at: LogLevel, message: string) => {
    if (rank === 0 || LOG_LEVELS.indexOf(at) > rank) {
      return;
    }
    process.stderr.write(`[mcp-libraryofcongress] ${at}: ${message}\n`);
  };
  return {
    debug: (m) => write("debug", m),
    info: (m) => write("info", m),
    // A warning goes out at the error level so it survives the default
    // setting: a caller has to know that rows were dropped.
    warn: (m) => write("error", m),
    error: (m) => write("error", m),
  };
}

function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    process.stderr.write(
      `[mcp-libraryofcongress] error: ${name}="${raw}" is not a whole number; using ${fallback}.\n`,
    );
    return fallback;
  }
  if (value < min || value > max) {
    // Clamping silently would let a caller believe a setting took effect when
    // the opposite is true, so the refusal is stated and the default stands.
    process.stderr.write(
      `[mcp-libraryofcongress] error: ${name}=${value} is outside ${min}..${max}; using ${fallback}.\n`,
    );
    return fallback;
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const level = env.LOC_LOG_LEVEL as LogLevel | undefined;
  const logLevel = level && LOG_LEVELS.includes(level) ? level : "error";
  if (level && !LOG_LEVELS.includes(level)) {
    process.stderr.write(
      `[mcp-libraryofcongress] error: LOC_LOG_LEVEL="${level}" is not one of ${LOG_LEVELS.join(", ")}; using error.\n`,
    );
  }

  const custom = env.LOC_USER_AGENT?.trim();

  return {
    // A caller who wants to be recognised may say who they are, and the
    // contact address stays attached: the Library has to be able to reach a
    // human about traffic it did not expect.
    userAgent: custom ? `${custom} ${DEFAULT_USER_AGENT}` : DEFAULT_USER_AGENT,
    minIntervalMs: readInteger(
      env,
      "LOC_MIN_INTERVAL_MS",
      DEFAULT_INTERVAL_MS,
      MIN_ALLOWED_INTERVAL_MS,
      MAX_ALLOWED_INTERVAL_MS,
    ),
    // A catalogue page carries a row for every match on it.
    timeoutMs: readInteger(env, "LOC_TIMEOUT_MS", 30_000, 1000, 120_000),
    newspaperTimeoutMs: readInteger(
      env,
      "LOC_NEWSPAPER_TIMEOUT_MS",
      DEFAULT_NEWSPAPER_TIMEOUT_MS,
      1000,
      300_000,
    ),
    maxRetries: readInteger(env, "LOC_MAX_RETRIES", 3, 0, 8),
    cacheTtlMs: readInteger(env, "LOC_CACHE_TTL_MS", 900_000, 0, 86_400_000),
    cacheMaxEntries: readInteger(env, "LOC_CACHE_MAX_ENTRIES", 200, 1, 5000),
    logLevel,
  };
}
