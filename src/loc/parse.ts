/**
 * Turning the Library's answers into the shapes this server publishes.
 *
 * Two rules run through every function here. A response that cannot be read is
 * a `parse_failure`, never an empty result, because a caller cannot tell an
 * empty result from an absence and will report one as the other. And a single
 * unreadable row among many is skipped rather than failing the page it sat in;
 * where a parser is given a counter, the rows it dropped are reported.
 */

import { notFound, parseFailure, rateLimited } from "../errors.js";
import type {
  CollectionResults,
  CollectionSummary,
  ItemDetail,
  ItemResource,
  NewspaperHit,
  NewspaperResults,
  Paging,
  RecordSummary,
  SearchResults,
} from "../types.js";
import { ITEM_FIELD, MOST_SUBJECTS, ROW_FIELD, itemUrl } from "./paths.js";
import { collectionSlugFrom, identifierFrom } from "./urls.js";

const DIGITS_ONLY = /^\d+$/;
const FOUR_DIGITS = /(\d{4})/;
const WORD_SEPARATORS = /[^\p{L}\p{N}'-]+/u;

type Json = Record<string, unknown>;

const asObject = (value: unknown): Json | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : null;

/**
 * Almost every field arrives either as one value or as a list of them,
 * depending on how many the record carries. Both are read the same way.
 */
function asStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() === "" ? [] : [value];
  }
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  }
  return [];
}

const asString = (value: unknown): string | null => asStrings(value)[0] ?? null;

/**
 * Names of things, however the route chose to write them.
 *
 * A search row spells a subject or a collection as a plain string. The item
 * route spells the same thing as an entry pairing that name with a link to it,
 * sometimes under a `title` key and sometimes as the key itself. Reading only
 * strings drops every one of them and publishes an empty list, which reads as a
 * record belonging to nothing.
 */
function asLabels(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [value];
  const labels: string[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      if (entry.trim() !== "") {
        labels.push(entry);
      }
      continue;
    }
    const object = asObject(entry);
    if (!object) {
      continue;
    }
    const titled = asString(object.title);
    if (titled !== null) {
      labels.push(titled);
      continue;
    }
    for (const key of Object.keys(object)) {
      if (key.trim() !== "") {
        labels.push(key);
      }
    }
  }
  return labels;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  if (Array.isArray(value)) {
    return asNumber(value[0]);
  }
  return null;
}

/**
 * A page number arrives as a zero-padded string such as "0000000082". Read as
 * a number it is the leaf of the issue; read as the string it was written in it
 * would be printed to a caller exactly as stored.
 */
