# mcp-libraryofcongress

## Tagline

Search inside scanned newspaper pages and the Library of Congress catalogue.

## Description

An MCP server for the Library of Congress. Find a phrase printed on a page of an
American newspaper, find a work in the catalogue by title, creator or subject,
read one record, and see the collections a curator built.

Searching inside the newspapers is the part nothing else does. It reads the text
optical character recognition took off millions of scanned pages, so it answers
"which issue printed this sentence", and returns the paper, the date, the leaf,
the state and a link that opens that leaf with the query applied. That search
narrows to a state, to a single paper, or to a span of years, so "an article
about immigration in a New York paper" is a question it can take.

The catalogue is divided by kind of thing, so a search names which one it is
asking: books, photos, maps, audio, film, manuscripts, sheet music or newspaper
titles. Narrowing is typed rather than free text, and a filter that matches
nothing is set aside and named in the answer, so a subject spelled differently
from the Library's own wording never reads as an empty shelf.

The server is careful about what it refuses to claim. A failure is never
reported as an empty result. An excerpt says whether it is centred on the
searched words or is the opening of the page. A record with no stated terms of
use reports that silence rather than passing for permission.

## Setup Requirements

- `LOC_USER_AGENT` (optional): Identify your own client. The project's own identifier is appended, so the Library can always reach a human.
- `LOC_MIN_INTERVAL_MS` (optional): Minimum gap between requests. Default 6000, and values below 3000 are refused.
- `LOC_TIMEOUT_MS` (optional): Per-request deadline for the catalogue, the records and the collections. Default 30000.
- `LOC_NEWSPAPER_TIMEOUT_MS` (optional): Per-request deadline for search_newspapers, which answers in tens of seconds. Default 90000.
- `LOC_MAX_RETRIES` (optional): Retries on rate limiting and transient errors. Default 3.
- `LOC_CACHE_TTL_MS` (optional): In-memory cache lifetime. Default 900000. Set 0 to turn it off.
- `LOC_CACHE_MAX_ENTRIES` (optional): In-memory cache size. Default 200.
- `LOC_LOG_LEVEL` (optional): silent, error, info or debug. Default error, on stderr.

No API key and no account are needed.

## Category

Education & Research

## Features

- Full-text search inside digitised American newspaper pages
- A match names the paper, the date, the leaf and the state it was published in
- Says whether an excerpt is centred on the searched words or opens the page
- Catalogue search across books, photos, maps, audio, film, manuscripts and sheet music
- Typed narrowing by year range, subject, location, language and collection
- Newspaper search narrowed to a state, to one paper, or to a span of years
- A filter that matches nothing is dropped and named, rather than reported as an empty shelf
- Reads one record section by section, with a long description paged by offset
- Handles identifiers carrying slashes, such as a single newspaper issue
- Lists the digital collections, each with the filter that searches it
- States what a record says about reuse, and says when it says nothing
- Marks scanned text as machine-read, so quotes are repeated as such
- A failure is returned as an error code rather than as an empty result
- Every result carries a link back to the Library
- Self-paced to the ceiling the Library publishes, with an honest User-Agent

## Getting Started

- "Which newspapers printed the phrase 'cure for influenza' in 1918?"
- "Find an article about immigration in a New York paper between 1900 and 1910"
- "Find Library of Congress photographs of Oklahoma before 1940"
- "What does the Library hold on the Chronicling America collection, and how big is it?"
- Tool: search_newspapers — Finds a phrase in the text of scanned newspaper pages
- Tool: search_items — Searches one catalogue by title, creator or subject
- Tool: get_item — Reads one record, section by section
- Tool: list_collections — The digital collections, with the filter each one takes

## Tags

library-of-congress, chronicling-america, newspapers, full-text-search, archives, catalogue, history, research, public-domain, no-api-key

## Documentation URL

https://github.com/smeet666/mcp-libraryofcongress#readme
