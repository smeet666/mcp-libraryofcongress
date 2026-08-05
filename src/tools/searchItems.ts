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
import type { LocClient } from "../loc/client.js";
import { FORMAT_ROUTES } from "../loc/paths.js";
import type { FacetField } from "../loc/paths.js";
import type { Facets } from "../loc/urls.js";
import { ok, recordSchema, renderRecords, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";
import { invalidInput } from "../errors.js";

export const searchItemsDescription = [
  "Search the Library of Congress catalogue: books, photographs, maps, recordings, films, manuscripts, sheet music and newspaper titles.",
  "'media_type' is required, because the Library keeps a separate catalogue for each kind of thing.",
  "This matches titles, creators and catalogue descriptions. It does not read the text inside a scan; use search_newspapers for a phrase printed on a newspaper page.",
  "'subject', 'location', 'language' and 'collection' take the words the Library itself uses, as they appear on the rows this tool returns. A filter matching nothing is dropped and the answer says so.",
  "By default only material with a digitised copy is returned; set 'online_only' to false to take in records the Library holds on a shelf alone.",
  "Every row carries an 'identifier', which get_item takes.",
].join(" ");

const mediaTypes = FORMAT_ROUTES as [string, ...string[]];

export const searchItemsInput = z.object({
  query: z
    .string()
    .min(1)
    .max(300)
    .describe("Words to look for in titles, creators and catalogue descriptions."),
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
    .describe("Records matching across this catalogue, not the number returned."),
  page: z.number().int(),
  items: z.array(recordSchema),
  notes: z.array(z.string()),
});

export type SearchItemsArgs = z.infer<typeof searchItemsInput>;

/** The optional narrowing, named as a caller wrote it, for the note. */
function describeNarrowing(args: SearchItemsArgs): string[] {
  const written: string[] = [];
  if (args.subject) written.push(`subject="${args.subject}"`);
  if (args.location) written.push(`location="${args.location}"`);
  if (args.language) written.push(`language="${args.language}"`);
  if (args.collection) written.push(`collection="${args.collection}"`);
  if (args.year_from !== undefined || args.year_to !== undefined) {
    written.push(`years ${args.year_from ?? "any"} to ${args.year_to ?? "any"}`);
  }
  return written;
}

export async function runSearchItems(
  client: LocClient,
  args: SearchItemsArgs,
): Promise<ToolResult> {
  try {
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
      if (value && value.trim() !== "") facets[field] = value;
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
      ...(args.year_from !== undefined ? { yearFrom: args.year_from } : {}),
      ...(args.year_to !== undefined ? { yearTo: args.year_to } : {}),
    };

    const notes: string[] = [];
    let result = await client.searchItems(narrowed);
    let narrowingSetAside = false;

    // A filter that matches nothing would otherwise be reported as the Library
    // holding nothing on the subject, which is a claim about the collection
    // rather than about the filter.
    if (result.data.paging.resultCount === 0 && narrowing.length > 0) {
      const wider = await client.searchItems(wide);
      if (wider.data.paging.resultCount > 0) {
        notes.push(
          `Nothing matches "${args.query}" with ${narrowing.join(", ")}. Those were set aside and the search was asked again without them, so the rows below are unfiltered. The Library uses its own wording for subjects, places and languages: read 'subjects' and 'location' on a row to see the form it expects.`,
        );
        result = wider;
        narrowingSetAside = true;
      }
    }

    const { data, cached, skipped } = result;
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");
    if (skipped) {
      notes.push(
        `${skipped} row(s) came back in a shape this server could not read and were left out.`,
      );
    }

    const items = data.records.map((record) => ({
      identifier: record.identifier,
      title: record.title,
      creator: record.creator,
      year: record.year,
      date: record.date,
      format: record.format,
      location: record.location,
      subjects: record.subjects,
      online: record.online,
      source_url: record.sourceUrl,
    }));

    const total = data.paging.resultCount;
    if (total > items.length) {
      notes.push(`${total} records match and ${items.length} are shown.`);
    }
    if (total === 0) {
      notes.push(
        `Nothing in the ${args.media_type} catalogue matches. A search here reads titles and catalogue descriptions only, so a phrase printed inside a newspaper belongs in search_newspapers.`,
      );
    }
    if (items.length === 0 && total > 0) {
      const pages = data.paging.pageCount;
      notes.push(
        `Page ${args.page} is past the last row. ${total} records match${pages === null ? "" : ` across ${pages} pages at this page size`}, so ask for a lower page.`,
      );
    }
    if (!narrowingSetAside && (args.year_from !== undefined || args.year_to !== undefined)) {
      notes.push(
        "A record spanning several years matches on any of them, so a row can carry a date outside the range asked for while still belonging to it.",
      );
    }
    if (!args.online_only && items.length > 0) {
      notes.push(
        "This search took in records with no digitised copy. Read 'online' on a row before promising something can be read from a browser.",
      );
    }

    const body =
      items.length === 0
        ? `Nothing in the ${args.media_type} catalogue for "${args.query}".`
        : `${items.length} of ${total} records for "${args.query}":\n${renderRecords(items)}`;

    return ok({ query: args.query, total, page: args.page, items, notes }, body, { notes });
  } catch (error) {
    return toToolError(error);
  }
}