function asPageNumber(value: unknown): number | null {
  const text = asString(value);
  if (text === null) {
    return null;
  }
  const digits = text.trim();
  if (!DIGITS_ONLY.test(digits)) {
    return null;
  }
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A year reaches us as "1998", as "1998-04-03" or as a number. Dates outside a
 * plausible range are dropped rather than published: a record with no date
 * carries a placeholder, and read as a year that placeholder sorts ahead of
 * every real one.
 */
const PLAUSIBLE_YEAR = { first: 1000, last: 2200 } as const;

export function asYear(value: unknown): number | null {
  const plausible = (year: number): number | null =>
    Number.isFinite(year) && year >= PLAUSIBLE_YEAR.first && year <= PLAUSIBLE_YEAR.last
      ? Math.trunc(year)
      : null;

  const text = asString(value);
  if (text !== null) {
    const m = FOUR_DIGITS.exec(text);
    if (m) {
      return plausible(Number(m[1]));
    }
  }

  const direct = asNumber(value);
  return direct === null ? null : plausible(direct);
}

/**
 * Reading a record's date against the words the record itself uses.
 *
 * The catalogue files every record under one sortable date and fills the parts
 * the record leaves unsaid: a record whose words say "1925" is filed at
 * 1925-01-01, and a piece of a series is filed at the opening of the span the
 * series covers. Published as it stands, that filled value states a month and a
 * day no record carries. So the filed value is kept whole only where the
 * record's own words name the month it is filed under, and is cut back to the
 * year otherwise: words naming some other month, as a photograph dated "1934
 * May 8." and filed at 1934-01-01 does, support nothing about January. A record
 * that says nothing about its date offers nothing to read the filed value
 * against, and it is published as filed.
 */
const FILED_TO_THE_DAY = /^(\d{4})-(\d{2})-\d{2}$/;
const FILED_TO_THE_MONTH = /^(\d{4})-(\d{2})$/;

/**
 * A filed value standing in for a date the Library has not established.
 *
 * Cataloguing writes an unknown digit as `u` or `?`, so a record whose year is
 * unknown is filed under `uuuu` and one known only to its century under `18??`.
 * Such a value occupies the place every other record fills with a year, and
 * read as a date it is neither a year nor a range.
 */
const CATALOGUING_CODE = /^(?=[0-9u?]*[u?])[0-9u?]{4}$/i;

export const isCataloguingCode = (filed: string): boolean => CATALOGUING_CODE.test(filed.trim());

/** Month numbers, under every name and abbreviation records write them with. */
const MONTH_NUMBER: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const MONTH_WORDS = Object.keys(MONTH_NUMBER).join("|");

/**
 * A month word with a day or a year standing beside it, written either way
 * round: "May 8", "1934 May", "24 Sept. 1998", "October, 1979".
 */
const MONTH_BESIDE_A_NUMBER = new RegExp(
  `\\b(?:(\\d{1,4})\\s*\\.?\\s*(${MONTH_WORDS})\\b|(${MONTH_WORDS})\\b\\.?\\s*,?\\s*(\\d{1,4})\\b)`,
  "gi",
);

/** A year and two digits joined by a hyphen: either a month or a short span. */
const YEAR_AND_TWO_DIGITS = /\b(\d{4})-(\d{2})\b/g;

/** A date written as month, day and year separated by slashes. */
const SLASHED_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;

/**
 * The months a record's own words name, read against the year it is filed
 * under.
 *
 * A month word is also an ordinary word: a sentence opens with "may", a piece
 * of music is a "march" and an office has a "sept." of schools, so a month is
 * read only where a day or a year stands with it. A year and two digits joined
 * by a hyphen name a month of that year only when the year is the one the
 * record is filed under; written of any other year the pair closes a span, as
 * `1908-09` writes 1908 to 1909.
 */
export function monthsNamed(text: string, filedYear: string): Set<number> {
  const months = new Set<number>();

  for (const match of text.matchAll(MONTH_BESIDE_A_NUMBER)) {
    const word = (match[2] ?? match[3] ?? "").toLowerCase();
    const month = MONTH_NUMBER[word];
    if (month !== undefined) {
      months.add(month);
    }
  }
  for (const match of text.matchAll(YEAR_AND_TWO_DIGITS)) {
    if (match[1] === filedYear) {
      months.add(Number(match[2]));
    }
  }
  for (const match of text.matchAll(SLASHED_DATE)) {
    months.add(Number(match[1]));
  }

  return months;
}

/**
 * Ranges of years as a record writes them, each read for the year it opens on.
 *
 * A record can name a date of its own alongside a range covering something
 * else: "photographed 1864, [printed between 1880 and 1889]" states 1864
 * outright and gives 1880 to 1889 for the printing. Taking the earliest year a
 * record mentions as the opening of a range denies the date it states.
 */
const DASH_RANGE = /\b(\d{4})\s*(?:[-–—/]|to|through)\s*\d{4}\b/gi;
const BETWEEN_RANGE = /\bbetween\s+(\d{4})\s+and\s+\d{4}\b/gi;

export function rangeOpenings(text: string): number[] {
  const openings: number[] = [];
  for (const pattern of [DASH_RANGE, BETWEEN_RANGE]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null) {
      openings.push(Number(match[1]));
      match = pattern.exec(text);
    }
  }
  return [...new Set(openings)];
}

export function statedDate(item: Json): string | null {
  const words = asStrings(item[ITEM_FIELD.createdPublished])
    .map(plainText)
    .filter((line) => line !== "");
  if (words.length > 0) {
    return words.join("; ");
  }
  const spans = asLabels(item[ITEM_FIELD.dateSpans]);
  return spans.length > 0 ? spans.join("; ") : null;
}

export function datePublished(filed: string | null, stated: string | null): string | null {
  if (filed === null) {
    return null;
  }
  const trimmed = filed.trim();
  if (trimmed === "" || isCataloguingCode(trimmed)) {
    return null;
  }
  const filled = FILED_TO_THE_DAY.exec(trimmed) ?? FILED_TO_THE_MONTH.exec(trimmed);
  if (filled === null || stated === null) {
    return trimmed;
  }

  const year = filled[1] as string;
  const month = Number(filled[2]);
  return monthsNamed(stated, year).has(month) ? trimmed : year;
}

