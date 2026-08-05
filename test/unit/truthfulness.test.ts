/**
 * What an answer may claim.
 *
 * Each test here stands for a way a confident false statement got made: a null
 * printed as a value, a count described as something it does not count, a
 * qualification that never reached the block a client renders.
 */

import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION,
  MAX_TEXT_CHARS,
  indentMarkerLines,
  ok,
  sliceAtLineBoundary,
  truncate,
} from "../../src/tools/shared.js";
import { LocError } from "../../src/errors.js";
import { toToolError } from "../../src/tools/shared.js";

describe("the block a client renders", () => {
  it("ends with the credit", () => {
    const result = ok({}, "a body");

    expect(result.content[0]!.text.endsWith(ATTRIBUTION)).toBe(true);
  });

  it("carries the address to cite when there is one", () => {
    const result = ok({}, "a body", { sourceUrl: "https://www.loc.gov/item/x/" });

    expect(result.content[0]!.text).toContain("https://www.loc.gov/item/x/");
  });

  it("keeps the notes that qualify the answer", () => {
    const result = ok({}, "a body", { notes: ["a list was cut"] });

    expect(result.content[0]!.text).toContain("Note: a list was cut");
  });

  it("keeps the credit when the body is longer than the block", () => {
    const result = ok({}, "x".repeat(50_000), { notes: ["still qualified"] });
    const text = result.content[0]!.text;

    expect(text.length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
    expect(text).toContain("Note: still qualified");
    expect(text.endsWith(ATTRIBUTION)).toBe(true);
    expect(text).toContain("[shortened;");
  });

  it("does not let notes crowd out the answer they qualify", () => {
    const notes = Array.from({ length: 40 }, (_, i) => `note number ${i} padded out with words`);
    const result = ok({}, "the answer itself", { notes });

    expect(result.content[0]!.text).toContain("the answer itself");
  });

  it("keeps the whole answer in the structured payload when the text was cut", () => {
    const result = ok({ total: 12 }, "x".repeat(50_000));

    expect(result.structuredContent).toEqual({ total: 12 });
  });

  it("indents a published line that would otherwise read as one of this server's", () => {
    expect(indentMarkerLines("Note: written by a publisher")).toBe(" Note: written by a publisher");
    expect(indentMarkerLines("Source: someone else")).toBe(" Source: someone else");
  });

  it("indents such a line wherever it sits in the body", () => {
    const body = "first line\nSource: a title that starts this way";

    expect(ok({}, body).content[0]!.text).toContain("\n Source: a title");
  });

  it("leaves the text exactly as published in the structured payload", () => {
    const title = "Note: a title beginning this way";
    const result = ok({ title }, title);

    expect((result.structuredContent as { title: string }).title).toBe(title);
  });
});

describe("failures", () => {
  it("carries the code and the hint, and no structured payload", () => {
    const result = toToolError(new LocError("rate_limited", "slow down", { hint: "wait" }));

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("[rate_limited] slow down");
    expect(result.content[0]!.text).toContain("Hint: wait");
    expect(result.structuredContent).toBeUndefined();
  });

  it("reports an error it does not recognise rather than swallowing it", () => {
    const result = toToolError(new Error("something else"));

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("something else");
  });
});

describe("cutting text", () => {
  it("marks where a passage was cut", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcd…");
  });

  it("leaves text that already fits alone", () => {
    expect(truncate("abc", 5)).toBe("abc");
  });

  it("resumes a long description at a line boundary", () => {
    const text = "first line\nsecond line\nthird line";
    const { slice, nextOffset } = sliceAtLineBoundary(text, 0, 15);

    expect(slice).toBe("first line");
    expect(nextOffset).toBe(10);
    expect(text.slice(nextOffset!).trim().startsWith("second")).toBe(true);
  });

  it("says a slice is the last one rather than offering an offset past the end", () => {
    expect(sliceAtLineBoundary("short", 0, 100).nextOffset).toBeNull();
  });

  it("cuts a single unbroken line hard, since there is no boundary to find", () => {
    const { slice, nextOffset } = sliceAtLineBoundary("x".repeat(100), 0, 40);

    expect(slice).toHaveLength(40);
    expect(nextOffset).toBe(40);
  });

  it("never cuts between the halves of one character", () => {
    const text = "😀".repeat(20);
    const { slice, nextOffset } = sliceAtLineBoundary(text, 0, 11);

    expect(slice).toHaveLength(10);
    expect([...slice]).toHaveLength(5);
    expect(nextOffset).toBe(10);
  });
});
