/**
 * list_collections: what the Library has gathered and named.
 *
 * A collection is the unit a curator built: a body of material chosen and
 * described together. Listing them is how a caller finds a corpus worth
 * searching without having guessed a query first, and each row carries the
 * exact wording search_items takes as its 'collection' filter.
 */

import { z } from "zod";
import type { LocClient } from "../loc/client.js";
import { strictInput } from "./arguments.js";
import { ok, toToolError, truncate } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const listCollectionsDescription = [
  "List the digital collections of the Library of Congress: bodies of material a curator chose, described and published together.",
  "Use it to see what is there before searching, since a collection names a corpus that a query would have to guess at.",
  "'collection_filter' on each row is the wording search_items takes as its 'collection' argument.",
  "'item_count' is how many records the collection gathers, which is the size of the corpus rather than the number of rows here.",
].join(" ");

export const listCollectionsInput = strictInput({
  limit: z.number().int().min(1).max(50).default(20).describe("Collections to return."),
  page: z.number().int().min(1).max(100).default(1).describe("Which page of collections, from 1."),
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
        .describe("Pass as 'collection' to search_items to keep results within this collection."),
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

export async function runListCollections(
  client: LocClient,
  args: ListCollectionsArgs,
): Promise<ToolResult> {
  try {
    const { data, cached, skipped } = await client.listCollections(args.limit, args.page);
    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");
    if (skipped) {
      notes.push(
        `${skipped} row(s) came back in a shape this server could not read and were left out.`,
      );
    }

    const collections = data.collections.map((collection) => ({
      identifier: collection.identifier,
      title: collection.title,
      // The filter takes the collection as the rows spell it, which is the
      // title in lower case.
      collection_filter: collection.title.toLowerCase(),
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

    const total = data.paging.resultCount;
    if (total > collections.length) {
      notes.push(
        `${total} collections exist and ${collections.length} are shown. Ask for page ${args.page + 1} to continue.`,
      );
    }
    if (collections.length === 0 && total > 0) {
      notes.push(
        `Page ${args.page} is past the last collection. ${total} exist, so ask for a lower page.`,
      );
    }

    const body =
      collections.length === 0
        ? total > 0
          ? `Page ${args.page} is past the last of ${total} collections.`
          : "The Library published no collection here."
        : `${collections.length} of ${total} collections:\n` +
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
