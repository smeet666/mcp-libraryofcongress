/**
 * search_newspapers: find words printed in the text of digitised newspaper pages.
 *
 * This is the question no catalogue can answer. The corpus holds what optical
 * recognition read off millions of pages of American newspapers, so a match
 * comes back with the paper, the date, the leaf and a block of that text.
 *
 * Two things about that block govern what an answer may claim. The Library
 * sends the opening of a page rather than the whole of it, so the searched
 * words are often below where it stops and the excerpt is then the start of the
 * page: `excerpt_kind` names which of the two a caller is holding, and the
 * label rides on the excerpt in the text block so the two cannot be read alike.
 * And the Library decides what double quotes mean, so a quoted query is matched
 * by its own rule rather than held to the phrase, and the answer says so.
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
import { OCR_CAVEAT, agrees, counted, ok, toToolError, truncate } from "./shared.js";
import type { ToolResult } from "./shared.js";
import { invalidInput } from "../errors.js";

/**
 * Why a page of newspaper matches came back empty.
 *
 * A page past the last one and a corpus matching nothing are different
 * statements about what the Library has digitised.
 */
function nothingOnThisPage(total: number, page: number, query: string): string {
  if (total > 0) {
    return `Page ${page} is past the last of ${counted(total, "newspaper page")} the Library matched for ${query}.`;
  }
  return `Nothing found in the scanned newspapers for ${query}.`;
}

export const searchNewspapersDescription = [
  "Search the text inside digitised American newspaper pages held by the Library of Congress.",
  "This reads what optical recognition took off the scanned pages, so it finds a phrase that appears nowhere in a title or a catalogue record.",
  "Double quotes change how the Library matches the words, and it decides what they mean: a page can come back carrying the words apart or in another order rather than the phrase as written. What the quotes do to the number of matching pages varies from one query to the next, so run the search both ways rather than expecting either form to return more.",
  "'total' counts the pages that match, and they page: ask for page 2, 3 and so on to see beyond the first answer. It is not a count of how many times the words occur.",
  "Each match names the newspaper, the date, the leaf of the issue and the state it was published in, and 'source_url' opens that leaf with the query applied.",
  "'location' keeps to papers published in one state, 'publication' to a single paper, and 'year_from' with 'year_to' to a span of years. A filter matching nothing is dropped and the answer says so.",
  "Every match carries 'excerpt_kind', and the excerpts are labelled with it in the text. A 'passage' is the text around the words that matched. A 'page_opening' is the start of the page, sent because the text the Library returned with the row stops before those words appear, so it does not carry the match and quoting it quotes something else.",
  "Use search_items instead when looking for a work by its title, creator or subject.",
].join(" ");

export const searchNewspapersInput = strictInput({
  query: z
    .string()
    .min(1)
    .max(300)
    .describe(
      "Words or a quoted phrase, such as '\"cure for influenza\"'. The index reads the text off the pages themselves and holds single characters, so a query of one character is a query it answers.",
    ),
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
      excerpt_kind: z
        .enum(["passage", "page_opening"])
        .describe(
          "'passage' means the excerpts are the text around the words that matched, centred on them because they were found in the text returned with this row. 'page_opening' means they are the start of the page, sent because that text stops before the searched words appear, so a page_opening does not carry the match.",
        ),
      excerpts: z
        .array(z.string())
        .describe("Machine-read text off the page, all of the kind 'excerpt_kind' names."),
      source_url: z.string().describe("Opens the leaf itself, with the query applied."),
    }),
  ),
  notes: z.array(z.string()),
});

export type SearchNewspapersArgs = z.infer<typeof searchNewspapersInput>;

/**
 * A query holding at least one quoted run of words.
 *
 * What the Library does inside the quotes is its own: pages come back carrying
 * the words apart, so an answer to a quoted query is qualified rather than
 * presented as pages that printed the phrase. The count it comes back with is
 * qualified with it, because quoting moves that count by an amount no rule
 * predicts: it can divide it by a hundred, leave it where it stood, or raise it
 * above the count the same words unquoted return.
 */
const QUOTED_PHRASE = /"[^"]+"/;

