/**
 * Scaffolding for the independent contract suite.
 *
 * Nothing here reads the modules under test. Payloads are built from the shapes
 * described in scripts/build-fixtures.mjs, so a test states what the Library
 * sends rather than what a parser happens to accept. Every clock reading comes
 * from a fake timer pinned to a fixed instant.
 */

import { vi } from "vitest";
import type { Logger } from "../../src/config.js";

/** The instant every suite in this file family runs at. */
export const EPOCH = new Date("2024-01-01T00:00:00.000Z");

export const silent: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * The site's paging block. `of` counts results and `total` counts pages, which
 * is the pair an answer must never confuse.
 */
export function paging(resultCount: number, perPage: number, current = 1) {
  return {
    current,
    from: (current - 1) * perPage + 1,
    of: resultCount,
    perpage: perPage,
    results: `${(current - 1) * perPage + 1} - ${current * perPage}`,
    to: current * perPage,
    total: Math.ceil(resultCount / perPage),
    page_list: [{ number: 1, url: null }],
  };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

export interface Recorder {
  fetchImpl: typeof fetch;
  urls: string[];
  headers: Record<string, string>[];
  at: number[];
}

/** A fetch answering every address with the same payload, recording the calls. */
export function recordingFetch(reply: () => Response | Promise<Response>): Recorder {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const at: number[] = [];
  const fetchImpl = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    urls.push(String(input));
    const given = (init?.headers ?? {}) as Record<string, string>;
    headers.push({ ...given });
    at.push(Date.now());
    return reply();
  }) as unknown as typeof fetch;
  return { fetchImpl, urls, headers, at };
}

/** A fetch replaying one answer per attempt, then repeating the last. */
export function scripted(steps: Array<() => Response | Promise<Response>>): Recorder & {
  count: () => number;
} {
  let index = 0;
  const base = recordingFetch(() => {
    const step = steps[Math.min(index, steps.length - 1)];
    index += 1;
    if (!step) {
      throw new Error("scripted ran out of steps");
    }
    return step();
  });
  return { ...base, count: () => index };
}

/**
 * Carries a call to its outcome on the fake clock.
 *
 * The window is wide enough for the pacing floor and every bounded retry, and
 * it is a number of fake milliseconds rather than a tolerance: no wall clock is
 * consulted.
 */
export async function settle<T>(call: Promise<T>): Promise<T> {
  const held = call.then(
    () => undefined,
    () => undefined,
  );
  await vi.advanceTimersByTimeAsync(600_000);
  await held;
  return call;
}

export async function outcome<T>(
  call: Promise<T>,
): Promise<{ threw: boolean; error: unknown; value: T | undefined }> {
  try {
    return { threw: false, error: undefined, value: await settle(call) };
  } catch (error) {
    return { threw: true, error, value: undefined };
  }
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export const CATALOGUE_ROW = {
  id: "http://www.loc.gov/item/glass-orchard-1971/",
  url: "https://www.loc.gov/item/glass-orchard-1971/",
  title: "The Glass Orchard",
  date: "1971-06-04",
  contributor: ["reame, vashti"],
  original_format: ["book"],
  online_format: ["online text"],
  location: ["utah"],
  subject: ["orchards"],
  digitized: true,
};

export function cataloguePayload(rows: unknown[], page = paging(431, 3)): Record<string, unknown> {
  return { pagination: page, results: rows };
}

/** A page whose machine-read text carries the searched words. */
export const PAGE_WITH_WORDS =
  "SALT COUNTY HERALD PAGE FOUR A meeting of the county board was held on Tuesday " +
  "evening at the courthouse where the question of the lamps went out along the " +
  "river road was put to the members at length and referred back to the works " +
  "committee for a report before the winter sets in.";

/** A page whose machine-read text does not, which is the common case. */
export const PAGE_WITHOUT_WORDS =
  "ORCHARD DAILY REVIEW PAGE ONE Notices of sale and of removal are printed below " +
  "together with the arrivals at the hotel and the times of the ferry which runs " +
  "on the hour until dusk throughout the season.";

export function newspaperRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "http://www.loc.gov/resource/sn00000001/1893-11-04/ed-1/?sp=4",
    url: "https://www.loc.gov/resource/sn00000001/1893-11-04/ed-1/?sp=4",
    title: "Image 4 of Salt County Herald (Salt City, Utah), November 4, 1893",
    date: "1893-11-04",
    description: [PAGE_WITH_WORDS],
    number_page: ["0000000004"],
    partof_title: ["salt county herald (salt city, utah) 1881-1922"],
    location_state: ["utah"],
    contributor: ["salt county library"],
    original_format: ["newspaper"],
    ...overrides,
  };
}

export function newspapersPayload(
  rows: unknown[],
  page = paging(4177, 2),
): Record<string, unknown> {
  return { pagination: page, results: rows };
}

export function itemPayload(
  item: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    item: {
      id: "http://www.loc.gov/item/glass-orchard-1971/",
      url: "https://www.loc.gov/item/glass-orchard-1971/",
      title: "The Glass Orchard",
      date: "1971-06-04",
      contributor_names: ["Reame, Vashti, 1912-1988, author"],
      description: ["A field recording made across two winters in the salt country."],
      notes: ["Title devised by Library staff."],
      subjects: [{ orchards: "https://www.loc.gov/example/orchards" }],
      location: ["utah"],
      language: ["english"],
      partof: [{ count: 57, title: "salt country archive", url: "https://www.loc.gov/example" }],
      repository: ["Library of Congress Music Division"],
      call_number: "ML 1234",
      original_format: ["book"],
      ...item,
    },
    ...extra,
  };
}

export function collectionsPayload(
  rows: unknown[],
  page = paging(583, 2),
): Record<string, unknown> {
  return { pagination: page, results: rows };
}

export const COLLECTION_ROW = {
  id: "http://www.loc.gov/collections/salt-country-field-recordings/about-this-collection/",
  url: "https://www.loc.gov/collections/salt-country-field-recordings/",
  title: "Salt Country Field Recordings",
  description: ["Recordings made in the salt country between 1928 and 1954."],
  count: 57,
  items: "https://www.loc.gov/collections/salt-country-field-recordings/",
  subject: ["music"],
  item: { formats: ["audio"] },
};

// ---------------------------------------------------------------------------
// Reading a tool result
// ---------------------------------------------------------------------------

export interface ToolShape {
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function textOf(result: ToolShape): string {
  return result.content.map((part) => part.text).join("\n");
}

export function structured<T = Record<string, unknown>>(result: ToolShape): T {
  if (!result.structuredContent) {
    throw new Error(`no structured content; text was: ${textOf(result)}`);
  }
  return result.structuredContent as T;
}

/** The error code an errored tool result reports, or null when it is not one. */
export function errorCode(result: ToolShape): string | null {
  if (!result.isError) {
    return null;
  }
  const match = /^\[([a-z_]+)]/.exec(textOf(result));
  return match ? (match[1] as string) : null;
}