/** The code the Library files a record under in place of a date, or null. */
export function dateCode(filed: string | null): string | null {
  if (filed === null) {
    return null;
  }
  const trimmed = filed.trim();
  return isCataloguingCode(trimmed) ? trimmed : null;
}

/** Titles and captions come through carrying markup and escaped entities. */
export function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The two counts the site reports, kept apart.
 *
 * `of` counts results and `total` counts the pages they are divided into. The
 * names invite the opposite reading, and taking one for the other reports a
 * corpus of four hundred thousand pages as two hundred thousand.
 */
export function toPaging(payload: unknown, url: string, settled = true): Paging {
  const root = asObject(payload);
  const pagination = root ? asObject(root.pagination) : null;
  if (!pagination) {
    throw parseFailure(
      "The answer carried no pagination block, so nothing states how many results match.",
      {
        url,
      },
    );
  }
  const resultCount = asNumber(pagination.of);
  if (resultCount === null) {
    // Returning zero for a count that could not be read publishes an absence
    // the response never established.
    throw parseFailure("The answer carried no readable count of results.", { url });
  }
  if (resultCount === 0 && !settled) {
    // The site renders an empty page while its search is failing, and that page
    // states a count of nothing in the same words a search that matched nothing
    // does. What separates them is that the site withdraws the lifetime it
    // gives an answer it stands behind. Published as a zero, the failing one
    // says the Library holds nothing.
    throw rateLimited(
      "The Library of Congress answered with no results and asked that the answer not be kept, which is how the site answers while its search is failing.",
      { url },
    );
  }
  return {
    resultCount,
    pageCount: asNumber(pagination.total),
    currentPage: asNumber(pagination.current),
    perPage: asNumber(pagination.perpage),
  };
}

function rowsOf(payload: unknown, url: string): Json[] {
  const root = asObject(payload);
  if (!(root && Array.isArray(root.results))) {
    throw parseFailure("The answer carried its rows in a shape this server cannot read.", { url });
  }
  return root.results.map(asObject).filter((r): r is Json => r !== null);
}

/** Whoever the Library credits, joined as one line. */
const creatorOf = (row: Json): string | null =>
  asStrings(row[ROW_FIELD.contributor]).map(plainText).join(", ") || null;

/** The public address of a row, absolute and https, whatever shape it arrived in. */
function sourceUrlOf(row: Json, identifier: string | null): string {
  const raw = asString(row[ROW_FIELD.url]) ?? asString(row[ROW_FIELD.id]);
  if (raw) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("//")) {
      return `https:${trimmed}`;
    }
    if (trimmed.startsWith("http://")) {
      return `https://${trimmed.slice("http://".length)}`;
    }
    if (trimmed.startsWith("https://")) {
      return trimmed;
    }
  }
  return identifier === null ? "" : itemUrl(identifier);
}

/**
 * A search row's own words about its date, which the route spreads over two
 * places: the record block nested in the row writes them out, and the row
 * itself lists the years the index files it under. Both are read, because a
 * record block filled with a place of publication says nothing about a date
 * while the listed years still name the month a record carries.
 */
function statedDateOfRow(row: Json): string | null {
  const inner = asObject(row[ROW_FIELD.item]);
  const words =
    inner === null
      ? []
      : asStrings(inner[ITEM_FIELD.createdPublished])
          .map(plainText)
          .filter((line) => line !== "");
  const spans = asLabels(row[ROW_FIELD.dateSpans]);
  const both = [...words, ...spans];
  return both.length > 0 ? both.join("; ") : null;
}

