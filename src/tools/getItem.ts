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
import { RIGHTS_CAVEAT, ok, sliceAtLineBoundary, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

const SECTIONS = ["basic", "citations", "resources", "full_metadata"] as const;

export const getItemDescription = [
  "Read one Library of Congress record by its identifier, as returned by search_items or search_newspapers.",
  "An identifier can carry slashes: a single newspaper issue is named by its paper, its date and its edition together.",
  "Sections are opt-in: 'basic' is the default and covers what a description needs.",
  "'citations' returns the ready-made citations the Library publishes for the record.",
  "'resources' lists the served copies, such as page images and downloadable files.",
  "'full_metadata' returns every field the Library publishes for the record, which is large and rarely needed.",
  "A long description paginates: when 'next_offset' is not null, call again with 'offset' set to it.",
].join(" ");

export const getItemInput = z.object({
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
    year: z.number().int().nullable(),
    date: z.string().nullable(),
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
    .describe("Notes the Library published about the record itself."),
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
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");

    const full = data.description ?? "";
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
        format: data.format,
        source_url: data.sourceUrl,
      },
      description: slice === "" ? null : slice,
      offset: args.offset,
      next_offset: nextOffset,
      notes_on_record: data.notes,
      subjects: data.subjects,
      location: data.location,
      language: data.language,
      part_of: data.partOf,
      repository: data.repository,
      call_number: data.callNumber,
      rights: data.rights,
      notes,
    };

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
    if (wanted.has("full_metadata")) structured.full_metadata = data.raw ?? {};

    if (!data.rights) notes.push(RIGHTS_CAVEAT);

    const lines = [
      [data.title ?? data.identifier, data.date ? `(${data.date})` : ""].filter(Boolean).join(" "),
      data.creator ? `By ${data.creator}` : "",
      data.format ? `Kind: ${data.format}` : "",
      data.subjects.length > 0 ? `Subjects: ${data.subjects.join(", ")}` : "",
      data.partOf.length > 0 ? `Part of: ${data.partOf.join(", ")}` : "",
      data.repository ? `Held at: ${data.repository}` : "",
      data.rights ? `Rights: ${data.rights}` : "",
    ].filter(Boolean);

    if (slice !== "") lines.push("", slice);

    const resources = structured.resources as
      Array<{ caption: string | null; url: string | null }> | undefined;
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
