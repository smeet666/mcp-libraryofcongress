# Changelog

## 2.0.0

### Breaking change

`search_newspapers` no longer returns `words_located`. Each match now carries
`excerpt_kind`, one of `"passage"` or `"page_opening"`. A caller reading
`words_located === true` reads `excerpt_kind === "passage"`, and the false case
reads `"page_opening"`.

The boolean and the excerpt disagreed about what they were. `words_located:
false` means the machine-read text the Library returned stops before the
searched words, so the excerpt beside it is the **opening of the page** and does
not carry the match. It sat in the answer in the same place and the same shape
as a real passage, and a note beside it was the only thing saying otherwise.
Measured on a live search, four matches in five were openings. Naming the kind
of thing an excerpt is puts that where it cannot be skipped.

### Also in this release

- Every excerpt is now labelled in the rendered text itself, as
  `[passage]` or `[page opening]` ahead of the words, so the mark travels with
  the text a reader copies.
- The tool described quoting as matching a phrase whole. It does not. Measured:
  `"hell is other people"` quoted returns 18 pages, unquoted 1,634,731, and
  among the quoted results are pages from 1891, 1897 and 1906, which precede the
  line by half a century. Quoting narrows hard and decides nothing about how the
  Library matches. The promise is gone from the tool description and from both
  halves of the README, and a quoted query now carries a note saying the match
  is not guaranteed to be the phrase.
- Headings said the pages carry the query. They say what the Library matched.

`NewspaperHit.wordsLocated`, on the `./client` subpath, is unchanged: it is the
raw fact about the text received, and the tool layer names the kind of thing it
renders from it.

## 1.1.0

- An argument no tool declared was read and dropped, and the answer came back
  computed on the defaults with nothing said about it. A caller who mistyped a
  name, or wrote one a tool answering a neighbouring question takes, was
  answered as confidently as one who had asked what they meant. Every tool now
  refuses an argument it does not declare, under the `invalid_input` code,
  naming the argument and offering the declared name when one is close:
  `identifer` on `get_item` is answered with `identifier`, `limit_per_page` on
  `search_newspapers` with `limit`.
- The schema each tool publishes now carries `additionalProperties: false`, so a
  client reads the rule before it calls rather than discovering it from a
  refusal.

## 1.0.0

First stable release. The tool names, the argument names and the shape of the
structured output are settled and will not change without a major version.

Four tools over the Library of Congress, with no API key and no account.

- `search_newspapers` reads the text optical recognition took off millions of
  scanned pages of American newspapers, so it answers a question no catalogue
  can: which issue printed this phrase. A match names the paper, the date, the
  leaf and the state, and links the leaf with the query applied. Narrowing is
  typed here too: `location` for the state a paper was published in,
  `publication` for one paper, `year_from` and `year_to` for a span of years.
- `search_items` searches one catalogue at a time, because the Library keeps a
  separate catalogue per kind of thing and `media_type` names which one.
  Narrowing is typed: years, subject, location, language and collection.
- `get_item` reads one record section by section, and paginates a long
  description by character offset, resuming at a line boundary.
- `list_collections` shows the corpora a curator built, each row carrying the
  exact wording `search_items` takes as its `collection` filter.

Four things this release is careful about.

A failure is never reported as an empty result. A refused request is
`invalid_input`, an unreadable answer is `parse_failure`, and only a genuinely
empty record is an absence. Reading rows alone turns "I could not ask" into
"there is none of it".

An excerpt states where it came from. The Library returns the opening of a
page's text with each search row rather than the whole page, so the searched
words often sit further down. `words_located` says which of the two happened for
every match, rather than letting the opening of a leaf pass for the passage that
matched.

Each route is given the deadline it needs. The full-text newspaper corpus takes
tens of seconds to answer where the catalogue takes a few, so
`LOC_NEWSPAPER_TIMEOUT_MS` governs that one route and `LOC_TIMEOUT_MS` the rest.
A query holding two quoted phrases is an ordinary question of that corpus and it
gets an answer rather than a deadline.

A count is named for what it counts. The site publishes the number of results
and the number of pages under names that read alike, and one is the other
multiplied by the page size. Only the count of results is ever reported as a
total.
