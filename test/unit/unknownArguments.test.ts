/**
 * What happens to an argument no tool declares.
 *
 * A caller who mistypes an argument name, or qualifies one this server keeps
 * plain, must be told. An argument that is read and dropped leaves the answer
 * computed on a default, which reads as an answer to the question that was
 * asked and is not one.
 *
 * Everything here goes over the protocol, because the refusal is the server's
 * answer to a client rather than an internal check.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createServer } from "../../src/server.js";
import {
  CATALOGUE_ROW,
  EPOCH,
  COLLECTION_ROW,
  cataloguePayload,
  collectionsPayload,
  itemPayload,
  jsonResponse,
  newspaperRow,
  newspapersPayload,
  settle,
  silent,
} from "./spec.support.js";

/** One valid call per tool, so a refusal is never mistaken for a broken tool. */
const CALLS: Array<[string, Record<string, unknown>]> = [
  ["search_newspapers", { query: "lamps" }],
  ["search_items", { query: "orchard", media_type: "books" }],
  ["get_item", { identifier: "glass-orchard-1971" }],
  ["list_collections", {}],
];

const open = new Set<{ close: () => Promise<void> }>();

async function connect(): Promise<Client> {
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url.includes("chronicling-america")) {
      return jsonResponse(newspapersPayload([newspaperRow()]));
    }
    if (url.includes("/collections/")) return jsonResponse(collectionsPayload([COLLECTION_ROW]));
    if (url.includes("/item/")) return jsonResponse(itemPayload());
    return jsonResponse(cataloguePayload([CATALOGUE_ROW]));
  }) as unknown as typeof fetch;

  const server = createServer({
    config: { ...loadConfig({}), maxRetries: 0, logLevel: "silent" },
    logger: silent,
    fetchImpl,
  });
  const client = new Client({ name: "unknown-arguments", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  open.add({
    close: async () => {
      await client.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    },
  });
  return client;
}

// The Library asks for seconds between requests and the client keeps to them,
// so the clock is driven rather than waited on.
beforeEach(() => {
  vi.useFakeTimers({ now: EPOCH });
});

afterEach(async () => {
  for (const harness of open) await harness.close();
  open.clear();
  vi.useRealTimers();
});

interface CallResult {
  isError?: boolean;
  content?: Array<{ text?: string }>;
}

/** What a caller receives: whether the call failed, and what it was told. */
async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ isError: boolean; text: string }> {
  const result = (await settle(client.callTool({ name, arguments: args }))) as CallResult;
  return {
    isError: result.isError === true,
    text: (result.content ?? []).map((part) => part.text ?? "").join("\n"),
  };
}

describe("the schema a client reads before calling", () => {
  it("says on every tool that an argument it does not declare is refused", async () => {
    const client = await connect();
    const { tools } = await settle(client.listTools());
    expect(tools.length).toBe(CALLS.length);
    for (const tool of tools) {
      expect(
        (tool.inputSchema as { additionalProperties?: unknown }).additionalProperties,
        tool.name,
      ).toBe(false);
    }
  });
});

describe("an argument no tool declares", () => {
  it("is refused by every tool, and the refusal names it", async () => {
    const client = await connect();
    for (const [name, args] of CALLS) {
      const result = await call(client, name, { ...args, not_an_argument: 1 });
      expect(result.isError, name).toBe(true);
      expect(result.text, name).toContain("not_an_argument");
    }
  });

  it("is refused under the code the caller can branch on", async () => {
    const client = await connect();
    const result = await call(client, "search_items", { query: "orchard", not_an_argument: 1 });
    expect(result.text).toContain("invalid_input");
  });

  it("is answered with the declared name when one is close", async () => {
    const client = await connect();
    const misspelt = await call(client, "get_item", { identifer: "glass-orchard-1971" });
    expect(misspelt.text).toContain("did you mean 'identifier'");

    const qualified = await call(client, "search_newspapers", {
      query: "lamps",
      limit_per_page: 3,
    });
    expect(qualified.text).toContain("did you mean 'limit'");
  });

  it("lists the names the tool does take", async () => {
    const client = await connect();
    const result = await call(client, "list_collections", { rows: 3 });
    expect(result.text).toContain(
      "This tool takes: limit, page, searchable_only, max_description_chars.",
    );
  });

  it("leaves the arguments a tool does declare working", async () => {
    const client = await connect();
    for (const [name, args] of CALLS) {
      const result = await call(client, name, args);
      expect(result.isError, `${name}: ${result.text}`).toBe(false);
    }
  });
});
