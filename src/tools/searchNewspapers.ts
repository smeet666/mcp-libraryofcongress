/**
 * search_newspapers: find a phrase in the text of digitised newspaper pages.
 *
 * This is the question no catalogue can answer. The corpus holds what optical
 * recognition read off millions of pages of American newspapers, so a match
 * comes back with the paper, the date, the leaf and the words around it.
 *
 * The weight of an answer is the reason for the two budget arguments. A page
 * carries a block of machine-read text, and a page of results returns one such
 * block per row, so an answer is bounded before it is built rather than cut
 * after it arrives.
 *
 * The corpus spans every state and a century and a half, so a phrase alone
 * matches far beyond what most questions ask. The narrowing is typed, and only
 * fields the corpus acts on are ever sent. A filter it recognises and that
 * matches nothing is a different matter: the search is asked again without the
 * narrowing, and the answer says what was set aside.
 */

import { z } from "zod";
import type { LocClient } from "../loc/client.js";
import type { FacetField } from "../loc/paths.js";
import type { Facets } from "../loc/urls.js";
import { strictInput } from "./arguments.js";
import { OCR_CAVEAT, ok, toToolError, truncate } from "./shared.js";
import type { ToolResult } from "./shared.js";
import { invalidInput } from "../errors.js";

export const searchNewspapersDescription = [
  "Search the text inside digitised American newspaper pages held by the Library of Congress.",
  "This reads what optical recognition took off the scanned pages, so it finds a phrase that appears nowhere in a title or a catalogue record.",
  "Put a phrase in double quotes to match it whole; without quotes the words are matched separately, which finds far more.",
  "'total' counts the pages that match, and they page: ask for page 2, 3 and so on to see beyond the first answer. It is not a count of how many times the words occur.",
  "Each match names the newspaper, the date, the leaf of the issue and the state it was published in, and 'source_url' opens that leaf with the query applied.",
  "'location' keeps to papers published in one state, 'publication' to a single paper, and 'year_from' with 'year_to' to a span of years. A filter matching nothing is dropped and the answer says so.",
  "The Library returns the opening of a page's text with each row rather than the whole page, so the searched words are often further down than the excerpts reach: 'words_located' says which of the two happened for each match.",
  "Use search_items instead when looking for a work by its title, creator or subject.",
].join(" ");

export const searchNewspapersInput = strictInput({
  query: z
    .string()
    .min(2)
    .max(300)
    .describe("Words or a quoted phrase, such as '\"cure for influenza\"'."),
  location: z
    .string()
    .max(120)
    .optional()
    .describe(
      "The state a paper was published in, written as the Library writes it: 'new york', 'district of columbia'. It is the value 'state' carries on the matches this tool returns.",
    ),
  publication: z
    .string()
    .max(200)
    .optional()
    .describe(
      "One newspaper, named with its town and the years it ran: 'new-york tribune (new york [n.y.]) 1866-1924'. Take the wording from 'publication' on a match here, or from a title in search_items with media_type 'newspapers'.",
    ),
  year_from: z.number().int().min(1000).max(9999).optional().describe("Earliest year, inclusive."),
  year_to: z.number().int().min(1000).max(9999).optional().describe("Latest year, inclusive."),
  limit: z.number().int().min(1).max(25).default(10).describe("Matches to return."),
  page: z.number().int().min(1).max(100).default(1).describe("Which page of matches, from 1."),
  max_excerpt_chars: z
    .number()
    .int()
    .min(80)
    .max(1200)
    .default(300)
    .describe(
      "Budget for one passage. Read it together with 'max_excerpts_per_match': the size of the answer is the product of the two and the number of matches.",
    ),
  max_excerpts_per_match: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3)
    .describe(
      "Passages to keep per match. A page holding the words several times yields several, and the later ones rarely say anything the first did not.",
    ),
});

export const searchNewspapersOutput = z.object({
  query: z.string(),
  total: z
    .number()
    .int()
    .describe(
      "Newspaper pages that match, not the number returned and not a count of occurrences. Raise 'page' to read further into it.",
    ),
  page: z.number().int(),
  hits: z.array(
    z.object({
      identifier: z
        .string()
        .nullable()
        .describe("Pass to get_item for the record of the issue this leaf belongs to."),
      title: z
        .string()
        .nullable()
        .describe("How the Library names the leaf, paper and date included."),
      creator: z.string().nullable().describe("Whoever contributed the scan, which is a library."),
      year: z.number().int().nullable(),
      page_number: z.number().int().nullable().describe("The leaf within the issue."),
      published_on: z.string().nullable().describe("Date of the issue, as published."),
      publication: z.string().nullable().describe("The newspaper, with the years it ran."),
      state: z.string().nullable().describe("Where the paper was published."),
      words_located: z
        .boolean()
        .describe(
          "True when the searched words were found in the text returned with this row, in which case the excerpts are centred on them. False when they sit further down the page than that text reaches, in which case the excerpts are its opening.",
        ),
      excerpts: z.array(z.string()).describe("Passages as a machine read them off the page."),
      source_url: z.string().describe("Opens the leaf itself, with the query applied."),
    }),
  ),
  notes: z.array(z.string()),
});