/** The optional narrowing, named as a caller wrote it, for the note. */
function describeNarrowing(args: SearchNewspapersArgs): string[] {
  const written: string[] = [];
  if (args.location) {
    written.push(`location="${args.location}"`);
  }
  if (args.publication) {
    written.push(`publication="${args.publication}"`);
  }
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
      if (value && value.trim() !== "") {
        facets[field] = value;
      }
    };
    put("state", args.location);
    put("publication", args.publication);

    const narrowing = describeNarrowing(args);
    const filters = {
      facets,
      ...(args.year_from === undefined ? {} : { yearFrom: args.year_from }),
      ...(args.year_to === undefined ? {} : { yearTo: args.year_to }),
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
          `The Library matched no page for ${args.query} under ${narrowing.join(", ")}. Those were set aside and the search was asked again without them, so the matches below are unfiltered. The corpus uses its own wording: read 'state' and 'publication' on a match to see the form it expects.`,
        );
        result = wider;
      }
    }

    const { data, cached, skipped } = result;
    if (cached) {
      notes.push("Served from this server's short-lived in-memory cache.");
    }
    if (skipped) {
      notes.push(
        `${counted(skipped, "match", "matches")} came back in a shape this server could not read and ${agrees(skipped, "was", "were")} left out. The count above is what the Library reported.`,
      );
    }

    const hits = data.hits.map((hit) => ({
      identifier: hit.identifier,
      excerpt_kind: hit.wordsLocated ? ("passage" as const) : ("page_opening" as const),
      title: hit.title,
      creator: hit.creator,
      year: hit.year,
      page_number: hit.pageNumber,
      published_on: hit.publishedOn,
      publication: hit.publication,
      state: hit.state,
      excerpts: hit.excerpts.map((excerpt) => truncate(excerpt, args.max_excerpt_chars + 2)),
      source_url: hit.sourceUrl,
    }));

    const total = data.paging.resultCount;
    if (hits.length > 0) {
      notes.push(OCR_CAVEAT);
    }

    const openings = hits.filter(
      (hit) => hit.excerpt_kind === "page_opening" && hit.excerpts.length > 0,
    ).length;
    if (openings > 0) {
      notes.push(
        `On ${openings} of ${counted(hits.length, "match", "matches")} the searched words sit further down the page than the text returned with the row, so ${agrees(openings, "that excerpt is the opening of its page", "those excerpts are the opening of their page")} rather than the passage that matched. ${agrees(openings, "It carries", "Each carries")} excerpt_kind "page_opening", and in the text block ${agrees(openings, "it is", "each one is")} prefixed [page opening]; the excerpts in the structured answer are the machine-read text as it stands, with nothing added to them. Quoting ${agrees(openings, "it", "one of them")} quotes something else: follow source_url, which opens the leaf with the query applied.`,
      );
    }

    if (hits.length > 0 && QUOTED_PHRASE.test(args.query)) {
      notes.push(
        "The query carries double quotes. The Library decides what they mean, and it does not guarantee that a matched page carries the words together in that order, so a match can be a page where they sit apart. Read the page behind source_url before repeating the query as the phrase it printed. The count says nothing about the phrase either: what quoting does to it varies from one query to the next, and the same words unquoted can match fewer pages than the quoted form.",
      );
    }

    if (total > hits.length) {
      notes.push(
        `${counted(total, "page")} match and ${hits.length} ${agrees(hits.length, "is", "are")} shown. Ask for page ${args.page + 1} to continue: these results page, so the answer in hand is not the whole of it.`,
      );
    }
    if (total === 0) {
      notes.push(
        "The Library matched no digitised newspaper page for these words. An unquoted query matches the words separately, which is a different search and worth asking.",
      );
    }
    if (hits.length === 0 && total > 0) {
      notes.push(
        `Page ${args.page} is past the last match. ${counted(total, "page")} match, so ask for a lower page.`,
      );
    }

    const body =
      hits.length === 0
        ? nothingOnThisPage(total, args.page, args.query)
        : `${hits.length} of ${counted(total, "newspaper page")} the Library matched for ${args.query}:\n` +
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
              // The label rides on the excerpt line so a reader who takes one
              // line out of the block takes what that line is with it.
              const label = hit.excerpt_kind === "page_opening" ? "[page opening]" : "[passage]";
              const passages = hit.excerpts.map((excerpt) => `     ${label} ${excerpt}`).join("\n");
              return `${where}\n${passages}\n     ${hit.source_url}`;
            })
            .join("\n");

    return ok({ query: args.query, total, page: args.page, hits, notes }, body, { notes });
  } catch (error) {
    return toToolError(error);
  }
}
