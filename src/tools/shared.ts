/** Schemas, error mapping and rendering shared by the four tools. */

import { z } from "zod";
import { LocError } from "../errors.js";

/**
 * The text block is what many clients render, and some render nothing else, so
 * it has to answer on its own. This ceiling is what keeps a search of a corpus
 * of millions from arriving as a wall of scanned text.
 */
export const MAX_TEXT_CHARS = 2200;

export const ATTRIBUTION = "Source: Library of Congress";

export interface ToolResult {
  // The SDK's result type carries an index signature for protocol extensions.
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** One catalogue row, carrying what it takes to pick a record out of a list. */
export const recordSchema = z.object({
  identifier: z
    .string()
    .nullable()
    .describe(
      "Pass this to get_item to read the full record. Null when the row names no address a record can be read at.",
    ),
  title: z.string().nullable(),
  creator: z.string().nullable().describe("Whoever the Library credits for the work."),
  year: z.number().int().nullable().describe("Read off 'date' when that date names a year."),
  date: z.string().nullable().describe("The date as published, which is often a range."),
  format: z.string().nullable().describe("What the thing is: book, photo, map, newspaper."),
  location: z.array(z.string()).describe("Places the record is catalogued under."),
  subjects: z.array(z.string()),
  online: z.boolean().describe("Whether a digitised copy can be read online."),
  source_url: z.string().describe("Public page. Show this when citing the record."),
});

/**
 * Keep text from the site out of the shape this server's own lines take.
 *
 * The block ends with lines opening "Note:" and "Source:", and a caller has no
 * way to tell one of those from the same words inside a title, a passage or a
 * description written by whoever published it. Indenting a body line that opens
 * with one of those words keeps the two apart, and costs nothing: the
 * structured output still carries the text exactly as it was published.
 */
export function indentMarkerLines(body: string): string {
  return body.replace(/^(Note:|Source:)/gm, " $1");
}

/**
 * Build a result whose text block ends with its notes and its credit.
 *
 * The body is cut to fit around the trailer rather than the whole block being
 * cut afterwards. Appending the credit and then truncating loses exactly the
 * credit, which is the one line that must survive.
 *
 * Notes qualify an answer: that a list was cut, that a filter was set aside,
 * that scanned text was read by a machine. A client that shows only the text
 * would otherwise present an unqualified answer, so they travel with the
 * credit.
 */
export function ok(
  structured: Record<string, unknown>,
  body: string,
  options: { notes?: string[]; sourceUrl?: string } = {},
): ToolResult {
  const credit = options.sourceUrl ? `${ATTRIBUTION} — ${options.sourceUrl}` : ATTRIBUTION;

  // A long run of notes must not crowd out the answer it qualifies.
  const noteLines = (options.notes ?? []).map((note) => `Note: ${note}`);
  while (noteLines.length > 0 && noteLines.join("\n").length > MAX_TEXT_CHARS / 2) noteLines.pop();
  const trailer = [...noteLines, credit].join("\n");

  const cut = "\n\n[shortened; the full result is in the structured output]";
  const budget = MAX_TEXT_CHARS - `\n\n${trailer}`.length;
  const safe = indentMarkerLines(body);
  const text =
    safe.length <= budget
      ? `${safe}\n\n${trailer}`
      : `${truncate(safe, Math.max(0, budget - cut.length))}${cut}\n\n${trailer}`;

  return { content: [{ type: "text", text }], structuredContent: structured };
}

/**
 * Errors carry no structured payload: the SDK checks it against the tool's
 * declared output schema, and a failure does not fit that shape.
 */
export function toToolError(error: unknown): ToolResult {
  const known =
    error instanceof LocError
      ? error
      : new LocError("network_error", error instanceof Error ? error.message : String(error));

  const lines = [`[${known.code}] ${known.message}`];
  if (known.details.hint) lines.push(`Hint: ${known.details.hint}`);
  return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/**
 * Cut a block of text at a line boundary, so a long description resumes on a
 * sentence rather than mid-word. A single line longer than the budget is cut
 * hard, since there is no boundary to find.
 */
export function sliceAtLineBoundary(
  text: string,
  offset: number,
  maxChars: number,
): { slice: string; nextOffset: number | null } {
  const rest = text.slice(offset);
  if (rest.length <= maxChars) return { slice: rest, nextOffset: null };

  const window = rest.slice(0, maxChars);
  const lastBreak = window.lastIndexOf("\n");
  let cut = lastBreak > 0 ? lastBreak : maxChars;

  // Never cut between the two halves of a surrogate pair: both pages would show
  // a replacement character and no offset could ever reassemble it.
  const code = rest.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;

  return { slice: rest.slice(0, cut), nextOffset: offset + cut };
}

/** A compact listing, carrying what it takes to pick one record out of many. */
export function renderRecords(records: Array<z.infer<typeof recordSchema>>): string {
  return records
    .map((record, index) => {
      const bits = [
        `${index + 1}. ${record.title ?? record.identifier ?? "untitled"}`,
        record.date ? `(${record.date})` : "",
        record.creator ? `· ${record.creator}` : "",
        record.format ? `· ${record.format}` : "",
        record.identifier ? `· id: ${record.identifier}` : "",
      ];
      // The address goes on its own line: a client that renders only text has
      // nothing else to cite from, and a model with an identifier and no link
      // will build one.
      return `${bits.filter(Boolean).join(" ")}\n   ${record.source_url}`;
    })
    .join("\n");
}

/** Wording used wherever machine-read text reaches the caller. */
export const OCR_CAVEAT =
  "Excerpts are the text a machine read off the scanned page, so misreadings are normal and words may be wrong. Quote them as scanned text, and follow source_url to check the page itself.";

/** Wording used wherever a record reaches the caller without stated terms. */
export const RIGHTS_CAVEAT =
  "The Library states no terms of use on this record. Silence is not permission: check the record's page before republishing.";
