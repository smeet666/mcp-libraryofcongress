/**
 * search_items: find things in the catalogue by title, creator or subject.
 *
 * The Library divides what it holds by kind of thing, and each kind is a route
 * of its own, so `media_type` is required rather than optional: there is no
 * address that asks all of them at once.
 *
 * A filter the site does not recognise is neither refused nor applied, so only
 * fields the site acts on are ever sent. A filter it does recognise and that
 * matches nothing is a different matter: the search is asked again without the
 * narrowing, and the answer says what was set aside.
 */

import { z } from "zod";
import { LocError, invalidInput } from "../errors.js";
import type { LocClient, Read } from "../loc/client.js";
import { FORMAT_ROUTES } from "../loc/paths.js";
import type { FacetField } from "../loc/paths.js";
import type { CatalogueQuery, Facets } from "../loc/urls.js";
import type { SearchResults } from "../types.js";
import { strictInput } from "./arguments.js";
import { agrees, counted, ok, recordSchema, renderRecords, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";
/**
 * What the search reached, and what its shape does not say.
 *
 * The Library keeps a separate catalogue per kind of thing, so a search that
 * found nothing has looked in one of them and says nothing about the others. A
 * row can be a record or one of those corpora, and a page past the last one is
 * not an empty catalogue.
 */
function notesOnWhatTheSearchReached(
  data: SearchResults,
  args: SearchItemsArgs,
  items: ReadonlyArray<{
    is_collection: boolean;
    identifier: string | null;
    date_code: string | null;
  }>,
  total: number,
  narrowing: { setAside: boolean; without: string },
): string[] {
  const notes: string[] = [];

  if (total > items.length) {
    notes.push(
      narrowing.setAside
        ? `${counted(total, "record")} match the search${narrowing.without}, and ${items.length} ${agrees(items.length, "is", "are")} shown.`
        : `${counted(total, "record")} match and ${items.length} ${agrees(items.length, "is", "are")} shown.`,
    );
  }

  const gathered = items.filter((item) => item.is_collection).length;
  if (gathered > 0) {
    notes.push(
      `${gathered} of the ${counted(items.length, "row")} shown ${agrees(gathered, "is a collection", "are collections")} the Library gathered and named rather than ${agrees(gathered, "a record", "records")} of the ${args.media_type} catalogue: 'identifier' is null there, get_item has nothing to take, and 'source_url' opens the collection. The count beside the rows is the catalogue's own, and it counts them in.`,
    );
  }

  const anonymous = items.filter((item) => item.identifier === null && !item.is_collection).length;
  if (anonymous > 0) {
    notes.push(
      `${counted(anonymous, "row")} shown ${agrees(anonymous, "names", "name")} an address that is not a record: 'identifier' is null there and get_item has nothing to take, so ${agrees(anonymous, "read it at its", "read them at their")} 'source_url'.`,
    );
  }

  const coded = items.filter((item) => item.date_code !== null);
  if (coded.length > 0) {
    const codes = [...new Set(coded.map((item) => item.date_code))].join(", ");
    notes.push(
      `${counted(coded.length, "row")} shown ${agrees(coded.length, "carries", "carry")} no date: the Library files ${agrees(coded.length, "it", "them")} under a cataloguing code standing for digits it has not established, so 'date' and 'year' are null there while 'date_code' holds the code it filed ${agrees(coded.length, "it", "them")} under: ${codes}.`,
    );
  }
  if (total === 0) {
    notes.push(
      `Nothing in the ${args.media_type} catalogue matches. A search here reads titles and catalogue descriptions only, so a phrase printed inside a newspaper belongs in search_newspapers.`,
    );
  }
  if (items.length === 0 && total > 0) {
    const pages = data.paging.pageCount;
    notes.push(
      `Page ${args.page} is past the last row. ${counted(total, "record")} match${pages === null ? "" : ` across ${counted(pages, "page")} at this page size`}, so ask for a lower page.`,
    );
  }
  if (!narrowing.setAside && (args.year_from !== undefined || args.year_to !== undefined)) {
    notes.push(
      "A record spanning several years matches on any of them, so a row can carry a date outside the range asked for while still belonging to it.",
    );
  }
  if (!args.online_only && items.length > 0) {
    notes.push(
      "This search took in records with no digitised copy. Read 'online' on a row before promising something can be read from a browser.",
    );
  }

  return notes;
}

/**
 * Why a page of records came back empty.
 *
 * A page past the last one and a catalogue holding nothing are different
 * statements about the Library, and a caller acts on them differently.
 */
function nothingOnThisPage(total: number, page: number, mediaType: string, query: string): string {
  if (total > 0) {
    return `Page ${page} is past the last of ${counted(total, "record")} the ${mediaType} catalogue holds for "${query}".`;
  }
  return `Nothing in the ${mediaType} catalogue for "${query}".`;
}

export const searchItemsDescription = [
  "Search the Library of Congress catalogue: books, photographs, maps, recordings, films, manuscripts, sheet music and newspaper titles.",
  "'media_type' is required, because the Library keeps a separate catalogue for each kind of thing.",
  "This matches titles, creators and catalogue descriptions. It does not read the text inside a scan; use search_newspapers for a phrase printed on a newspaper page.",
  "Filters take the words the Library itself uses: 'subject' and 'location' as the rows here spell them, 'language' written in English, 'collection' as list_collections reports it under 'collection_filter'.",
  "A filter matching nothing is set aside and the search asked again without it; the answer names what was dropped, and the count it reports is then the unfiltered search's.",
  "By default only material with a digitised copy is returned; set 'online_only' to false to take in records the Library holds on a shelf alone.",
  "A row carries an 'identifier' get_item takes when it names a record. A row that is a collection the Library gathered names no record: 'is_collection' is true there, 'identifier' is null, and 'source_url' opens the collection.",
].join(" ");

const mediaTypes = FORMAT_ROUTES as [string, ...string[]];

export const searchItemsInput = strictInput({
  query: z
    .string()
    .min(1)
    .max(300)
    .describe(
      "Words to look for in titles, creators and catalogue descriptions. The catalogue index holds no word of a single letter, so at least one word has to run to two letters or more, unless it is written in a script where one character is a word.",
    ),
  media_type: z
    .enum(mediaTypes)
    .describe(
      "Which catalogue to search: books, photos, maps, audio, film-and-videos, manuscripts, notated-music or newspapers. 'newspapers' holds the papers themselves; a phrase printed on a page belongs in search_newspapers.",
    ),
  year_from: z.number().int().min(1000).max(9999).optional().describe("Earliest year, inclusive."),
  year_to: z.number().int().min(1000).max(9999).optional().describe("Latest year, inclusive."),
  subject: z.string().max(120).optional().describe("A subject heading, such as 'crime'."),
  location: z.string().max(120).optional().describe("A place, such as 'oklahoma'."),
  language: z.string().max(120).optional().describe("A language, written in English: 'english'."),
  collection: z
    .string()
    .max(160)
    .optional()
    .describe(
      "A collection, named exactly as list_collections reports it under 'collection_filter'.",
    ),
  online_only: z
    .boolean()
    .default(true)
    .describe("Keep to material with a digitised copy. Set false to include shelf-only records."),
  sort: z
    .enum(["relevance", "newest", "oldest", "title"])
    .default("relevance")
    .describe("Order of the results."),
  limit: z.number().int().min(1).max(50).default(10),
  page: z.number().int().min(1).max(100).default(1),
});

export const searchItemsOutput = z.object({
  query: z.string(),
  total: z
    .number()
    .int()
    .describe(
      "Records matching across this catalogue for the search the rows come from, not the number returned. A filter that matched nothing is set aside, and this then counts the search without it, which the notes name.",
    ),
  page: z.number().int(),
  items: z.array(recordSchema),
  notes: z.array(z.string()),
});

export type SearchItemsArgs = z.infer<typeof searchItemsInput>;

/** The optional narrowing, named as a caller wrote it, for the note. */
function describeNarrowing(args: SearchItemsArgs): string[] {
  const written: string[] = [];
  if (args.subject) {
    written.push(`subject="${args.subject}"`);
  }
  if (args.location) {
    written.push(`location="${args.location}"`);
  }
  if (args.language) {
    written.push(`language="${args.language}"`);
  }
  if (args.collection) {
    written.push(`collection="${args.collection}"`);
  }
  if (args.year_from !== undefined || args.year_to !== undefined) {
    written.push(`years ${args.year_from ?? "any"} to ${args.year_to ?? "any"}`);
  }
  return written;
}

/**
 * Where the Library publishes the wording each filter expects.
 *
 * A filter takes the Library's own words, and each kind of filter has its own
 * place where those words can be read. Sending a caller to a row's fields for a
 * collection or a language sends them where the wording is not.
 */
function whereTheWordingIs(args: SearchItemsArgs): string[] {
  const advice: string[] = [];
  if (args.subject) {
    advice.push("a subject is spelled as 'subjects' spells it on a row");
  }
  if (args.location) {
    advice.push("a place is spelled as 'location' spells it on a row");
  }
  if (args.language) {
    advice.push('a language is written in English, as in "english"');
  }
  if (args.collection) {
    advice.push("a collection is spelled as list_collections reports it under 'collection_filter'");
  }
  return advice;
}

/**
 * A word the catalogue index can be asked for.
 *
 * The index holds no word of a single letter: a query made only of such words
 * comes back with nothing whatever the Library holds, and the same query with
 * one longer word beside them returns exactly what that word returns alone.
 * Answering it with a count of zero would state as a fact about the collection
 * what is a property of the index.
 */
const INDEXED_WORD = /[\p{L}\p{N}]{2,}/u;

/**
 * A script where one character is a word.
 *
 * The index does hold these singly: on the catalogue a Han character alone
 * matches records, and adding one to a two-character query changes the count.
 * Measuring a word in characters refuses a written question in these scripts
 * and calls the refusal a property of the Library.
 */
const ONE_CHARACTER_WORD =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * One catalogue read, with a page beyond the last read for what it is.
 *
 * The catalogue answers such a page with a 404, which is otherwise reported as
 * the Library holding nothing at the address asked for: a claim about an
 * address on a call that carries none, and about a set of records that exists.
 * The first page is read instead for how many records match, and the answer is
 * an empty page of a result set that is there to be paged back into.
 */
async function askCatalogue(
  client: LocClient,
  query: CatalogueQuery,
  page: number,
): Promise<Read<SearchResults>> {
  try {
    return await client.searchItems(query);
  } catch (error) {
    if (!(error instanceof LocError) || error.code !== "not_found" || page <= 1) {
      throw error;
    }
    const first = await client.searchItems({ ...query, page: 1 });
    return { data: { paging: first.data.paging, records: [] }, cached: first.cached };
  }
}

export async function runSearchItems(
  client: LocClient,
  args: SearchItemsArgs,
): Promise<ToolResult> {
  try {
    if (!(INDEXED_WORD.test(args.query) || ONE_CHARACTER_WORD.test(args.query))) {
      return toToolError(
        invalidInput(
          `Every word of "${args.query}" is a single letter, and the catalogue index holds no such word, so this query is one the index cannot be asked.`,
          "Search for a word of at least two characters. A word written as one character, as Han script writes many, is searched as it stands.",
        ),
      );
    }

    if (
      args.year_from !== undefined &&
      args.year_to !== undefined &&
      args.year_from > args.year_to
    ) {
      return toToolError(
        invalidInput(
          `year_from ${args.year_from} is later than year_to ${args.year_to}, so no record can match.`,
          "Put the earlier year in 'year_from'.",
        ),
      );
    }

    const facets: Facets = {};
    const put = (field: FacetField, value: string | undefined) => {
      if (value && value.trim() !== "") {
        facets[field] = value;
      }
    };
    put("subject", args.subject);
    put("location", args.location);
    put("language", args.language);
    put("partof", args.collection);

    const narrowing = describeNarrowing(args);
    const wide = {
      query: args.query,
      format: args.media_type as (typeof FORMAT_ROUTES)[number],
      onlineOnly: args.online_only,
      sort: args.sort,
      limit: args.limit,
      page: args.page,
    };
    const narrowed = {
      ...wide,
      facets,
      ...(args.year_from === undefined ? {} : { yearFrom: args.year_from }),
      ...(args.year_to === undefined ? {} : { yearTo: args.year_to }),
    };

    const notes: string[] = [];
    let result = await askCatalogue(client, narrowed, args.page);
    let narrowingSetAside = false;

    // A filter that matches nothing would otherwise be reported as the Library
    // holding nothing on the subject, which is a claim about the collection
    // rather than about the filter.
    if (result.data.paging.resultCount === 0 && narrowing.length > 0) {
      const wider = await askCatalogue(client, wide, args.page);
      if (wider.data.paging.resultCount > 0) {
        const advice = whereTheWordingIs(args);
        notes.push(
          `Nothing matches "${args.query}" with ${narrowing.join(", ")}: the search as sent matched none. Those were set aside and the search was asked again without them, so the rows below and the count beside them are the unfiltered search's.` +
            (advice.length > 0 ? ` The Library uses its own wording: ${advice.join("; ")}.` : ""),
        );
        result = wider;
        narrowingSetAside = true;
      }
    }

    const { data, cached, skipped } = result;
    if (cached) {
      notes.push("Served from this server's short-lived in-memory cache.");
    }
    if (skipped) {
      notes.push(
        `${counted(skipped, "row")} came back in a shape this server could not read and ${agrees(skipped, "was", "were")} left out.`,
      );
    }

    const items = data.records.map((record) => ({
      identifier: record.identifier,
      is_collection: record.isCollection,
      title: record.title,
      creator: record.creator,
      year: record.year,
      date: record.date,
      date_code: record.dateCode,
      format: record.format,
      location: record.location,
      subjects: record.subjects,
      online: record.online,
      source_url: record.sourceUrl,
    }));

    const total = data.paging.resultCount;
    // Every sentence carrying the count names the search it counts, so the
    // number cannot be read back as the count for the filters that were sent.
    const withoutNarrowing = narrowingSetAside ? ` without ${narrowing.join(", ")}` : "";
    notes.push(
      ...notesOnWhatTheSearchReached(data, args, items, total, {
        setAside: narrowingSetAside,
        without: withoutNarrowing,
      }),
    );

    const body =
      items.length === 0
        ? nothingOnThisPage(total, args.page, args.media_type, args.query)
        : `${items.length} of ${counted(total, "record")} for "${args.query}"${withoutNarrowing}:\n${renderRecords(items)}`;

    return ok({ query: args.query, total, page: args.page, items, notes }, body, { notes });
  } catch (error) {
    return toToolError(error);
  }
}
