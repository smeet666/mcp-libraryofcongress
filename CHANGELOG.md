# Changelog

## 2.1.0

- A catalogue row pointing at a collection no longer claims an identifier
  `get_item` can take. A search of the photos catalogue for the words civil war
  photographs returns four rows addressed at `/collections/<slug>/`, and the
  slug read off them sent `get_item` to `/item/civil-war/`, where the Library
  answers that it holds nothing. Reading a collection through `get_item` was
  the other way out and was not taken: a collection is a corpus a curator
  built, with a count of records, a set of formats and a filter that opens it,
  and none of that fits a record's shape of rights, call number, repository and
  served copies. `list_collections` publishes collections, `search_items` takes
  their wording as a filter, and the item route holds a record. Such a row now
  carries `identifier: null` beside the `source_url` that opens it, and the
  answer counts the rows carrying no identifier and says `get_item` has nothing
  to take for them. `list_collections` still names each collection by its slug.
- `list_collections` says which catalogue can be asked for a collection. Of 250
  collections read, 50 publish only formats the `media_type` enum does not hold
  (`web-archives`, `periodicals`, `video` among them) and 6 publish none, so
  their `collection_filter` was advertised with no value of `media_type` able to
  carry it: asked for the Afghanistan Web Archive, all eight catalogues answer
  with nothing, and the failure reached the caller as "nothing matches your
  query". Each row now carries `searchable_media_types`, read off the formats
  the Library publishes for the collection and covering the Library's several
  spellings of one catalogue, so `video` and `prints-and-photographs` name
  `film-and-videos` and `photos`. A row naming none says so with an empty list,
  a note counts those rows and names the formats behind them, and the new
  `searchable_only` argument leaves them out.
- `search_items` no longer reports the unfiltered total as the count for the
  query as sent. A search whose filter matched nothing is asked again without
  it, and both the heading and `total` then gave the figure of the wider
  search, 311,225 for `history` in the books catalogue, as the number of records
  matching a search that matched none, with one note saying the rows were
  unfiltered while a second repeated the figure as a plain fact. Every
  sentence carrying the count now names the search it counts, the set-aside note
  states that the search as sent matched none, and `total` says the same in its
  description. The advice that note gives points at where each filter's wording
  is published: a subject and a place on a row, a language written in English,
  and a collection under `collection_filter` in `list_collections`.
- `search_newspapers` calls an excerpt a `passage` only when the page's
  machine-read text carries a searched word as a word. Locating a term as a run
  of letters found `art` inside _particular_, _impartially_, _parts_ and the
  scanning noise _ARtloulttuat_, and `cat` inside _Cattle_: on `art gallery`,
  four of the eight rows labelled `passage` were about wrinkle cream, harness
  parts and a county fair, and each of them was excluded from the count of page
  openings and handed over as the text around the words that matched. A term is
  now found on a word boundary, in any case and with punctuation allowed to sit
  against either end, which is what machine-read text does to a word. A row
  where no term stands as a word is a `page_opening`, counted as one, and its
  excerpt is the start of the page. Measured again on the same three queries:
  thirty rows, eleven `passage` labels, all eleven carrying the words.
- `search_items` no longer publishes a day and a month a row does not carry.
  The catalogue files every row under one sortable date and fills what the
  record leaves unsaid, so a photograph whose words say `1860` came back as
  `1860-01-01`: on one measured page, twenty-three rows of twenty-five. `date`
  and `year` on a row are now cut back to the precision the row's own words
  support, read from the record block the row nests and the years the index
  files it under, so a row and the record behind it state the same date.
- A record naming a date of its own beside a range of other years keeps that
  date. `photographed 1864, [printed between 1880 and 1889]` was reported as
  1864 being the opening of a span, which denies the year the record states
  outright. The note is now raised only when the record's own words write a
  range out and open it on the year the catalogue files the record under.
- `search_items` reads a page past the last one for what it is. The catalogue
  answers such a page with a 404, which came back as `not_found` and the words
  "the Library of Congress holds nothing at this address" on a call that
  carries no address and about records that exist. The first page is read for
  how many records match, and the answer says which page was asked for, how
  many records match and across how many pages.
- `search_items` searches a one-character word written in a script where one
  character is a word. Refusing every query whose words run to a single
  character refused `水`, and claimed as a property of the Library something the
  catalogue disproves: on the books catalogue `山水` matches 57 records and
  `水 山水` matches one, so the index does act on the character. Han, Japanese
  and Korean script are searched as they stand, and what the catalogue answers
  for them, including an answer of none, is reported as the answer it is. The
  refusal that remains is for a query whose every word is a single letter.
- `get_item` no longer publishes a day and a month the record does not carry.
  The catalogue files every record under one sortable date and fills what the
  record leaves unsaid: `mss412100053`, titled twice over as undated, is filed
  at `1848-01-01`, which is the opening of the span its series covers, and a
  record whose own words say `1925.` is filed at `1925-01-01`. `date` is now cut
  back to the precision the record's own words support, `year` reads that value,
  and the new `date_stated` carries those words. A record filed at the opening
  of a span of years says so in a note. A record whose words name a month or a
  day keeps the date as filed, and so does a record that says nothing about its
  date, since it offers nothing to read the filed value against.
- `search_items` refuses a query whose every word is a single letter.
  The catalogue index holds no word of a single letter: on the books
  catalogue `a`, `b` and `a b` each match nothing, `zz` matches 35,895, and
  `a of` returns exactly the 748,064 that `of` returns alone. Answering with a
  total of zero and "nothing in the books catalogue matches" reported a property
  of the index as a fact about the collection. The refusal is `invalid_input`
  and names the reason.
