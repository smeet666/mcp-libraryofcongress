/**
 * Builders for every address the client fetches.
 *
 * Query strings are assembled here so no caller can smuggle a parameter past
 * the checks: which blocks come back, which facet fields may be named and
 * which sort orders exist are decided by this file, not by whoever calls a
 * tool. A facet field or a sort order the site does not know is accepted
 * silently and applied to nothing, so sending only known ones is what keeps a
 * filter from being quietly dropped.
 */

import {
  COLLECTIONS_ROUTE,
  FACET_FIELD,
  FORMAT_ROUTE,
  HOST,
  ITEM_ROUTE,
  NEWSPAPER_PAGES_ROUTE,
  PARAM,
  SORT,
  WANTED_BLOCKS,
  type FacetField,
  type FormatRoute,
  type SortKey,
} from "./paths.js";
import { invalidInput } from "../errors.js";

/**
 * A year the site accepts at either end of a range. An open end is written as
 * the far bound rather than left out, because the parameter takes both.
 */
export const YEAR_BOUND = { earliest: 1000, latest: 9999 } as const;

export type Facets = Partial<Record<FacetField, string>>;

/** The C0 and C1 ranges and the delete character, which no address carries. */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

export interface CatalogueQuery {
  query: string;
  format: FormatRoute;
  facets?: Facets;
  yearFrom?: number;
  yearTo?: number;
  sort?: SortKey;
  /**
   * When false, the search widens past what the Library has digitised and
   * takes in catalogue records with no copy to read online.
   */
  onlineOnly: boolean;
  limit: number;
  page: number;
}

function base(path: string): URL {
  const url = new URL(HOST + path);
  url.searchParams.set(PARAM.format, "json");
  url.searchParams.set(PARAM.attributes, WANTED_BLOCKS);
  return url;
}

/**
 * Facet filters, written as the site writes them: `field:value`, several of
 * them joined by a vertical bar. Fields outside the known set never reach here.
 */
export function facetString(facets: Facets): string {
  return Object.entries(facets)
    .filter(([, value]) => typeof value === "string" && value.trim() !== "")
    .map(([field, value]) => `${FACET_FIELD[field as FacetField]}:${value.trim().toLowerCase()}`)
    .join("|");
}

export function catalogueUrl(q: CatalogueQuery): string {
  const url = base(FORMAT_ROUTE[q.format]);
  url.searchParams.set(PARAM.query, q.query);
  url.searchParams.set(PARAM.perPage, String(q.limit));
  url.searchParams.set(PARAM.page, String(q.page));

  if (q.yearFrom !== undefined || q.yearTo !== undefined) {
    const from = q.yearFrom ?? YEAR_BOUND.earliest;
    const to = q.yearTo ?? YEAR_BOUND.latest;
    url.searchParams.set(PARAM.dates, `${from}/${to}`);
  }

  const facets = facetString(q.facets ?? {});
  if (facets !== "") {
    url.searchParams.set(PARAM.facets, facets);
  }

  const sort = q.sort ? SORT[q.sort] : "";
  if (sort !== "") {
    url.searchParams.set(PARAM.sort, sort);
  }

  // The format routes answer with digitised material by default. Widening is
  // what takes the search into records the Library holds on a shelf alone.
  if (!q.onlineOnly) {
    url.searchParams.set(PARAM.all, "true");
  }

  return url.toString();
}

/**
 * The narrowing a full-text newspaper search may carry.
 *
 * The corpus files a page under the state it was published in and under the
 * paper it belongs to, and both are facets the route acts on.
 */
export interface NewspaperFilters {
  facets?: Facets;
  yearFrom?: number;
  yearTo?: number;
}

export function newspaperPagesUrl(
  query: string,
  limit: number,
  page: number,
  filters: NewspaperFilters = {},
): string {
  const url = base(NEWSPAPER_PAGES_ROUTE);
  url.searchParams.set(PARAM.query, query);
  url.searchParams.set(PARAM.perPage, String(limit));
  url.searchParams.set(PARAM.page, String(page));

  if (filters.yearFrom !== undefined || filters.yearTo !== undefined) {
    const from = filters.yearFrom ?? YEAR_BOUND.earliest;
    const to = filters.yearTo ?? YEAR_BOUND.latest;
    url.searchParams.set(PARAM.dates, `${from}/${to}`);
  }

  const facets = facetString(filters.facets ?? {});
  if (facets !== "") {
    url.searchParams.set(PARAM.facets, facets);
  }

  return url.toString();
}