export function toSearchResults(
  payload: unknown,
  url: string,
  onSkip: (n: number) => void,
  settled = true,
): SearchResults {
  const rows = rowsOf(payload, url);
  const records: RecordSummary[] = [];
  let skipped = 0;

  for (const row of rows) {
    const title = asString(row[ROW_FIELD.title]);
    const identifier = identifierFrom(asString(row[ROW_FIELD.url]) ?? asString(row[ROW_FIELD.id]));
    const source = sourceUrlOf(row, identifier);
    // A row with neither a title nor an address cannot be shown or followed.
    if (title === null && source === "") {
      skipped += 1;
      continue;
    }
    // The catalogue files every row under one sortable date and fills the parts
    // the record leaves unsaid, so the filed value is cut back to the precision
    // the row's own words support.
    const filed = asString(row[ROW_FIELD.date]);
    const date = datePublished(filed, statedDateOfRow(row));
    records.push({
      identifier,
      // A row addressed under the collections route is a corpus a curator built
      // and named, which the item route holds nothing for.
      isCollection:
        collectionSlugFrom(asString(row[ROW_FIELD.url]) ?? asString(row[ROW_FIELD.id])) !== null,
      title: title === null ? null : plainText(title),
      creator: creatorOf(row),
      year: asYear(date),
      date,
      dateCode: dateCode(filed),
      format: asString(row[ROW_FIELD.originalFormat]),
      location: asStrings(row[ROW_FIELD.location]),
      subjects: asStrings(row[ROW_FIELD.subject]).slice(0, MOST_SUBJECTS),
      online: row[ROW_FIELD.digitized] === true,
      sourceUrl: source,
    });
  }

  if (skipped > 0) {
    onSkip(skipped);
  }
  if (rows.length > 0 && records.length === 0) {
    throw parseFailure(`${rows.length} rows came back and none could be read.`, { url });
  }
  // Paging follows the count the site reported, not the count that survived
  // reading: a shortened page reads as the end of the results.
  return { paging: toPaging(payload, url, settled), records };
}

/**
 * Words a search is looking for, as an excerpt has to find them.
 *
 * A quoted phrase is kept whole, because that is what the caller asked to see
 * together. Very short words and the commonest joining words are set aside:
 * they occur on every line of every page, and centring a passage on one of them
 * shows a caller nothing.
 */
const JOINING_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "was",
  "were",
  "are",
  "his",
  "her",
  "its",
  "not",
  "but",
  "had",
  "has",
  "you",
  "all",
  "any",
  "who",
]);

export function queryTerms(query: string): string[] {
  const terms: string[] = [];
  const phrases = query.match(/"([^"]+)"/g) ?? [];
  for (const phrase of phrases) {
    const inner = phrase.slice(1, -1).trim().toLowerCase();
    if (inner !== "") {
      terms.push(inner);
    }
  }

  const rest = query.replace(/"[^"]*"/g, " ");
  for (const word of rest.split(WORD_SEPARATORS)) {
    const lower = word.trim().toLowerCase();
    if (lower.length < 3 || JOINING_WORDS.has(lower)) {
      continue;
    }
    terms.push(lower);
  }

  return [...new Set(terms)];
}

export interface ExcerptBudget {
  /** Characters one passage may run to. */
  maxChars: number;
  /** Passages kept for one page. */
  maxCount: number;
}

export interface Excerpts {
  passages: string[];
  /** True when a searched word was found in the text this row carries. */
  located: boolean;
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * A term as machine-read text has to carry it: a whole word, in any case, with
 * punctuation allowed to sit against either end.
 *
 * A run of letters found anywhere inside a longer word is a different word.
 * `art` sits inside "particular", "impartially" and "parts", and `cat` sits
 * inside "Cattle"; a page matched on one of those carries none of the words a
 * caller searched for, and an excerpt built around it reads as the sentence
 * they asked to see. Optical recognition also glues punctuation to words and
 * varies the case at will, so the boundary is drawn at letters and digits
 * rather than at spaces.
 */
function wholeWord(term: string): RegExp {
  const escaped = term.replace(REGEX_SPECIALS, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
}

/** Widen a cut to the nearest space, so a passage opens and closes on a word. */
function toWordBoundary(text: string, index: number, direction: -1 | 1): number {
  const limit = direction === -1 ? 0 : text.length;
  let at = index;
  for (let step = 0; step < 30 && at !== limit; step += 1) {
    if (text[at] === " ") {
      return at;
    }
    at += direction;
  }
  return index;
}

/**
 * Passages of a page's machine-read text, centred on the words searched for.
 *
 * When none of those words appears, the opening of the text is returned and
 * `located` is false. That distinction is the whole point of this function: the
 * text a search returns with a page is its opening rather than the whole of it,
 * so a passage that does not carry the words is the start of the page and not
 * the place the Library matched.
 */
export function excerptsFor(text: string, terms: string[], budget: ExcerptBudget): Excerpts {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean === "") {
    return { passages: [], located: false };
  }

  const found: Array<{ at: number; length: number }> = [];
  for (const term of terms) {
    const pattern = wholeWord(term);
    let match = pattern.exec(clean);
    while (match !== null) {
      found.push({ at: match.index, length: match[0].length });
      // A term that can match nothing would otherwise hold the cursor still.
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
      }
      match = pattern.exec(clean);
    }
  }