- The note on newspaper matches whose excerpt is the opening of the page says
  where the `[page opening]` mark is written. The mark rides on each excerpt in
  the text block; the excerpts in the structured answer hold the machine-read
  text as it stands, with nothing added to them, and the note names
  `excerpt_kind` as what carries the distinction there.

- `list_collections` says where paging through the corpus stops. The Library
  publishes 583 collections and divides them into twelve pages of fifty; on the
  twelfth the answer still read "583 collections exist and 33 are shown. Ask for
  page 13 to continue", and page 13 came back as `not_found` with the words the
  Library uses for an address it holds nothing at. The next page is now offered
  only where the Library has one, the last page says it is the last and how many
  pages the corpus runs to at the size asked for, and a page past the last is
  answered as an empty page of a corpus that exists. `page` stops at 100, which
  at a small `limit` stops short of the corpus: at a `limit` of 5 the answer now
  says that 500 of the 583 collections are within reach and that raising `limit`
  brings the rest.
- `search_items` states an identifier a row does not carry. Searching the
  manuscripts catalogue for abraham lincoln papers returns the Abraham Lincoln
  Papers collection, whose `identifier` is null, and the text block printed that
  row with nothing where the others carry `id:`, which reads as an identifier
  that went unprinted rather than one that does not exist. Such a line now
  states the absence, and the tool description says an identifier comes with a
  row that names a record instead of promising one on every row.
- A row that is a collection says so. On the same search, one row of the five is
  the corpus a curator built and named rather than a manuscripts record, its
  format reads `collection`, and the catalogue's count of 24,836 counts it in.
  Rows now carry `is_collection`, and where any are present a note counts them,
  says the item route holds nothing at their address, and says that the count
  beside the rows counts them in.
- A cataloguing code is no longer published as a date. The Library files a
  record whose digits it has not established under a code standing in for them,
  so `uuuu` means an unknown year and `18??` a year known only to its century:
  `2002556854`, Gen. Lafayette's grand march, came back as `(18??)` in the slot
  every other row fills with a year. `date` and `year` are null for such a
  record, the new `date_code` carries the code under a name saying what it is, a
  note says the Library has established no date, and `date_stated` still repeats
  the record's own words, here `Philadelphia : Geo. Willig, [18--]`.
- A filed date is kept whole only where the record's own words name the month it
  is filed under. Asking whether those words named any month at all kept
  `1934-01-01` on `2004663673`, a Van Vechten self-portrait the record dates
  `1934 May 8.`, and kept `1483-01-01` on an incunable printed `1483-02-17`. The
  month the catalogue filed the record under is now read against the months the
  words name, and the value is cut back to the year when they do not name it. A
  month word counts only where a day or a year stands beside it, so `may` in a
  sentence and `march` in a title name no month, and a year with two digits
  after a hyphen names a month only when the year is the one the record is filed
  under, so `1908-09` beside a record filed at 1908 is 1908 to 1909.
- `search_newspapers` searches a query of one character. The two searches
  refused a short query in two unrelated shapes: `search_items` in its own words
  with a reason and a hint, `search_newspapers` in the validation framework's,
  as "Too small: expected string to have >=2 characters". The full-text index of
  the newspaper corpus does hold single characters and answers each with a set
  of its own: `a` matches 23,522,867 pages, `x` 13,323,103 and `q` 7,885,360, so
  the minimum refused a question the corpus answers. It is gone. The catalogue
  index holds no such word, `a` and `x` each matching none of the 798,435 books,
  and `search_items` keeps its refusal in its own words.
- What double quotes do to a newspaper search is stated as measured rather than
  as a rule. The tools, the server instructions and the README all said quoting
  narrows the search sharply and that dropping the quotes finds far more again.
  Measured on ten queries, the count moves by no fixed amount and not always in
  the same direction: `"iron horse"` matches 31,783 pages against 3,393,506
  unquoted and `"good morning"` 129,769 against 12,219,078, while `"new york"`
  matches 14,464,911 against 15,353,114, and `"of the"` matches 20,624,639
  against 5,419,814 for the same words unquoted. What the quotes govern is how
  the Library matches: a page can come back carrying the words apart or in
  another order rather than the phrase as written. That is what is now said,
  with the count named as no measure of the phrase and both forms worth asking.
- `get_item` refuses an identifier carrying a control character. Such an
  identifier was percent-encoded into the address and sent, and the Library
  answered for something nobody publishes: `2017\u0001645459` came back as a
  timeout and an escape sequence before the same digits as HTTP 500, where an
  identifier climbing out of the item route was already refused as
  `invalid_input` with its reason. Both are malformed identifiers and both are
  now refused before an address is built. The refusal for a control character
  names no identifier: those characters are the ones a terminal, a log and a
  chat window do not draw, so printing the value back would show a different
  spelling from the one that was sent.
- Counts agree with the numbers they carry. A single match reported `On 1 of 2
match(es)`, `1 match(es) came back`, `1 row(s) shown carry no date`, `431
records match and 1 are shown` and `583 collections exist and 1 are shown`.
  The parenthesised plural is gone and the nouns and verbs beside a count now
  take the form that count takes, across the four tools.
- `get_item` no longer returns the same words twice. The Library assembles the
  description of some records by running the notes it holds on them together, so
  `03027877` returned `First appeared in Tait's magazine, 1847-1849.` as its
  whole description and again as `notes_on_record[0]`, and `2021617173` returned
  its five notes both ways. A note whose words the description already carries
  is left to the description, where it is published whole and paginates, and the
  field says so in its own description.

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
