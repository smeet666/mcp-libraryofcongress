/**
 * list_collections: what the Library has gathered and named.
 *
 * A collection is the unit a curator built: a body of material chosen and
 * described together. Listing them is how a caller finds a corpus worth
 * searching without having guessed a query first, and each row carries the
 * exact wording search_items takes as its 'collection' filter.
 */

import { z } from "zod";
import type { LocClient, Read } from "../loc/client.js";
import { routesNamedBy } from "../loc/paths.js";
import type { CollectionResults } from "../types.js";
import { strictInput } from "./arguments.js";
import { agrees, counted, ok, toToolError, truncate } from "./shared.js";
import type { ToolResult } from "./shared.js";
import { LocError } from "../errors.js";

/**
 * The highest page this tool will ask for.
 *
 * The corpus runs to hundreds of collections, and at a small `limit` the pages
 * needed to walk it run past this. The answer says how far the ceiling reaches
 * rather than letting a caller discover it by arriving at the end of what they
 * can ask for.
 */
/**
 * Why a page of collections came back empty.
 *
 * Three silences, and they say different things: the page held collections and
 * none of them names a media type, the page is past the last one, or the
 * Library publishes none at all.
 */
function nothingOnThisPage(read: number, total: number, page: number): string {
  if (read > 0) {
    return `None of the ${counted(read, "collection")} on page ${page} publishes a format naming a media_type.`;
  }
  if (total > 0) {
    return `Page ${page} is past the last of ${counted(total, "collection")}.`;
  }
  return "The Library published no collection here.";
}

export const MAX_COLLECTION_PAGE = 100;

export const listCollectionsDescription = [
  "List the digital collections of the Library of Congress: bodies of material a curator chose, described and published together.",
  "Use it to see what is there before searching, since a collection names a corpus that a query would have to guess at.",
  "'collection_filter' on each row is the wording search_items takes as its 'collection' argument, and 'searchable_media_types' names the catalogues that filter can be sent to.",
  "A collection whose 'searchable_media_types' is empty gathers a kind of thing the catalogue search is not divided into, such as web archives; set 'searchable_only' to leave those out.",
  "'item_count' is how many records the collection gathers, which is the size of the corpus rather than the number of rows here.",
].join(" ");

export const listCollectionsInput = strictInput({
  limit: z.number().int().min(1).max(50).default(20).describe("Collections to return."),
  page: z
    .number()
    .int()
    .min(1)
    .max(MAX_COLLECTION_PAGE)
    .default(1)
    .describe("Which page of collections, from 1."),
  searchable_only: z
    .boolean()
    .default(false)
    .describe(
      "Keep only the collections whose formats name a media_type, which are the ones search_items can be asked for.",
    ),
  max_description_chars: z
    .number()
    .int()
    .min(80)
    .max(2000)
    .default(300)
    .describe("Budget for one collection's description."),
});

export const listCollectionsOutput = z.object({
  total: z.number().int().describe("Collections the Library publishes, not the number returned."),
  page: z.number().int(),
  collections: z.array(
    z.object({
      identifier: z.string().nullable().describe("The slug the collection is addressed by."),
      title: z.string(),
      collection_filter: z
        .string()
        .describe(
          "Pass as 'collection' to search_items, together with one of 'searchable_media_types', to keep results within this collection.",
        ),
      searchable_media_types: z
        .array(z.string())
        .describe(
          "The 'media_type' values search_items can be asked with for this collection, read off the formats the Library publishes for it. Empty when none of those formats names a catalogue.",
        ),
      description: z.string().nullable(),
      item_count: z
        .number()
        .int()
        .nullable()
        .describe("Records the collection gathers. Null when the Library states none."),
      subjects: z.array(z.string()),
      formats: z.array(z.string()).describe("Kinds of thing the collection holds."),
      source_url: z.string(),
      items_url: z.string().nullable().describe("Lists what the collection holds, page by page."),
    }),
  ),
  notes: z.array(z.string()),
});

export type ListCollectionsArgs = z.infer<typeof listCollectionsInput>;

/**
 * One read of the collections route, with a page beyond the last read for what
 * it is.
 *
 * The route answers such a page with a 404, which is otherwise reported as the
 * Library holding nothing at the address asked for: a claim about an address on
 * a call that carries none, and about a corpus that exists. The first page is
 * read instead for how many collections there are, and the answer is an empty
 * page of a set that is there to be paged back into.
 */
async function askCollections(
  client: LocClient,
  limit: number,
  page: number,
): Promise<Read<CollectionResults>> {
  try {
    return await client.listCollections(limit, page);
  } catch (error) {
    if (!(error instanceof LocError) || error.code !== "not_found" || page <= 1) {
      throw error;
    }
    const first = await client.listCollections(limit, 1);
    return { data: { paging: first.data.paging, collections: [] }, cached: first.cached };
  }
}