  if (found.length === 0) {
    const opening = clean.slice(0, budget.maxChars);
    const cut = opening.length < clean.length;
    return {
      passages: [cut ? `${opening.trimEnd()}…` : opening],
      located: false,
    };
  }

  found.sort((a, b) => a.at - b.at);
  const windows: Array<{ start: number; end: number }> = [];
  for (const hit of found) {
    const half = Math.max(0, Math.floor((budget.maxChars - hit.length) / 2));
    const start = toWordBoundary(clean, Math.max(0, hit.at - half), -1);
    const end = toWordBoundary(clean, Math.min(clean.length, hit.at + hit.length + half), 1);
    const previous = windows.at(-1);
    if (previous && start <= previous.end) {
      // Two matches close together belong in one passage rather than in two
      // that repeat most of the same words.
      previous.end = Math.max(previous.end, end);
      continue;
    }
    windows.push({ start, end });
  }

  const passages = windows.slice(0, budget.maxCount).map(({ start, end }) => {
    const body = clean.slice(start, Math.min(end, start + budget.maxChars)).trim();
    const opensMidway = start > 0;
    const closesEarly = Math.min(end, start + budget.maxChars) < clean.length;
    return `${opensMidway ? "…" : ""}${body}${closesEarly ? "…" : ""}`;
  });

  return { passages, located: true };
}

export function toNewspaperResults(
  payload: unknown,
  url: string,
  query: string,
  reading: { budget: ExcerptBudget; onSkip: (n: number) => void; settled?: boolean },
): NewspaperResults {
  const { budget, onSkip, settled = true } = reading;
  const rows = rowsOf(payload, url);
  const terms = queryTerms(query);
  const hits: NewspaperHit[] = [];
  let skipped = 0;

  for (const row of rows) {
    const address = asString(row[ROW_FIELD.url]) ?? asString(row[ROW_FIELD.id]);
    const source = sourceUrlOf(row, identifierFrom(address));
    if (source === "") {
      // Without an address the page cannot be read or cited, and a passage of
      // machine-read text with nothing behind it is not worth publishing.
      skipped += 1;
      continue;
    }

    const pageText = asStrings(row[ROW_FIELD.description]).join(" ");
    const { passages, located } = excerptsFor(pageText, terms, budget);
    const publication = asString(row[ROW_FIELD.publicationTitle]);
    const title = asString(row[ROW_FIELD.title]);

    hits.push({
      identifier: identifierFrom(address),
      title: title === null ? null : plainText(title),
      // A newspaper page is credited to whoever contributed the scan, which is
      // a library rather than a writer.
      creator: creatorOf(row),
      year: asYear(row[ROW_FIELD.date]),
      pageNumber: asPageNumber(row[ROW_FIELD.pageNumber]),
      publishedOn: asString(row[ROW_FIELD.date]),
      publication,
      state: asString(row[ROW_FIELD.state]),
      wordsLocated: located,
      excerpts: passages,
      sourceUrl: source,
    });
  }

  if (skipped > 0) {
    onSkip(skipped);
  }
  if (rows.length > 0 && hits.length === 0) {
    throw parseFailure(`${rows.length} matches came back and none could be read.`, { url });
  }
  return { paging: toPaging(payload, url, settled), hits };
}

function toResources(value: unknown): ItemResource[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const resources: ItemResource[] = [];
  for (const entry of value) {
    const resource = asObject(entry);
    if (!resource) {
      continue;
    }
    const files = resource.files;
    const fileCount = Array.isArray(files)
      ? files.reduce<number>((sum, group) => sum + (Array.isArray(group) ? group.length : 1), 0)
      : asNumber(files);
    resources.push({
      caption: asString(resource.caption),
      fileCount,
      url: asString(resource.url),
      imageUrl: asString(resource.image),
    });
  }
  return resources;
}