export type SearchNewspapersArgs = z.infer<typeof searchNewspapersInput>;

/** The optional narrowing, named as a caller wrote it, for the note. */
function describeNarrowing(args: SearchNewspapersArgs): string[] {
  const written: string[] = [];
  if (args.location) written.push(`location="${args.location}"`);
  if (args.publication) written.push(`publication="${args.publication}"`);
  if (args.year_from !== undefined || args.year_to !== undefined) {
    written.push(`years ${args.year_from ?? "any"} to ${args.year_to ?? "any"}`);
  }
  return written;
}

export async function runSearchNewspapers(
  client: LocClient,
  args: SearchNewspapersArgs,
): Promise<ToolResult> {
  try {
    if (
      args.year_from !== undefined &&
      args.year_to !== undefined &&
      args.year_from > args.year_to
    ) {
      return toToolError(
        invalidInput(
          `year_from ${args.year_from} is later than year_to ${args.year_to}, so no page can match.`,
          "Put the earlier year in 'year_from'.",
        ),
      );
    }

    const budget = { maxChars: args.max_excerpt_chars, maxCount: args.max_excerpts_per_match };

    const facets: Facets = {};
    const put = (field: FacetField, value: string | undefined) => {
      if (value && value.trim() !== "") facets[field] = value;
    };
    put("state", args.location);
    put("publication", args.publication);

    const narrowing = describeNarrowing(args);
    const filters = {
      facets,
      ...(args.year_from !== undefined ? { yearFrom: args.year_from } : {}),
      ...(args.year_to !== undefined ? { yearTo: args.year_to } : {}),
    };

    const notes: string[] = [];
    let result = await client.searchNewspapers(args.query, args.limit, args.page, budget, filters);

    // A filter that matches nothing would otherwise be reported as no page in
    // the corpus carrying the words, which is a claim about the corpus rather
    // than about the filter.
    if (result.data.paging.resultCount === 0 && narrowing.length > 0) {
      const wider = await client.searchNewspapers(args.query, args.limit, args.page, budget);
      if (wider.data.paging.resultCount > 0) {
        notes.push(
          `No page carrying ${args.query} matches ${narrowing.join(", ")}. Those were set aside and the search was asked again without them, so the matches below are unfiltered. The corpus uses its own wording: read 'state' and 'publication' on a match to see the form it expects.`,
        );
        result = wider;
      }
    }

    const { data, cached, skipped } = result;
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");
    if (skipped) {
      notes.push(
        `${skipped} match(es) came back in a shape this server could not read and were left out. The count above is what the Library reported.`,
      );
    }

    const hits = data.hits.map((hit) => ({
      identifier: hit.identifier,
      title: hit.title,
      creator: hit.creator,
      year: hit.year,
      page_number: hit.pageNumber,
      published_on: hit.publishedOn,
      publication: hit.publication,
      state: hit.state,
      words_located: hit.wordsLocated,
      excerpts: hit.excerpts.map((excerpt) => truncate(excerpt, args.max_excerpt_chars + 2)),
      source_url: hit.sourceUrl,
    }));

    const total = data.paging.resultCount;
    if (hits.length > 0) notes.push(OCR_CAVEAT);

    const elsewhere = hits.filter((hit) => !hit.words_located).length;
    if (elsewhere > 0) {
      notes.push(
        `On ${elsewhere} of ${hits.length} match(es) the searched words sit further down the page than the text returned with the row, so those excerpts are the opening of the page rather than the passage that matched. Follow source_url, which opens the leaf with the query applied.`,
      );
    }

    if (total > hits.length) {
      notes.push(
        `${total} pages match and ${hits.length} are shown. Ask for page ${args.page + 1} to continue: these results page, so the answer in hand is not the whole of it.`,
      );
    }
    if (total === 0) {
      notes.push(
        "No digitised newspaper page carries these words. An unquoted query matches the words separately, which usually finds more.",
      );
    }
    if (hits.length === 0 && total > 0) {
      notes.push(
        `Page ${args.page} is past the last match. ${total} pages match, so ask for a lower page.`,
      );
    }

    const body =
      hits.length === 0
        ? total > 0
          ? `Page ${args.page} is past the last of ${total} newspaper pages carrying ${args.query}.`
          : `Nothing found in the scanned newspapers for ${args.query}.`
        : `${hits.length} of ${total} newspaper pages carrying ${args.query}:\n` +
          hits
            .map((hit, index) => {
              const where = [
                `${index + 1}. ${hit.publication ?? hit.title ?? "untitled"}`,
                hit.published_on ? `· ${hit.published_on}` : "",
                hit.page_number === null ? "" : `· page ${hit.page_number}`,
                hit.state ? `· ${hit.state}` : "",
              ]
                .filter(Boolean)
                .join(" ");
              const passages = hit.excerpts.map((excerpt) => `     ${excerpt}`).join("\n");
              return `${where}\n${passages}\n     ${hit.source_url}`;
            })
            .join("\n");

    return ok({ query: args.query, total, page: args.page, hits, notes }, body, { notes });
  } catch (error) {
    return toToolError(error);
  }
}
