/**
 * Wiring: one client, four tools, and the guidance a model reads before using
 * any of them.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config, Logger } from "./config.js";
import { createLogger, loadConfig } from "./config.js";
import { LocClient } from "./loc/client.js";
import { getItemDescription, getItemInput, getItemOutput, runGetItem } from "./tools/getItem.js";
import type { GetItemArgs } from "./tools/getItem.js";
import {
  listCollectionsDescription,
  listCollectionsInput,
  listCollectionsOutput,
  runListCollections,
} from "./tools/listCollections.js";
import type { ListCollectionsArgs } from "./tools/listCollections.js";
import {
  runSearchItems,
  searchItemsDescription,
  searchItemsInput,
  searchItemsOutput,
} from "./tools/searchItems.js";
import type { SearchItemsArgs } from "./tools/searchItems.js";
import {
  runSearchNewspapers,
  searchNewspapersDescription,
  searchNewspapersInput,
  searchNewspapersOutput,
} from "./tools/searchNewspapers.js";
import type { SearchNewspapersArgs } from "./tools/searchNewspapers.js";
import { PKG_VERSION } from "./version.js";

export interface CreateServerOptions {
  config?: Config;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

/** Nothing here writes, uploads or deletes; every tool only reads. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const INSTRUCTIONS = [
  "Tools for the Library of Congress. No API key and no account are needed.",
  "Two questions lead to two different tools, and choosing the wrong one gives a confident empty answer.",
  "To find words printed on a page of an American newspaper, use search_newspapers: it reads the text scanned off the pages and returns the paper, the date, the leaf and what it holds of that text.",
  "To find a work by its title, creator or subject, use search_items, which requires a 'media_type' because the Library keeps a separate catalogue per kind of thing.",
  "A search_items row is either a record or one of those corpora: 'is_collection' says which, and a collection carries no 'identifier' because the item route holds nothing at its address.",
  "list_collections shows the corpora a curator built, and each row carries the wording search_items takes as its 'collection' filter.",
  "search_newspapers reports 'total' as the number of pages that match, and they page: ask for the next page rather than treating the first answer as the whole of it.",
  "Excerpts come from optical character recognition, so the words can be wrong; repeat them as scanned text and link the page.",
  "Every match carries 'excerpt_kind', and the excerpts are labelled with it in the text. A 'passage' is the text around the words that matched. A 'page_opening' is the start of the page, sent because the text this server received stops before those words appear, so it does not carry the match and citing it as the match cites the wrong words. The notes count the openings.",
  "Double quotes change what a newspaper search matches, and the Library decides what they mean: a matched page can carry the words apart or in another order rather than the phrase as written, so read the page behind source_url before saying it printed the phrase. What the quotes do to the number of matching pages varies from one query to the next, so the count is no measure of the phrase.",
  "Metadata here is in the public domain, and individual items are not: a record states its own terms, and a record stating none is not a record granting permission.",
  "This server paces itself to the ceiling the Library publishes, so answers take a few seconds. A rate_limited error means it was asked to slow down, never that the thing you asked for is missing.",
  "Every result carries a source_url. Credit the Library of Congress and link what you use.",
].join(" ");

export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.logLevel);
  const client = new LocClient({
    config,
    logger,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  const server = new McpServer(
    { name: "mcp-libraryofcongress", version: PKG_VERSION },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "search_newspapers",
    {
      title: "Search inside scanned newspaper pages",
      description: searchNewspapersDescription,
      inputSchema: searchNewspapersInput,
      outputSchema: searchNewspapersOutput,
      annotations: READ_ONLY,
    },
    async (args) => runSearchNewspapers(client, args as SearchNewspapersArgs),
  );

  server.registerTool(
    "search_items",
    {
      title: "Search the catalogue",
      description: searchItemsDescription,
      inputSchema: searchItemsInput,
      outputSchema: searchItemsOutput,
      annotations: READ_ONLY,
    },
    async (args) => runSearchItems(client, args as SearchItemsArgs),
  );

  server.registerTool(
    "get_item",
    {
      title: "Read a record",
      description: getItemDescription,
      inputSchema: getItemInput,
      outputSchema: getItemOutput,
      annotations: READ_ONLY,
    },
    async (args) => runGetItem(client, args as GetItemArgs),
  );

  server.registerTool(
    "list_collections",
    {
      title: "List the digital collections",
      description: listCollectionsDescription,
      inputSchema: listCollectionsInput,
      outputSchema: listCollectionsOutput,
      annotations: READ_ONLY,
    },
    async (args) => runListCollections(client, args as ListCollectionsArgs),
  );

  logger.info(
    `ready: user-agent="${config.userAgent}", ${config.minIntervalMs}ms between requests, cache ${config.cacheTtlMs}ms`,
  );

  return server;
}