function toCitations(value: unknown): Record<string, string> {
  const block = asObject(value);
  if (!block) {
    return {};
  }
  const citations: Record<string, string> = {};
  for (const [style, text] of Object.entries(block)) {
    if (typeof text !== "string" || text.trim() === "") {
      continue;
    }
    citations[style] = plainText(text);
  }
  return citations;
}

export function toItemDetail(payload: unknown, identifier: string, url: string): ItemDetail {
  const root = asObject(payload);
  if (!root) {
    throw parseFailure("The item answer was not an object.", { url });
  }

  // The site states a missing record in the body as well as in the status, and
  // a body saying so has to be read the same way.
  if (asNumber(root.status) === 404) {
    throw notFound(`The Library of Congress has no record called "${identifier}".`, { url });
  }

  const item = asObject(root.item);
  if (!item) {
    throw parseFailure(
      `The record for "${identifier}" came back without the item block this server reads.`,
      { url },
    );
  }
  if (Object.keys(item).length === 0) {
    throw notFound(`The Library of Congress has no record called "${identifier}".`, { url });
  }

  const description = asStrings(item[ITEM_FIELD.description]).map(plainText).join("\n\n");
  const title = asString(item[ITEM_FIELD.title]);
  const source = asString(item[ITEM_FIELD.url]) ?? itemUrl(identifier);

  const stated = statedDate(item);
  const filed = asString(item[ITEM_FIELD.date]);
  const date = datePublished(filed, stated);
  // A record is filed at the start of the period it covers, so the filed year
  // is the opening of a span only when the record's own words write that span
  // out and open it on that year. A year they state on its own is a date of the
  // record, whatever ranges they give beside it.
  const filedYear = asYear(date);
  const filedAtSpanOpening =
    filedYear !== null && stated !== null && rangeOpenings(stated).includes(filedYear);

  return {
    identifier,
    title: title === null ? null : plainText(title),
    creator: asStrings(item[ITEM_FIELD.contributorNames]).map(plainText).join(", ") || null,
    year: asYear(date),
    date,
    dateCode: dateCode(filed),
    dateStated: stated,
    dateIsSpanOpening: filedAtSpanOpening,
    format: asString(item[ITEM_FIELD.originalFormat]),
    description: description === "" ? null : description,
    notes: asStrings(item[ITEM_FIELD.notes]).map(plainText),
    subjects: asLabels(item[ITEM_FIELD.subjects]).slice(0, MOST_SUBJECTS),
    location: asLabels(item[ITEM_FIELD.location]),
    language: asLabels(item[ITEM_FIELD.language]),
    partOf: asLabels(item[ITEM_FIELD.partOf]),
    repository: asStrings(item[ITEM_FIELD.repository]).map(plainText).join(" ") || null,
    callNumber: asString(item[ITEM_FIELD.callNumber]),
    rights: asString(item[ITEM_FIELD.rights]) ?? asString(item[ITEM_FIELD.rightsFallback]),
    citations: toCitations(root.cite_this),
    resources: toResources(root.resources),
    sourceUrl: source.startsWith("//") ? `https:${source}` : source,
    raw: item,
  };
}

export function toCollections(
  payload: unknown,
  url: string,
  onSkip: (n: number) => void,
  settled = true,
): CollectionResults {
  const rows = rowsOf(payload, url);
  const collections: CollectionSummary[] = [];
  let skipped = 0;

  for (const row of rows) {
    const title = asString(row[ROW_FIELD.title]);
    if (title === null) {
      skipped += 1;
      continue;
    }
    const address = asString(row[ROW_FIELD.url]) ?? asString(row[ROW_FIELD.id]);
    const inner = asObject(row.item);
    const description = asStrings(row[ROW_FIELD.description]).map(plainText).join("\n\n");
    collections.push({
      identifier: collectionSlugFrom(address),
      title: plainText(title),
      description: description === "" ? null : description,
      itemCount: asNumber(row[ROW_FIELD.count]),
      subjects: asStrings(row[ROW_FIELD.subject]).slice(0, MOST_SUBJECTS),
      formats: inner ? asStrings(inner.formats) : [],
      sourceUrl: sourceUrlOf(row, null),
      itemsUrl: asString(row[ROW_FIELD.items]),
    });
  }

  if (skipped > 0) {
    onSkip(skipped);
  }
  if (rows.length > 0 && collections.length === 0) {
    throw parseFailure(`${rows.length} collections came back and none could be read.`, { url });
  }
  return { paging: toPaging(payload, url, settled), collections };
}