export function collectionsUrl(limit: number, page: number): string {
  const url = base(COLLECTIONS_ROUTE);
  url.searchParams.set(PARAM.perPage, String(limit));
  url.searchParams.set(PARAM.page, String(page));
  return url.toString();
}

/**
 * One record.
 *
 * An identifier can carry slashes: a newspaper page is addressed by its paper,
 * its date and its edition together. Each segment is encoded on its own so the
 * separators survive while the segments cannot open a path of their own.
 */
export function itemDocumentUrl(identifier: string): string {
  // Percent-encoding carries a control character into the address, where the
  // site answers for an identifier nobody publishes. The refusal names no
  // identifier: the characters at fault are the ones a terminal, a log and a
  // chat window do not draw, so quoting the value back would show a spelling
  // that differs from the one that was sent.
  if (CONTROL_CHARACTER.test(identifier.trim())) {
    throw invalidInput(
      "That identifier carries a control character, and no identifier the Library publishes holds one. It is left unquoted here, since printing it would show a different spelling from the one that was sent.",
      "Take the identifier from a search result rather than building one.",
    );
  }

  const segments = identifier
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter((segment) => segment !== "");

  // Percent-encoding leaves a dot alone, because a dot is legal in a path. A
  // segment made only of dots is then resolved away when the address is parsed,
  // which walks the request out of the item route and can land it on a path the
  // robots file withholds. An identifier that climbs is not an identifier.
  if (segments.some((segment) => /^\.+$/.test(segment))) {
    throw invalidInput(
      `"${identifier}" is not an identifier: it carries a relative path segment.`,
      "Take the identifier from a search result rather than building one.",
    );
  }

  const path = segments.map(encodeURIComponent).join("/");
  const url = new URL(`${HOST}${ITEM_ROUTE}${path}/`);
  url.searchParams.set(PARAM.format, "json");
  return url.toString();
}

/** The path segments of an address the site published, or null. */
function segmentsOf(address: string | null): { host: string; segments: string[] } | null {
  if (!address) {
    return null;
  }
  const trimmed = address.trim();
  if (trimmed === "") {
    return null;
  }

  // Rows carry protocol-relative addresses as often as absolute ones.
  const absolute = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  let parsed: URL;
  try {
    parsed = new URL(absolute);
  } catch {
    return null;
  }

  const path = parsed.pathname.replace(/^\/+|\/+$/g, "");
  if (path === "") {
    return null;
  }
  return { host: parsed.hostname, segments: path.split("/") };
}

/**
 * The identifier inside an address the site published.
 *
 * A record is addressed at `/item/<id>/`, a newspaper page at
 * `/resource/<paper>/<date>/<edition>/`, and a catalogue record with no
 * digitised copy on an LCCN host. Those three name something the item route
 * reads. An address in another shape yields null rather than a guess: a
 * collection has a route of its own and the item route holds nothing at its
 * slug, so carrying that slug as an identifier hands the next call an address
 * the Library answers as missing.
 */
export function identifierFrom(address: string | null): string | null {
  const parsed = segmentsOf(address);
  if (!parsed) {
    return null;
  }
  const { host, segments } = parsed;

  if (host === "lccn.loc.gov") {
    return segments[0] ?? null;
  }

  const first = segments[0];
  if (first === "item" || first === "resource") {
    const rest = segments.slice(1);
    return rest.length > 0 ? rest.join("/") : null;
  }
  return null;
}

/**
 * The slug a collection is addressed by, which is what names it.
 *
 * The address goes on to a page about the collection, and that trailing part is
 * no part of the name.
 */
export function collectionSlugFrom(address: string | null): string | null {
  const parsed = segmentsOf(address);
  if (!parsed) {
    return null;
  }
  return parsed.segments[0] === "collections" ? (parsed.segments[1] ?? null) : null;
}