export async function runListCollections(
  client: LocClient,
  args: ListCollectionsArgs,
): Promise<ToolResult> {
  try {
    const { data, cached, skipped } = await askCollections(client, args.limit, args.page);
    const notes: string[] = [];
    if (cached) {
      notes.push("Served from this server's short-lived in-memory cache.");
    }
    if (skipped) {
      notes.push(
        `${counted(skipped, "row")} came back in a shape this server could not read and ${agrees(skipped, "was", "were")} left out.`,
      );
    }

    const read = data.collections.map((collection) => ({
      identifier: collection.identifier,
      title: collection.title,
      // The filter takes the collection as the rows spell it, which is the
      // title in lower case.
      collection_filter: collection.title.toLowerCase(),
      searchable_media_types: routesNamedBy(collection.formats) as string[],
      description:
        collection.description === null
          ? null
          : truncate(collection.description, args.max_description_chars),
      item_count: collection.itemCount,
      subjects: collection.subjects,
      formats: collection.formats,
      source_url: collection.sourceUrl,
      items_url: collection.itemsUrl,
    }));

    const unnamed = read.filter((collection) => collection.searchable_media_types.length === 0);
    const collections = args.searchable_only
      ? read.filter((collection) => collection.searchable_media_types.length > 0)
      : read;

    if (unnamed.length > 0) {
      // The formats are named so a caller can see what kind of thing sits
      // outside the catalogue routes rather than reading the omission as an
      // empty corpus.
      const named = [...new Set(unnamed.flatMap((collection) => collection.formats))];
      const kinds = named.length > 0 ? ` (${named.join(", ")})` : " (the Library publishes none)";
      notes.push(
        args.searchable_only
          ? `${collections.length} of the ${counted(read.length, "collection")} read on this page ${agrees(collections.length, "is", "are")} kept: the other ${unnamed.length} ${agrees(unnamed.length, "publishes", "publish")} formats${kinds} naming no media_type, so no catalogue takes ${agrees(unnamed.length, "its", "their")} 'collection_filter'. 'total' counts the collections the Library publishes, which this filter leaves untouched.`
          : `${unnamed.length} of the ${counted(read.length, "collection")} here ${agrees(unnamed.length, "publishes", "publish")} formats${kinds} naming no media_type, so no catalogue takes ${agrees(unnamed.length, "its", "their")} 'collection_filter'. ${agrees(unnamed.length, "Its", "Their")} 'searchable_media_types' is empty, and 'source_url' is where ${agrees(unnamed.length, "it can", "they can")} be read.`,
      );
    }

    const total = data.paging.resultCount;
    const pageCount = data.paging.pageCount;
    const hasNextPage = pageCount === null ? read.length > 0 : args.page < pageCount;

    if (total > collections.length && hasNextPage) {
      notes.push(
        `${counted(total, "collection")} exist and ${collections.length} ${agrees(collections.length, "is", "are")} shown. Ask for page ${args.page + 1} to continue.`,
      );
    }
    if (read.length > 0 && pageCount !== null && args.page >= pageCount) {
      notes.push(
        `This is the last page of the ${counted(total, "collection")} at this page size: ${counted(pageCount, "page")} of ${args.limit}.`,
      );
    }
    // The pages a caller may ask for stop before the corpus does at a small
    // page size, and the reach of that ceiling is stated rather than met.
    if (pageCount !== null && pageCount > MAX_COLLECTION_PAGE) {
      const reachable = MAX_COLLECTION_PAGE * args.limit;
      notes.push(
        `'page' stops at ${MAX_COLLECTION_PAGE}, so ${reachable} of the ${counted(total, "collection")} can be read at a 'limit' of ${args.limit}. Raise 'limit' to bring the rest within reach.`,
      );
    }
    if (read.length === 0 && total > 0) {
      notes.push(
        `Page ${args.page} is past the last collection. ${total} ${agrees(total, "exists", "exist")}, so ask for a lower page.`,
      );
    }

    const body =
      collections.length === 0
        ? nothingOnThisPage(read.length, total, args.page)
        : `${collections.length} of ${counted(total, "collection")}:\n` +
          collections
            .map((collection, index) => {
              const head = [
                `${index + 1}. ${collection.title}`,
                collection.item_count === null ? "" : `· ${collection.item_count} records`,
                collection.formats.length > 0 ? `· ${collection.formats.join(", ")}` : "",
              ]
                .filter(Boolean)
                .join(" ");
              return `${head}\n   ${collection.source_url}`;
            })
            .join("\n");

    return ok({ total, page: args.page, collections, notes }, body, { notes });
  } catch (error) {
    return toToolError(error);
  }
}
