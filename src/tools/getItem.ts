/**
 * get_item: read one catalogue record.
 *
 * A record can carry a description of a line or of many thousands of
 * characters, so the description paginates by character offset and resumes at a
 * line boundary. The rest is opt-in: the served copies of a scan and the full
 * field list are each larger than the record they describe.
 */

import { z } from "zod";
import type { LocClient } from "../loc/client.js";
import { strictInput } from "./arguments.js";
import { RIGHTS_CAVEAT, ok, sliceAtLineBoundary, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";
import type { ItemDetail } from "../types.js";

/**
 * Put the sections a caller asked for into the payload, and say what is empty.
 *
 * A section left out carries no key at all: an empty list is a statement that
 * the Library holds none, and only a section that was asked for can make it.
 */
function attachAskedSections(
  structured: Record<string, unknown>,
  data: ItemDetail,
  wanted: Set<string>,
  notes: string[],
): void {
  if (wanted.has("citations")) {
    structured.citations = data.citations;
    if (Object.keys(data.citations).length === 0) {
      notes.push("The Library publishes no ready-made citation for this record.");
    }
  }
  if (wanted.has("resources")) {
    structured.resources = data.resources.map((resource) => ({
      caption: resource.caption,
      file_count: resource.fileCount,
      url: resource.url,
      image_url: resource.imageUrl,
    }));
    if (data.resources.length === 0) {
      notes.push("The Library serves no copy of this record online.");
    }
  }
  if (wanted.has("full_metadata")) {
    structured.full_metadata = data.raw ?? {};
  }

  // A record covering a span is filed under the first year of that span, so
  // the date beside it is where the catalogue sorts the record rather than
  // when the thing itself was made.
}

/**
 * What the Library's own way of writing a record says about it.
 *
 * A date that opens a span, a date written as a code the catalogue publishes no
 * label for, a record stating no terms of use: each is something a reader takes
 * for more than it is unless the answer says otherwise.
 */
function notesOnWhatTheRecordStates(data: ItemDetail): string[] {
  const notes: string[] = [];

  if (data.dateIsSpanOpening) {
    notes.push(
      `The record states its date as "${data.dateStated}". ${data.date} is the opening of that span and where the Library files the record, and 'year' reads the same value, so neither is a date the record carries.`,
    );
  }

  if (data.dateCode !== null) {
    notes.push(
      `The Library files this record under "${data.dateCode}", a cataloguing code standing for digits it has not established rather than a date, so 'date' and 'year' are null. 'date_stated' repeats what the record itself says about when it was made.`,
    );
  }

  if (!data.rights) {
    notes.push(RIGHTS_CAVEAT);
  }

  return notes;
}

const SECTIONS = ["basic", "citations", "resources", "full_metadata"] as const;

export const getItemDescription = [
  "Read one Library of Congress record by its identifier, as returned by search_items or search_newspapers.",
  "An identifier can carry slashes: a single newspaper issue is named by its paper, its date and its edition together.",
  "Sections are opt-in: 'basic' is the default and covers what a description needs.",
  "'date' carries only the precision the record's own words support, and 'date_stated' repeats those words, which can be a span of years the record was filed at the opening of. Where the Library has established no date it files the record under a cataloguing code, which 'date_code' carries while 'date' and 'year' stay null.",
  "'citations' returns the ready-made citations the Library publishes for the record.",
  "'resources' lists the served copies, such as page images and downloadable files.",
  "'full_metadata' returns every field the Library publishes for the record, which is large and rarely needed.",
  "A long description paginates: when 'next_offset' is not null, call again with 'offset' set to it.",
].join(" ");

export const getItemInput = strictInput({
  identifier: z
    .string()
    .min(1)
    .max(300)
    .describe("Record identifier, such as '2017645459' or 'sn83045462/1929-02-03/ed-1'."),
  sections: z
    .array(z.enum(SECTIONS))
    .default(["basic"])
    .describe("Which parts to return. Each one beyond 'basic' adds to the size of the answer."),
  offset: z.number().int().min(0).default(0).describe("Where to resume the description."),
  max_description_chars: z
    .number()
    .int()
    .min(200)
    .max(20_000)
    .default(2000)
    .describe("Characters of the description to return in one call."),
});

export const getItemOutput = z.object({
  item: z.object({
    identifier: z.string(),
    title: z.string().nullable(),
    creator: z.string().nullable(),
    year: z
      .number()
      .int()
      .nullable()
      .describe("The year of 'date', which a span of years makes the first of the span."),
    date: z
      .string()
      .nullable()
      .describe(
        "The date the Library files the record under, carrying only the precision the record's own words support.",
      ),
    date_code: z
      .string()
      .nullable()
      .describe(
        "The cataloguing code the Library files the record under in place of a date, such as 'uuuu' or '18??'. It stands for digits the Library has not established, so 'date' and 'year' are null beside it. Null wherever the filed value is a date.",
      ),
    date_stated: z
      .string()
      .nullable()
      .describe(
        "When the record was made or issued, in the record's own words, which can be a span of years or a phrase. Null when the record says nothing about it.",
      ),
    format: z.string().nullable(),
    source_url: z.string().describe("Public page. Show this when citing the record."),
  }),
  description: z.string().nullable(),
  offset: z.number().int(),
  next_offset: z
    .number()
    .int()
    .nullable()
    .describe("Pass as 'offset' to read the rest of the description. Null when it ends here."),
  notes_on_record: z
    .array(z.string())
    .describe(
      "Notes the Library published about the record itself, less any whose words the description already carries. The Library assembles the description of some records out of these notes, and those records would otherwise return one text under two names.",
    ),
  subjects: z.array(z.string()),
  location: z.array(z.string()),
  language: z.array(z.string()),
  part_of: z.array(z.string()).describe("Collections and divisions the record sits in."),
  repository: z.string().nullable().describe("Where the original is held."),
  call_number: z.string().nullable(),
  rights: z
    .string()
    .nullable()
    .describe(
      "What the Library says about reuse. Null when it says nothing, which is not permission.",
    ),
  citations: z.record(z.string(), z.string()).optional(),
  resources: z
    .array(
      z.object({
        caption: z.string().nullable(),
        file_count: z.number().int().nullable(),
        url: z.string().nullable(),
        image_url: z.string().nullable(),
      }),
    )
    .optional(),
  full_metadata: z.record(z.string(), z.unknown()).optional(),
  notes: z.array(z.string()),
});

export type GetItemArgs = z.infer<typeof getItemInput>;

export async function runGetItem(client: LocClient, args: GetItemArgs): Promise<ToolResult> {
  try {
    const wanted = new Set(args.sections);
    const { data, cached } = await client.getItem(args.identifier);
    const notes: string[] = [];
    if (cached) {
      notes.push("Served from this server's short-lived in-memory cache.");
    }

    const full = data.description ?? "";

    // The Library assembles the description of some records by running their
    // notes together, so a note whose words the description already carries is
    // the same text under a second name. It is left to the description, where
    // it is published whole and paginates.
    const notesOnRecord = data.notes.filter((note) => !full.includes(note));
    const { slice, nextOffset } = sliceAtLineBoundary(
      full,
      args.offset,
      args.max_description_chars,
    );

    if (nextOffset !== null) {
      notes.push(
        `The description runs to ${full.length} characters. Call again with offset=${nextOffset} for the rest.`,
      );
    }
    if (slice === "" && args.offset > 0 && full.length > 0) {
      notes.push(
        `offset=${args.offset} is past the end of a description of ${full.length} characters. Call again with offset=0 to read it from the start.`,
      );
    }

    const structured: Record<string, unknown> = {
      item: {
        identifier: data.identifier,
        title: data.title,
        creator: data.creator,
        year: data.year,
        date: data.date,
        date_code: data.dateCode,
        date_stated: data.dateStated,
        format: data.format,
        source_url: data.sourceUrl,
      },
      description: slice === "" ? null : slice,
      offset: args.offset,
      next_offset: nextOffset,
      notes_on_record: notesOnRecord,
      subjects: data.subjects,
      location: data.location,
      language: data.language,
      part_of: data.partOf,
      repository: data.repository,
      call_number: data.callNumber,
      rights: data.rights,
      notes,
    };

    attachAskedSections(structured, data, wanted, notes);

    notes.push(...notesOnWhatTheRecordStates(data));

    const lines = [
      [data.title ?? data.identifier, data.date ? `(${data.date})` : ""].filter(Boolean).join(" "),
      data.creator ? `By ${data.creator}` : "",
      data.format ? `Kind: ${data.format}` : "",
      data.subjects.length > 0 ? `Subjects: ${data.subjects.join(", ")}` : "",
      data.partOf.length > 0 ? `Part of: ${data.partOf.join(", ")}` : "",
      data.repository ? `Held at: ${data.repository}` : "",
      data.rights ? `Rights: ${data.rights}` : "",
    ].filter(Boolean);

    if (slice !== "") {
      lines.push("", slice);
    }

    const resources = structured.resources as
      | Array<{ caption: string | null; url: string | null }>
      | undefined;
    if (resources && resources.length > 0) {
      lines.push("", "Copies served online:");
      for (const resource of resources) {
        lines.push(`  ${resource.caption ?? "copy"}${resource.url ? ` — ${resource.url}` : ""}`);
      }
    }

    return ok(structured, lines.join("\n"), { notes, sourceUrl: data.sourceUrl });
  } catch (error) {
    return toToolError(error);
  }
}
