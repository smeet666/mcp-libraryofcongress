# mcp-libraryofcongress

[![npm](https://img.shields.io/npm/v/mcp-libraryofcongress.svg)](https://www.npmjs.com/package/mcp-libraryofcongress)
[![CI](https://github.com/smeet666/mcp-libraryofcongress/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-libraryofcongress/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-libraryofcongress.svg)](LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.smeet666/mcp-libraryofcongress)
[![Glama](https://glama.ai/mcp/servers/smeet666/mcp-libraryofcongress/badges/score.svg)](https://glama.ai/mcp/servers/smeet666/mcp-libraryofcongress)

An MCP server for the [Library of Congress](https://www.loc.gov). **Search the
text scanned off digitised American newspaper pages**, search the catalogue by
kind of thing, read one record, and list the collections a curator built. No API
key, no account, no configuration.

_(Version française plus bas / French version below)_

## Quickstart

**One-click install**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=libraryofcongress&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1saWJyYXJ5b2Zjb25ncmVzcyJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=libraryofcongress&config=%7B%22name%22%3A%22libraryofcongress%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-libraryofcongress%22%5D%7D)

**Claude Code**

```bash
claude mcp add libraryofcongress -- npx -y mcp-libraryofcongress
```

**Claude Desktop, Cursor, and any client using the standard config format**

```json
{
  "mcpServers": {
    "libraryofcongress": {
      "command": "npx",
      "args": ["-y", "mcp-libraryofcongress"]
    }
  }
}
```

Node 20 or later.

**Bundle, without npm**

Download `mcp-libraryofcongress-<version>.mcpb` from
[the latest release](https://github.com/smeet666/mcp-libraryofcongress/releases/latest)
and open it. A client that supports MCP bundles installs it on its own, with no
npm and no configuration file to edit.

## Tools

| Tool                | What it does                                              | Key parameters                                            |
| ------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `search_newspapers` | Finds a phrase in the text of scanned newspaper pages.    | `query`, `location`, `publication`, `year_from`, `limit`  |
| `search_items`      | Searches one catalogue: books, photos, maps, audio, more. | `query`, `media_type`, `subject`, `location`, `year_from` |
| `get_item`          | Reads one record, section by section.                     | `identifier`, `sections`, `offset`                        |
| `list_collections`  | The digital collections, with the filter each one takes.  | `limit`, `page`, `searchable_only`                        |

The server is **read-only**. It uploads nothing and writes nothing back.

## Searching inside the newspapers is the point

A catalogue search reads titles, creators and descriptions. `search_newspapers`
reads what optical character recognition took off millions of scanned pages of
American newspapers, so it answers a question nothing else here can: _which
issue printed these words_. A match comes back with the paper, the date, the
leaf of the issue, the state it was published in, and an address that opens that
leaf with the query applied.

Double quotes change what the search matches, and the Library decides what they
mean: a matched page can carry the words apart or in another order rather than
the phrase as written, so an answer to a quoted query says so and points at the
page to read. What the quotes do to the number of matching pages is the
Library's own business and varies from one query to the next: measured against
the corpus, quoting divides the count by a hundred on some queries, moves it by
a few per cent on others, and raises it above the unquoted count on others
again. The count is therefore no evidence that the phrase was printed anywhere,
and both forms are worth asking.

The corpus spans every state and a century and a half, so a bare phrase reaches
a great deal that a question did not ask for. Three arguments narrow it:
`location` keeps to papers published in one state, `publication` to a single
paper, and `year_from` with `year_to` to a span of years. Each takes the wording
the Library itself uses, which every match carries: `state` on a row is what
`location` expects, and `publication` on a row is what `publication` expects.
Asking `search_items` with `media_type: "newspapers"` lists the papers
themselves, and a title there is the wording too.

```
search_newspapers(
  query: '"ellis island" immigration',
  location: "new york",
  publication: "new-york tribune (new york [n.y.]) 1866-1924",
  year_from: 1900, year_to: 1910
)
```

A filter the corpus does not recognise matches nothing, and an empty answer
would read as the Library holding no such page. The search is asked again
without the narrowing instead, and a note says what was set aside.

### Three things it will not pretend to know

**`total` counts pages, and it pages.** It is the number of newspaper leaves
that match, and it is not a count of how many times the words occur. Ask for
page 2, 3 and so on rather than treating the first answer as the whole of it.

**An excerpt is sometimes the opening of the page.** The Library returns the
beginning of a page's text with each row rather than the whole page, so the
searched words are often further down than that text reaches. Every match
carries `excerpt_kind`, and every excerpt is labelled with it in the text block:

- **`passage`**, the text around the words that matched, centred on them.
- **`page_opening`**, the start of the leaf, sent because the text that came
  back stops before the searched words appear. It does not carry the match, so
  quoting it quotes something else. The notes count how many there are, and
  `source_url` opens the leaf with the query applied.

**Scanned text is machine-read.** Excerpts carry the misreadings that come with
it. Quote them as scanned text and link the page.

## One catalogue per kind of thing

`search_items` requires `media_type`, because the Library keeps a separate
catalogue for each kind of thing: `books`, `photos`, `maps`, `audio`,
`film-and-videos`, `manuscripts`, `notated-music`, `newspapers`. There is no
address that asks all of them at once, and one title can exist in several.

Narrowing is typed rather than free text: `year_from`, `year_to`, `subject`,
`location`, `language`, `collection`, `online_only`, `sort`. A filter that
matches nothing is set aside, the search is asked again without it, and the
answer names what was dropped, so a narrowing that spelled a subject the Library
words differently is reported as a spelling that found nothing rather than as
the Library holding nothing on it. Every sentence carrying the count then names
the search without the filter, since that is the search the rows and the count
come from.

By default only material with a digitised copy comes back. `online_only: false`
takes in the records the Library holds on a shelf alone.

**The catalogue index holds no word of a single letter.** A query made only of
such words matches nothing whatever the Library holds, and the same query with
one longer word beside them returns exactly what that longer word returns alone.
`search_items` refuses it as invalid input and names the reason, since a count
of zero would read as a statement about the collection. A word written as one
character, as Han, Japanese and Korean script write many, is a word the index
does hold, and it is searched as it stands. The full-text index behind
`search_newspapers` is a different index and does hold single characters,
answering each with a set of its own, so `search_newspapers` searches for one
rather than refusing it.

## Reading a record, and finding a corpus

`get_item` takes one identifier. An identifier can carry slashes: a single
newspaper issue is named by its paper, its date and its edition together, as in
`sn83045462/1929-02-03/ed-1`. Sections are opt-in, `basic`, `citations`,
`resources` and `full_metadata`, because the served copies of a scan and the
full field list are each larger than the record they describe. A long
description paginates by character offset and resumes at a line boundary: when
`next_offset` is not null, call again with `offset` set to it.

**A malformed identifier is refused rather than answered.** An identifier that
climbs out of the item route, or one carrying a control character, is
`invalid_input` before any address is built. The refusal for a control character
names no identifier: those characters are the ones a terminal, a log and a chat
window do not draw, so printing the value back would show a different spelling
from the one that was sent.

**The same words are not returned twice.** The Library assembles the description
of some records by running the notes it holds on them together. A note whose
words the description already carries is left to the description, so
`notes_on_record` holds what the description does not.

**A row says whether it is a record or a collection.** A catalogue search
returns, beside its records, the corpora a curator gathered and named, and the
Library's count of what matches counts them in. Such a row carries
`is_collection: true`, its `identifier` is null because the item route holds
nothing at a collection's address, and `source_url` opens the collection. A row
carrying no identifier says so where the others print theirs, and the notes
count both kinds.

**A cataloguing code is not a date.** Where the Library has established no date
it files a record under a code standing in for the digits, `uuuu` for an unknown
year and `18??` for a year known only to its century. `date` and `year` are null
for such a record, `date_code` carries the code under a name saying what it is,
and the notes say no date has been established.

**A date carries only the precision the record supports.** The catalogue files
every record under one sortable date and fills what the record leaves unsaid: a
record whose own words say `1925` is filed at `1925-01-01`, and a piece of a
series is filed at the opening of the span the series covers. `date` is cut back
to the precision those words support, in a catalogue row as in a record read on
its own: the filed value is kept whole only where the words name the month it is
filed under, so a photograph the record dates `1934 May 8.` and the catalogue
files at `1934-01-01` comes back as `1934`. A month word counts only where a day
or a year stands beside it, and a year with two digits after a hyphen names a
month only when that year is the one the record is filed under, so `1908-09`
beside a record filed at 1908 reads as 1908 to 1909. `date_stated` repeats the
words themselves, and a record whose words
write out a span of years and open it on the filed year carries a note saying
that `date` and `year` are where the catalogue sorts it. A year the words state
outright is a date of the record, whatever ranges sit beside it.

`list_collections` shows the bodies of material a curator chose, described and
published together, so a caller can see what is there before searching. Each row
carries `collection_filter`, the wording `search_items` takes as its
`collection` argument, beside `searchable_media_types`, the catalogues that
filter can be sent to. The Library gathers kinds of thing the catalogue search
is not divided into, web archives and periodicals among them: such a collection
names no `media_type`, says so with an empty list, and `searchable_only` leaves
those rows out. The corpus runs to hundreds of collections and pages: the answer
offers the next page only where the Library has one, says when the last has been
reached and how many pages the corpus runs to at the size asked for, and reads a
page past the last as an empty page of a corpus that exists. `page` stops at
100, so at a small `limit` the answer says how many collections that ceiling
reaches and that raising `limit` brings the rest within reach.

## What the answers claim

**A failure is never an empty result.** A refused request is `invalid_input`, an
unreadable answer is `parse_failure`, and only a genuinely empty record is an
absence. Silence about a failure becomes "there is none" in the mouth of a
model, which is a false statement about the world.

**A null is never printed as a value.** A record with no stated terms of use
reports null and says that silence is not permission.

**A count is named for what it counts.** The site reports the number of results
and the number of pages under names that read alike, and one is the other
multiplied by the page size. Only the count of results is ever published as a
total.

**Every answer carries a link back**, and the notes that qualify an answer reach
the text block, so a client that renders only text still reads them. Text
published by someone else cannot imitate this server's own lines.

## Rights

Metadata from the Library of Congress is in the public domain. The material it
describes is not always: rights vary per deposit and are often unstated. A
record reports the terms it carries, and a record carrying none is not a record
granting permission. Credit the Library of Congress and link what you use.

## Configuration

Every variable is optional. Set them in the `env` block of your MCP client.

| Variable                   | Default  | Purpose                                                                                                                                                   |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOC_USER_AGENT`           | _(none)_ | Identify your own client. The project's identifier is appended, so the Library can reach a human.                                                         |
| `LOC_MIN_INTERVAL_MS`      | `6000`   | Minimum gap between requests. Values below 3000 ms are refused, as are values above 60000.                                                                |
| `LOC_TIMEOUT_MS`           | `30000`  | Per-request deadline for the catalogue, the records and the collections. Accepted between 1000 and 120000.                                                |
| `LOC_NEWSPAPER_TIMEOUT_MS` | `90000`  | Per-request deadline for `search_newspapers`, which reads the text of millions of pages and answers in tens of seconds. Accepted between 1000 and 300000. |
| `LOC_MAX_RETRIES`          | `3`      | Retries on rate limiting and transient errors, up to 8.                                                                                                   |
| `LOC_CACHE_TTL_MS`         | `900000` | In-memory cache lifetime. `0` turns it off.                                                                                                               |
| `LOC_CACHE_MAX_ENTRIES`    | `200`    | In-memory cache size, up to 5000.                                                                                                                         |
| `LOC_LOG_LEVEL`            | `error`  | `silent`, `error`, `info` or `debug`. Logs go to stderr.                                                                                                  |

A value outside its range is refused with a line on stderr and the default
stands, so a typo in one variable takes away no tool.

## How this server treats the Library

The Library publishes two ceilings: twenty requests a minute for the JSON
responses and ten a minute across the site. This server takes the lower of the
two, which is one request every six seconds, and holds that floor whether the
setting arrives from the environment or from a configuration object handed to
the published client. Answers therefore take a few seconds; a repeated question
is served from memory. It sends one request at a time, caches what it reads, and
identifies itself with an address a human can be reached at. A caller may say
who they are; that address is appended rather than replaced.

The site's robots file disallows `/search` for every client and asks for five
seconds between requests. No address this server builds reaches that path, and
the spacing it keeps is wider than the one asked for. The site returns links
into `/search` inside its facet blocks, and those links are read as labels
rather than followed.

## Using the client on its own

The layer that talks to the site imports nothing from the protocol and is
published separately, with the pacing, the cache and the error taxonomy
attached.

```ts
import { LocClient } from "mcp-libraryofcongress/client";

const client = new LocClient();
const { data } = await client.searchNewspapers('"cure for influenza"', 5, 1, {
  maxChars: 300,
  maxCount: 2,
});
console.log(data.paging.resultCount, data.hits[0]?.sourceUrl);
```

## Troubleshooting

**`rate_limited`.** The site asked this client to slow down, or this server was
asked for more than its pacing allows. It says nothing about whether the Library
holds what you asked for. Wait and ask again.

**`parse_failure`.** A response arrived in a shape this server cannot read,
which includes a long answer cut off in transit. It usually means a route
changed. Please
[open an issue](https://github.com/smeet666/mcp-libraryofcongress/issues) with
the arguments you used.

**`not_found`.** The site answered, and holds nothing at that address.

**An empty catalogue search.** Check `media_type`: one title exists across
several kinds of thing, and each is a catalogue of its own. A phrase printed
inside a newspaper belongs in `search_newspapers`.

## Development

```bash
npm install
npm test                 # unit tests, no network
npm run typecheck
npm run build
LOC_LIVE=1 npm run test:live   # one request per route against the real site
npm run inspector        # explore the tools in the MCP Inspector
```

Fixtures are generated rather than captured: `npm run build:fixtures` writes a
corpus of invented titles and passages, so tests are deterministic and no
Library content lives in this repository. Anything touching time runs on a fake
clock pinned to a fixed instant.

The access layer under `src/loc` does not import the MCP SDK and is published
separately as `mcp-libraryofcongress/client`, usable as a plain library.

## Contributing

Bugs, questions and ideas all belong in
[the issue tracker](https://github.com/smeet666/mcp-libraryofcongress/issues).
Pull requests are welcome; please open an issue first so we can agree on what
the right answer is before you write it. [CONTRIBUTING.md](CONTRIBUTING.md) has
the detail, and [SECURITY.md](SECURITY.md) covers anything exploitable.

## Support

Free, and it stays free. If it saved you some time, you can
[buy me a coffee](https://buymeacoffee.com/smeet666).

## License

MIT. See [LICENSE](LICENSE). The licence covers this source code only, not the
material retrieved through it, which carries whatever terms its depositor
attached, and often none at all.

This is an unofficial project, with no affiliation to or endorsement by the
Library of Congress.

---

# mcp-libraryofcongress (français)

Un serveur MCP pour la [Library of Congress](https://www.loc.gov). **Cherchez
une phrase dans le texte des pages de journaux américains numérisées**,
parcourez le catalogue par type de document, lisez une fiche, et listez les
collections construites par un conservateur. Sans clé d'API, sans compte, sans
configuration.

## Démarrage rapide

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=libraryofcongress&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1saWJyYXJ5b2Zjb25ncmVzcyJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=libraryofcongress&config=%7B%22name%22%3A%22libraryofcongress%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-libraryofcongress%22%5D%7D)

**Claude Code**

```bash
claude mcp add libraryofcongress -- npx -y mcp-libraryofcongress
```

**Claude Desktop, Cursor, et tout client utilisant le format standard**

```json
{
  "mcpServers": {
    "libraryofcongress": {
      "command": "npx",
      "args": ["-y", "mcp-libraryofcongress"]
    }
  }
}
```

Node 20 ou plus récent.

**Bundle, sans npm**

Téléchargez `mcp-libraryofcongress-<version>.mcpb` depuis
[la dernière release](https://github.com/smeet666/mcp-libraryofcongress/releases/latest)
et ouvrez-le. Un client compatible l'installe seul, sans npm ni fichier de
configuration à modifier.

## Outils

| Outil               | Rôle                                                              | Paramètres principaux                                     |
| ------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| `search_newspapers` | Trouve une phrase dans le texte des pages de journaux numérisées. | `query`, `location`, `publication`, `year_from`, `limit`  |
| `search_items`      | Cherche un catalogue : livres, photos, cartes, sons, et le reste. | `query`, `media_type`, `subject`, `location`, `year_from` |
| `get_item`          | Lit une fiche, section par section.                               | `identifier`, `sections`, `offset`                        |
| `list_collections`  | Les collections numériques, avec le filtre que chacune accepte.   | `limit`, `page`, `searchable_only`                        |

Le serveur est **en lecture seule**. Il ne téléverse rien et n'écrit rien.

## Chercher dans les journaux est le cœur du sujet

Une recherche de catalogue lit les titres, les auteurs et les descriptions.
`search_newspapers` lit ce que la reconnaissance de caractères a tiré de
millions de pages de journaux américains numérisées, et répond donc à une
question qu'aucun autre outil ici ne sait traiter : _quel numéro a imprimé ces
mots_. Une correspondance revient avec le journal, la date, le feuillet du
numéro, l'État de publication, et une adresse qui ouvre ce feuillet avec la
requête appliquée.

Les guillemets doubles changent ce que la recherche retient, et c'est la Library
qui décide de ce qu'ils veulent dire : une page retenue peut porter les mots
éloignés les uns des autres ou dans un autre ordre plutôt que la phrase telle
qu'elle est écrite. La réponse à une requête entre guillemets le dit et renvoie
à la page à lire. Ce que les guillemets font au nombre de pages retenues
appartient à la Library et varie d'une requête à l'autre : mesuré sur le corpus,
le compte est divisé par cent sur certaines requêtes, bouge de quelques pour
cent sur d'autres, et dépasse le compte sans guillemets sur d'autres encore. Ce
compte ne prouve donc pas que la phrase ait été imprimée quelque part, et les
deux formes valent d'être posées.

Le corpus couvre tous les États et un siècle et demi : une phrase seule ramène
donc beaucoup de choses que la question ne demandait pas. Trois arguments la
resserrent : `location` limite aux journaux publiés dans un État, `publication`
à un seul titre, et `year_from` avec `year_to` à une plage d'années. Chacun
prend la formulation de la Bibliothèque, que chaque correspondance porte : le
champ `state` d'une ligne est ce qu'attend `location`, et son champ
`publication` est ce qu'attend `publication`. `search_items` avec
`media_type: "newspapers"` liste les journaux eux-mêmes, et un titre y est aussi
la formulation attendue.

```
search_newspapers(
  query: '"ellis island" immigration',
  location: "new york",
  publication: "new-york tribune (new york [n.y.]) 1866-1924",
  year_from: 1900, year_to: 1910
)
```

Un filtre que le corpus ne reconnaît pas ne correspond à rien, et une réponse
vide se lirait comme une Bibliothèque ne détenant aucune page de ce genre. La
recherche est donc relancée sans le resserrement, et une note dit ce qui a été
écarté.

### Trois choses qu'il refuse de prétendre savoir

**`total` compte des pages, et il se pagine.** C'est le nombre de feuillets qui
correspondent, pas un nombre d'occurrences. Demandez la page 2, la page 3, plutôt
que de prendre la première réponse pour la totalité.

**Un extrait est parfois le début de la page.** La Library renvoie le début du
texte d'une page avec chaque ligne de résultat plutôt que la page entière, si
bien que les mots cherchés se trouvent souvent plus bas que ce texte ne va.
Chaque correspondance porte `excerpt_kind`, et chaque extrait en porte
l'étiquette dans le bloc de texte :

- **`passage`** : le texte autour des mots correspondants, centré sur eux.
- **`page_opening`** : le début du feuillet, renvoyé parce que le texte reçu
  s'arrête avant que les mots cherchés n'apparaissent. Il ne porte pas la
  correspondance, donc le citer revient à citer autre chose. Les notes comptent
  combien il y en a, et `source_url` ouvre le feuillet avec la requête
  appliquée.

**Le texte numérisé est lu par une machine.** Les extraits en portent les
fautes. Citez-les comme tels et suivez le lien.

## Un catalogue par type de document

`search_items` exige `media_type`, car la Library tient un catalogue distinct
pour chaque type de document : `books`, `photos`, `maps`, `audio`,
`film-and-videos`, `manuscripts`, `notated-music`, `newspapers`. Aucune adresse
ne les interroge tous à la fois, et un même titre peut exister dans plusieurs.

Le filtrage est typé plutôt que textuel : `year_from`, `year_to`, `subject`,
`location`, `language`, `collection`, `online_only`, `sort`. Un filtre qui ne
correspond à rien est mis de côté, la recherche est relancée sans lui, et la
réponse nomme ce qui a été écarté : une orthographe différente de celle de la
Library est ainsi signalée comme telle, et non comme un fonds vide. Chaque
phrase qui porte le total nomme alors la recherche sans le filtre, puisque c'est
d'elle que viennent les lignes et le compte.

Par défaut, seuls les documents disposant d'une copie numérisée reviennent.
`online_only: false` inclut les fiches que la Library ne conserve qu'en rayon.

**L'index du catalogue ne retient aucun mot d'une seule lettre.** Une requête
composée uniquement de tels mots ne correspond à rien, quoi que la Library
détienne, et la même requête accompagnée d'un mot plus long rend exactement ce
que ce mot rend seul. `search_items` la refuse en `invalid_input` en donnant la
raison, car un total de zéro se lirait comme une affirmation sur le fonds. Un
mot qui s'écrit d'un seul caractère, comme les écritures han, japonaise et
coréenne en comptent beaucoup, est un mot que l'index retient : il est cherché
tel quel. L'index plein texte derrière `search_newspapers` est un autre index,
qui retient bel et bien les caractères isolés et répond à chacun par un ensemble
qui lui est propre : `search_newspapers` cherche un tel caractère au lieu de le
refuser.

## Lire une fiche, et trouver un corpus

`get_item` prend un identifiant. Un identifiant peut contenir des barres
obliques : un numéro de journal se nomme par son titre, sa date et son édition
réunis, comme `sn83045462/1929-02-03/ed-1`. Les sections sont facultatives,
`basic`, `citations`, `resources` et `full_metadata`, car les copies servies d'un
scan et la liste complète des champs pèsent chacune plus lourd que la fiche
qu'elles décrivent. Une description longue se pagine par décalage de caractères
et reprend à une fin de ligne : quand `next_offset` n'est pas nul, rappelez
l'outil avec `offset` réglé sur cette valeur.

**Un identifiant mal formé est refusé, pas répondu.** Un identifiant qui sort de
la route des fiches, ou qui porte un caractère de contrôle, est `invalid_input`
avant qu'aucune adresse ne soit construite. Le refus lié à un caractère de
contrôle ne cite aucun identifiant : ces caractères sont ceux qu'un terminal, un
journal ou une fenêtre de discussion ne dessinent pas, et le réimprimer
montrerait une graphie différente de celle qui a été envoyée.

**Les mêmes mots ne sont pas rendus deux fois.** La Library compose la
description de certaines fiches en mettant bout à bout les notes qu'elle tient
sur elles. Une note dont la description porte déjà les mots est laissée à la
description : `notes_on_record` tient ce que la description ne porte pas.

**Une ligne dit si elle est une fiche ou une collection.** Une recherche
catalogue rend, à côté de ses fiches, les corpus qu'un conservateur a réunis et
nommés, et le compte que la Library publie les inclut. Une telle ligne porte
`is_collection: true`, son `identifier` est null parce que la route des fiches
ne détient rien à l'adresse d'une collection, et `source_url` l'ouvre. Une ligne
sans identifiant l'énonce là où les autres impriment le leur, et les notes
comptent les deux cas.

**Un code de catalogage n'est pas une date.** Là où la Library n'a établi
aucune date, elle range la fiche sous un code qui tient lieu de chiffres :
`uuuu` pour une année inconnue, `18??` pour une année connue au siècle près.
`date` et `year` sont null pour une telle fiche, `date_code` porte le code sous
un nom qui dit ce qu'il est, et les notes disent qu'aucune date n'est établie.

**Une date ne porte que la précision que la fiche soutient.** Le catalogue range
chaque fiche sous une date unique et comble ce que la fiche laisse de côté : une
fiche dont les mots disent `1925` est rangée au `1925-01-01`, et une pièce d'un
fonds est rangée à l'ouverture de la période que ce fonds couvre. `date` est
ramenée à la précision que ces mots soutiennent, dans une ligne de résultat
comme dans une fiche lue seule : la valeur de rangement n'est gardée entière que
si les mots nomment le mois sous lequel la fiche est rangée, si bien qu'une
photographie que la fiche date du `1934 May 8.` et que le catalogue range au
`1934-01-01` revient en `1934`. Un nom de mois ne compte que si un jour ou une
année l'accompagne, et une année suivie de deux chiffres après un tiret ne nomme
un mois que si cette année est celle du rangement : `1908-09` à côté d'une fiche
rangée en 1908 se lit 1908 à 1909. `date_stated` reprend les mots eux-mêmes, et une
fiche dont les mots écrivent une période et l'ouvrent sur l'année de rangement
porte une note disant que `date` et `year` sont l'endroit où le catalogue la
classe. Une année que les mots énoncent en toutes lettres est une date de la
fiche, quelles que soient les fourchettes qui l'accompagnent.

`list_collections` montre les ensembles qu'un conservateur a choisis, décrits et
publiés ensemble, pour voir ce qui existe avant de chercher. Chaque ligne porte
`collection_filter`, la formulation exacte que `search_items` accepte dans son
argument `collection`, et `searchable_media_types`, les catalogues auxquels ce
filtre peut être adressé. La Library réunit des types de documents que la
recherche catalogue ne découpe pas, les archives du web et les périodiques parmi
eux : une telle collection ne nomme aucun `media_type`, le dit par une liste
vide, et `searchable_only` écarte ces lignes. Le corpus compte plusieurs
centaines de collections et se pagine : la réponse ne propose la page suivante
que là où la Library en a une, dit quand la dernière est atteinte et sur combien
de pages le corpus court à la taille demandée, et lit une page au-delà de la
dernière comme une page vide d'un corpus qui existe. `page` s'arrête à 100 :
à faible `limit`, la réponse dit combien de collections ce plafond atteint et
que relever `limit` met le reste à portée.

## Ce que les réponses affirment

**Un échec n'est jamais un résultat vide.** Une requête refusée est
`invalid_input`, une réponse illisible est `parse_failure`, et seule une fiche
réellement vide est une absence. Taire un échec revient à faire dire « il n'y en
a pas » à un modèle, ce qui est une affirmation fausse sur le monde.

**Un vide n'est jamais imprimé comme une valeur.** Une fiche sans conditions
d'usage renvoie null et précise que ce silence n'est pas une autorisation.

**Un compteur porte le nom de ce qu'il compte.** Le site publie le nombre de
résultats et le nombre de pages sous des noms qui se ressemblent, et l'un est
l'autre multiplié par la taille de page. Seul le nombre de résultats est publié
comme total.

**Chaque réponse porte son lien**, et les notes qui la nuancent atteignent le
bloc de texte, pour qu'un client qui n'affiche que du texte les lise aussi. Un
texte publié par un tiers ne peut pas imiter les lignes propres au serveur.

## Droits

Les métadonnées de la Library of Congress sont dans le domaine public. Les
documents décrits ne le sont pas toujours : les droits varient selon le dépôt et
sont souvent tus. Une fiche indique les conditions qu'elle porte, et une fiche
qui n'en porte aucune n'accorde rien. Créditez la Library of Congress et liez ce
que vous utilisez.

## Configuration

Toutes les variables sont optionnelles, à déclarer dans le bloc `env` de votre
client.

| Variable                   | Défaut    | Rôle                                                                                                                                               |
| -------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOC_USER_AGENT`           | _(aucun)_ | Identifiez votre client. L'identifiant du projet est ajouté, pour que la Library puisse joindre une personne.                                      |
| `LOC_MIN_INTERVAL_MS`      | `6000`    | Écart minimal entre requêtes. En dessous de 3000 ms et au-dessus de 60000 ms, la valeur est refusée.                                               |
| `LOC_TIMEOUT_MS`           | `30000`   | Délai par requête pour le catalogue, les fiches et les collections. Accepté entre 1000 et 120000.                                                  |
| `LOC_NEWSPAPER_TIMEOUT_MS` | `90000`   | Délai par requête pour `search_newspapers`, qui lit le texte de millions de pages et répond en dizaines de secondes. Accepté entre 1000 et 300000. |
| `LOC_MAX_RETRIES`          | `3`       | Tentatives en cas de limitation ou d'erreur passagère, jusqu'à 8.                                                                                  |
| `LOC_CACHE_TTL_MS`         | `900000`  | Durée de vie du cache mémoire. `0` le désactive.                                                                                                   |
| `LOC_CACHE_MAX_ENTRIES`    | `200`     | Taille du cache mémoire, jusqu'à 5000.                                                                                                             |
| `LOC_LOG_LEVEL`            | `error`   | `silent`, `error`, `info` ou `debug`. Sortie sur stderr.                                                                                           |

Une valeur hors bornes est refusée avec une ligne sur stderr et le défaut
s'applique : une faute de frappe dans une variable ne retire aucun outil.

## Ce que ce serveur doit à la Library

La Library publie deux plafonds : vingt requêtes par minute pour les réponses
JSON, et dix par minute sur l'ensemble du site. Ce serveur retient le plus bas
des deux, soit une requête toutes les six secondes, et tient ce plancher que le
réglage vienne de l'environnement ou d'un objet de configuration passé au client
publié. Les réponses prennent donc quelques secondes ; une question répétée est
servie depuis la mémoire. Il n'envoie qu'une requête à la fois, met en cache ce
qu'il lit, et s'identifie avec une adresse où joindre une personne. Un appelant
peut dire qui il est ; cette adresse est ajoutée, pas remplacée.

Le fichier robots du site interdit `/search` à tout client et demande cinq
secondes entre les requêtes. Aucune adresse construite ici n'atteint ce chemin,
et l'écart tenu est plus large que celui demandé. Le site renvoie des liens vers
`/search` dans ses blocs de facettes : ils sont lus comme des étiquettes, jamais
suivis.

## Utiliser le client seul

La couche qui parle au site n'importe rien du protocole et est publiée
séparément, avec la cadence, le cache et la taxonomie d'erreurs.

```ts
import { LocClient } from "mcp-libraryofcongress/client";

const client = new LocClient();
const { data } = await client.searchNewspapers('"cure for influenza"', 5, 1, {
  maxChars: 300,
  maxCount: 2,
});
console.log(data.paging.resultCount, data.hits[0]?.sourceUrl);
```

## Dépannage

**`rate_limited`.** Le site demande à ce client de ralentir, ou ce serveur a été
sollicité au-delà de sa cadence. Cela ne dit rien de ce que la Library conserve.
Attendez et redemandez.

**`parse_failure`.** Une réponse est arrivée dans une forme illisible pour ce
serveur, ce qui inclut une réponse longue coupée en transit. En général, une
route a changé. Merci
[d'ouvrir une issue](https://github.com/smeet666/mcp-libraryofcongress/issues)
avec les arguments utilisés.

**`not_found`.** Le site a répondu, et ne conserve rien à cette adresse.

**Une recherche catalogue vide.** Vérifiez `media_type` : un même titre existe
sous plusieurs types de document, et chacun est un catalogue à part. Une phrase
imprimée dans un journal relève de `search_newspapers`.

## Développement

```bash
npm install
npm test                 # tests unitaires, sans réseau
npm run typecheck
npm run build
LOC_LIVE=1 npm run test:live   # une requête par route sur le vrai site
npm run inspector        # explorer les outils dans le MCP Inspector
```

Les fixtures sont générées, pas capturées : `npm run build:fixtures` écrit un
corpus de titres et de passages inventés, ce qui rend les tests déterministes et
évite de stocker du contenu de la Library dans ce dépôt. Tout ce qui touche au
temps tourne sur une horloge figée à un instant fixe.

La couche d'accès sous `src/loc` n'importe pas le SDK MCP et est publiée
séparément sous `mcp-libraryofcongress/client`, utilisable comme bibliothèque.

## Contribuer

Bugs, questions et idées vont dans
[le suivi d'issues](https://github.com/smeet666/mcp-libraryofcongress/issues).
Les pull requests sont bienvenues ; ouvrez d'abord une issue pour qu'on
s'accorde sur la bonne réponse avant que vous n'écriviez le code.

## Soutenir

Gratuit, et ça le reste. Si ça vous a fait gagner du temps, vous pouvez
[m'offrir un café](https://buymeacoffee.com/smeet666).

## Licence

MIT, voir [LICENSE](LICENSE). La licence couvre uniquement ce code source, pas
les documents récupérés par son intermédiaire, qui portent les conditions que
leur déposant y a attachées, et souvent aucune.

Projet non officiel, sans affiliation à la Library of Congress ni approbation de
sa part.
