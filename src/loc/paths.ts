/**
 * Every host, route, parameter and response field the server reads, in one
 * place. An upstream rename is then a one-file change rather than a hunt
 * through the parsers.
 *
 * The site's own robots file disallows `/search` for every client and asks for
 * five seconds between requests. No address built here reaches that path: the
 * format routes below, the collections route and the item route are what this
 * server calls, and the spacing it keeps is wider than the one asked for. The
 * site returns links into `/search` inside its facet blocks, and those links
 * are read as labels rather than followed.
 */

export const HOST = "https://www.loc.gov";

/**
 * One route per kind of thing, which is how the catalogue is divided.
 *
 * The vocabulary is the Library's own: a route is a path segment, and the
 * values a tool accepts are exactly these keys.
 */
export const FORMAT_ROUTE = {
  books: "/books/",
  photos: "/photos/",
  maps: "/maps/",
  audio: "/audio/",
  "film-and-videos": "/film-and-videos/",
  manuscripts: "/manuscripts/",
  "notated-music": "/notated-music/",
  newspapers: "/newspapers/",
} as const;

export type FormatRoute = keyof typeof FORMAT_ROUTE;

export const FORMAT_ROUTES = Object.keys(FORMAT_ROUTE) as FormatRoute[];

/**
 * The catalogue each word a collection uses for its formats names.
 *
 * A collection states the kinds of thing it gathers in the Library's own
 * words, and the same catalogue is written more than one way among them. A
 * word absent from this table names none of the catalogues the search is
 * divided into, and web archives and periodicals are two such kinds: the
 * Library gathers them and keeps no format route for either.
 */
export const COLLECTION_FORMAT_ROUTE: Record<string, FormatRoute> = {
  ...(Object.fromEntries(FORMAT_ROUTES.map((route) => [route, route])) as Record<
    string,
    FormatRoute
  >),
  photographs: "photos",
  "prints-and-photographs": "photos",
  video: "film-and-videos",
  "film-and-video": "film-and-videos",
  "film-an-videos": "film-and-videos",
};

/**
 * The catalogues a set of collection formats names, in the order the routes are
 * declared so two collections describing the same holdings answer alike.
 */
export function routesNamedBy(formats: readonly string[]): FormatRoute[] {
  const named = new Set<FormatRoute>();
  for (const format of formats) {
    const route = COLLECTION_FORMAT_ROUTE[format.trim().toLowerCase()];
    if (route) {
      named.add(route);
    }
  }
  return FORMAT_ROUTES.filter((route) => named.has(route));
}

/** Digitised newspaper pages, whose text is what search_newspapers reads. */
export const NEWSPAPER_PAGES_ROUTE = "/collections/chronicling-america/";

export const COLLECTIONS_ROUTE = "/collections/";

export const ITEM_ROUTE = "/item/";

export const PARAM = {
  /** Asks for JSON rather than a web page. */
  format: "fo",
  /** The words to look for. */
  query: "q",
  /** Results per page. */
  perPage: "c",
  /** Which page, from 1. */
  page: "sp",
  /** A year range, written from/to. */
  dates: "dates",
  /** Facet filters, several of them separated by a vertical bar. */
  facets: "fa",
  /** Sort order. */
  sort: "sb",
  /** Which top-level blocks to return, which is what keeps a page small. */
  attributes: "at",
  /** Widens a search past what the Library has digitised. */
  all: "all",
} as const;

/**
 * The blocks worth returning.
 *
 * A search answer otherwise carries facet listings, breadcrumbs, featured items
 * and a site manifest, which together run to more than a megabyte on the
 * newspaper corpus while the rows themselves are a few kilobytes.
 */
export const WANTED_BLOCKS = "results,pagination";

/**
 * Facet fields a filter may name, and nothing else.
 *
 * A facet the site does not know is neither refused nor applied: it answers
 * with the unfiltered result and no sign that the narrowing was dropped. Only
 * fields listed here are ever sent, so a filter that reaches the site is one
 * the site acts on.
 */
export const FACET_FIELD = {
  subject: "subject",
  location: "location",
  language: "language",
  contributor: "contributor",
  partof: "partof",
  /** The state a newspaper was published in, as the newspaper corpus files it. */
  state: "location_state",
  /** A newspaper, named with the town and the years it ran. */
  publication: "partof_title",
} as const;

export type FacetField = keyof typeof FACET_FIELD;

/**
 * Sort orders, mapped from the words the tools use.
 *
 * Relevance sends nothing, which is the site's own default.
 */
export const SORT = {
  relevance: "",
  newest: "date_desc",
  oldest: "date",
  title: "title_s",
} as const;

export type SortKey = keyof typeof SORT;

/** Fields read off a result row. */
export const ROW_FIELD = {
  id: "id",
  url: "url",
  title: "title",
  date: "date",
  contributor: "contributor",
  originalFormat: "original_format",
  onlineFormat: "online_format",
  location: "location",
  subject: "subject",
  description: "description",
  partOf: "partof",
  digitized: "digitized",
  /** The record block a search row nests, written the way the item route writes it. */
  item: "item",
  /** The years the index files the row under, one entry per span or year. */
  dateSpans: "dates",
  /** Newspaper pages only, from here down. */
  pageNumber: "number_page",
  publicationTitle: "partof_title",
  state: "location_state",
  /** How many records a collection gathers. */
  count: "count",
  /** Lists what a collection holds. */
  items: "items",
} as const;

/** Fields read off an item document. */
export const ITEM_FIELD = {
  id: "id",
  url: "url",
  title: "title",
  /** One sortable date per record, which the index fills where a record is vague. */
  date: "date",
  /** When the record was made or issued, in the record's own words. */
  createdPublished: "created_published",
  /** The years the index files the record under, one entry per span or year. */
  dateSpans: "dates",
  contributorNames: "contributor_names",
  description: "description",
  notes: "notes",
  subjects: "subjects",
  location: "location",
  language: "language",
  partOf: "partof",
  repository: "repository",
  callNumber: "call_number",
  rights: "rights_advisory",
  rightsFallback: "rights_information",
  originalFormat: "original_format",
} as const;

/** A record spanning many subjects would swamp an answer of ten rows. */
export const MOST_SUBJECTS = 12;

/** Public page for a record, which every result carries so it can be cited. */
export const itemUrl = (identifier: string) =>
  `${HOST}${ITEM_ROUTE}${identifier.split("/").map(encodeURIComponent).join("/")}/`;
