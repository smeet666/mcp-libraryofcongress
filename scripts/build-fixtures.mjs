#!/usr/bin/env node
/**
 * Writes the JSON corpus the tests read instead of calling the Library.
 *
 * The shapes mirror what each route returns, and every title, name and passage
 * is invented: no third-party content is stored in this repository, and a
 * deterministic corpus means a test that fails is a change in this code rather
 * than a change in a catalogue. Several fixtures carry nodes the parsers must
 * ignore, so a test cannot pass by reading a response too literally.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
mkdirSync(OUT, { recursive: true });

const write = (name, value) => {
  writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`${name}: ${JSON.stringify(value).length} bytes`);
};

/**
 * The paging block, whose two counts are the trap this corpus exists to catch:
 * `of` counts results and `total` counts pages.
 *
 * A search matching nothing is written the way the site writes it: no row is
 * numbered, and the one page is the empty page a caller is standing on.
 */
const paging = (resultCount, perPage, current = 1) =>
  resultCount === 0
    ? {
        current,
        from: 0,
        of: 0,
        perpage: perPage,
        results: "0 - 0",
        to: 0,
        total: 1,
        page_list: [{ number: 1, url: null }],
      }
    : {
        current,
        from: (current - 1) * perPage + 1,
        of: resultCount,
        perpage: perPage,
        results: `${(current - 1) * perPage + 1} - ${current * perPage}`,
        to: current * perPage,
        total: Math.ceil(resultCount / perPage),
        page_list: [{ number: 1, url: null }],
      };

write("catalogue.json", {
  pagination: paging(431, 3),
  results: [
    {
      id: "http://www.loc.gov/item/glass-orchard-1971/",
      url: "https://www.loc.gov/item/glass-orchard-1971/",
      title: "The Glass Orchard",
      date: "1971-06-04",
      contributor: ["reame, vashti", "orchard pictures"],
      original_format: ["book"],
      online_format: ["online text", "pdf"],
      location: ["utah", "united states"],
      subject: ["orchards", "salt flats"],
      digitized: true,
      ignored_block: { note: "the parsers must not read this" },
    },
    {
      // A catalogue record with no digitised copy points at an LCCN host, and
      // the address arrives without a scheme.
      id: "http://lccn.loc.gov/58001234",
      url: "//lccn.loc.gov/58001234",
      title: "Letters from the Salt Flats",
      date: "1954",
      contributor: "marchetti, ines",
      original_format: "book",
      location: [],
      subject: [],
      digitized: false,
    },
    // No title and no address: nothing here can be shown or followed.
    { date: "1990", contributor: ["anonymous"] },
  ],
});

write("catalogue-empty.json", { pagination: paging(0, 3), results: [] });

/** A page of results past the last one: the count stands, the rows are gone. */
write("catalogue-past-end.json", { ...{ pagination: paging(431, 3, 99) }, results: [] });

write("catalogue-unreadable.json", {
  pagination: paging(12, 3),
  results: [{ date: "1900" }, { contributor: ["nobody"] }],
});

write("catalogue-no-pagination.json", { results: [] });

write("catalogue-no-count.json", { pagination: { current: 1, perpage: 3 }, results: [] });

/**
 * Newspaper pages. The first carries the searched words inside the text the
 * row returns; the second does not, which is the common case and the one an
 * answer has to be honest about.
 */
const PAGE_WITH_WORDS =
  "SALT COUNTY HERALD PAGE FOUR A meeting of the county board was held on Tuesday " +
  "evening at the courthouse where the question of the lamps went out along the " +
  "river road was put to the members at length and referred back to the works " +
  "committee for a report before the winter sets in. Later in the evening it was " +
  "said that the lamps went out again before the vote was taken.";

const PAGE_WITHOUT_WORDS =
  "ORCHARD DAILY REVIEW PAGE ONE Notices of sale and of removal are printed below " +
  "together with the arrivals at the Marchetti hotel and the times of the ferry " +
  "which runs on the hour until dusk throughout the season.";

write("newspapers.json", {
  pagination: paging(4177, 2),
  results: [
    {
      id: "http://www.loc.gov/resource/sn00000001/1893-11-04/ed-1/?sp=4",
      url: "https://www.loc.gov/resource/sn00000001/1893-11-04/ed-1/?sp=4&q=%22the+lamps+went+out%22",
      title: "Image 4 of Salt County Herald (Salt City, Utah), November 4, 1893",
      date: "1893-11-04",
      description: [PAGE_WITH_WORDS],
      number_page: ["0000000004"],
      partof_title: ["salt county herald (salt city, utah) 1881-1922"],
      location_state: ["utah"],
      contributor: ["salt county library"],
      original_format: ["newspaper"],
      ignored_block: { note: "the parsers must not read this" },
    },
    {
      id: "http://www.loc.gov/resource/sn00000002/1902-04-18/ed-1/?sp=1",
      url: "https://www.loc.gov/resource/sn00000002/1902-04-18/ed-1/?sp=1&q=%22the+lamps+went+out%22",
      title: "Image 1 of Orchard Daily Review (Orchard, Oregon), April 18, 1902",
      date: "1902-04-18",
      description: [PAGE_WITHOUT_WORDS],
      number_page: ["0000000001"],
      partof_title: ["orchard daily review (orchard, oregon) 1899-1911"],
      location_state: ["oregon"],
      contributor: ["orchard county library"],
      original_format: ["newspaper"],
    },
    // No address at all: a passage with nothing behind it cannot be cited.
    { title: "A page with no address", description: ["the lamps went out"] },
  ],
});

