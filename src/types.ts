/** The shapes the API layer produces. Nothing here knows about MCP. */

/** A catalogue row, trimmed to what picks one record out of a list. */
export interface RecordSummary {
  /** Opaque, and the string get_item takes. It can carry slashes. */
  identifier: string | null;
  /**
   * True when the row is a collection a curator gathered and named rather than
   * a record of the catalogue that was searched. The item route holds nothing
   * at a collection's address, so such a row carries no identifier.
   */
  isCollection: boolean;
  title: string | null;
  /** Whoever the Library credits: author, photographer, publisher, performer. */
  creator: string | null;
  /** Read off the date the record carries, when that date names a year. */
  year: number | null;
  /** The date exactly as published, which is often a range or a phrase. */
  date: string | null;
  /**
   * The cataloguing code the Library files the row under in place of a date,
   * such as `uuuu` or `18??`. Null wherever the filed value is a date.
   */
  dateCode: string | null;
  /** What the Library calls the physical thing: book, photo, map, newspaper. */
  format: string | null;
  /** Places the record is catalogued under. */
  location: string[];
  subjects: string[];
  /** Whether a digitised copy can be read online. */
  online: boolean;
  sourceUrl: string;
}

/**
 * How many results a query has, and how the site divides them into pages.
 *
 * The two numbers are kept apart on purpose. The site reports the count of
 * results and the count of pages under names that read alike, and reporting the
 * page count as a result count multiplies or divides an answer by the page size.
 */
export interface Paging {
  /** Results matching the query across every page. */
  resultCount: number;
  /** Pages those results are divided into, at the page size in force. */
  pageCount: number | null;
  /** The page this answer came from, as the site numbers them. */
  currentPage: number | null;
  /** Results a page holds, as the site applied it. */
  perPage: number | null;
}

export interface SearchResults {
  paging: Paging;
  records: RecordSummary[];
}

/**
 * One newspaper page whose machine-read text matched.
 *
 * The text a search returns with a page is the opening of what optical
 * recognition read off it, not the whole page, so the words searched for are
 * often further down than the response reaches. `wordsLocated` says which of
 * the two happened, and the excerpts are cut accordingly.
 */
export interface NewspaperHit {
  identifier: string | null;
  title: string | null;
  creator: string | null;
  year: number | null;
  /** The page within the issue, as the Library numbers it. */
  pageNumber: number | null;
  /** Date of the issue, as published: usually YYYY-MM-DD. */
  publishedOn: string | null;
  /** The newspaper itself, with the years it ran. */
  publication: string | null;
  /** The state the paper was published in, as the Library records it. */
  state: string | null;
  /** True when the searched words were found in the text this row carries. */
  wordsLocated: boolean;
  /** Passages of machine-read text, cut to the budget the caller set. */
  excerpts: string[];
  /** Opens the page itself, already at the right leaf with the query applied. */
  sourceUrl: string;
}

export interface NewspaperResults {
  paging: Paging;
  hits: NewspaperHit[];
}

export interface ItemDetail {
  identifier: string;
  title: string | null;
  creator: string | null;
  year: number | null;
  /**
   * The date the catalogue files the record under, cut back to the precision
   * the record's own words support.
   */
  date: string | null;
  /**
   * The cataloguing code the Library files the record under in place of a date,
   * such as `uuuu` or `18??`. Null wherever the filed value is a date.
   */
  dateCode: string | null;
  /** When the record was made or issued, in the record's own words. */
  dateStated: string | null;
  /**
   * True when the record's own words name a span of years, which makes `date`
   * the opening of that span rather than a date the record carries.
   */
  dateIsSpanOpening: boolean;
  format: string | null;
  /** Every paragraph the Library publishes as the description, joined. */
  description: string | null;
  notes: string[];
  subjects: string[];
  location: string[];
  language: string[];
  /** Collections and divisions the record sits in. */
  partOf: string[];
  repository: string | null;
  callNumber: string | null;
  /**
   * What the Library says about reuse. Absent on most records, and silence
   * here is not permission.
   */
  rights: string | null;
  /** Ready-made citations, in the styles the Library publishes. */
  citations: Record<string, string>;
  /** Files that can be downloaded or viewed, one row per served copy. */
  resources: ItemResource[];
  sourceUrl: string;
  /** Every field the Library published for the record, for the caller who wants it. */
  raw: Record<string, unknown> | null;
}

export interface ItemResource {
  caption: string | null;
  /** Number of files behind this copy, when the Library counts them. */
  fileCount: number | null;
  url: string | null;
  imageUrl: string | null;
}

export interface CollectionSummary {
  /** The slug the collection is addressed by, and the string get_item takes. */
  identifier: string | null;
  title: string;
  description: string | null;
  /** Records gathered in the collection, when the Library counts them. */
  itemCount: number | null;
  subjects: string[];
  formats: string[];
  sourceUrl: string;
  /** Lists what the collection holds, one page at a time. */
  itemsUrl: string | null;
}

export interface CollectionResults {
  paging: Paging;
  collections: CollectionSummary[];
}