write("newspapers-empty.json", { pagination: paging(0, 2), results: [] });

write("item.json", {
  item: {
    id: "http://www.loc.gov/item/glass-orchard-1971/",
    url: "https://www.loc.gov/item/glass-orchard-1971/",
    title: "The Glass Orchard &amp; other <cite>records</cite>",
    date: "1971-06-04",
    contributor_names: ["Reame, Vashti, 1912-1988, author"],
    description: [
      "A field recording made across two winters in the salt country.",
      "Second paragraph of the description.",
    ],
    notes: ["Title devised by Library staff.", "Date from the accession record."],
    // The item route pairs a name with a link to it rather than writing the
    // name alone, and it does so in two different shapes.
    subjects: [
      { orchards: "https://www.loc.gov/example/orchards" },
      { "salt flats": "https://www.loc.gov/example/salt-flats" },
      { "field recordings": "https://www.loc.gov/example/field-recordings" },
    ],
    location: ["utah", "united states"],
    language: ["english"],
    partof: [
      { count: 57, title: "salt country archive", url: "https://www.loc.gov/example/archive" },
      { count: 4, title: "music division", url: "https://www.loc.gov/example/music" },
    ],
    repository: ["Library of Congress Music Division Washington, D.C. 20540 USA"],
    call_number: "ML 1234",
    rights_advisory: "No known restrictions on publication.",
    original_format: ["book"],
  },
  cite_this: {
    apa: "Reame, V. (1971) <cite>The Glass Orchard &amp; other records</cite>. Retrieved from the Library of Congress.",
    chicago: "Reame, Vashti. <cite>The Glass Orchard</cite>. 1971.",
  },
  resources: [
    {
      caption: "digital file from original",
      files: [[{ mimetype: "image/tiff", url: "https://tile.example.invalid/a.tif" }]],
      url: "https://www.loc.gov/resource/glass.orchard/",
      image: "https://tile.example.invalid/a_150px.jpg",
    },
  ],
  ignored_block: { note: "the parsers must not read this" },
});

/** A record the Library states no terms of use on. */
write("item-no-rights.json", {
  item: {
    id: "http://www.loc.gov/item/salt-flats-letters/",
    url: "https://www.loc.gov/item/salt-flats-letters/",
    title: "Letters from the Salt Flats",
    date: "1954",
    description: [],
  },
  resources: [],
});

/**
 * A record whose description runs long, which is what the offset argument on
 * get_item exists for. Lines are the boundary a resumed read lands on.
 */
write("item-long-description.json", {
  item: {
    id: "http://www.loc.gov/item/long-description/",
    url: "https://www.loc.gov/item/long-description/",
    title: "A record with a long description",
    date: "1900",
    description: Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} of the description.`),
  },
});

/** The site states a missing record in the body as well as in the status. */
write("item-missing.json", {
  status: 404,
  type: "exception",
  caption: "Not Found",
});

write("item-no-block.json", { timestamp: "fixture", options: {} });

write("collections.json", {
  pagination: paging(583, 2),
  results: [
    {
      id: "http://www.loc.gov/collections/salt-country-field-recordings/about-this-collection/",
      url: "https://www.loc.gov/collections/salt-country-field-recordings/about-this-collection/",
      title: "Salt Country Field Recordings",
      description: ["Recordings made in the salt country between 1928 and 1954."],
      count: 57,
      items: "https://www.loc.gov/collections/salt-country-field-recordings/",
      subject: ["music", "folklife"],
      item: { formats: ["audio", "manuscripts"] },
      ignored_block: { note: "the parsers must not read this" },
    },
    {
      id: "http://www.loc.gov/collections/orchard-photographs/",
      url: "https://www.loc.gov/collections/orchard-photographs/",
      title: "Orchard Photographs",
      description: [],
      items: "https://www.loc.gov/collections/orchard-photographs/",
      subject: [],
      item: {},
    },
    // No title: nothing here names a collection.
    { count: 3 },
  ],
});

write("collections-empty.json", { pagination: paging(0, 3), results: [] });

console.log("fixtures written to test/fixtures");
