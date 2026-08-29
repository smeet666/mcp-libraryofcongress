# mcp-libraryofcongress

[![npm](https://img.shields.io/npm/v/mcp-libraryofcongress.svg)](https://www.npmjs.com/package/mcp-libraryofcongress)
[![CI](https://github.com/smeet666/mcp-libraryofcongress/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-libraryofcongress/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-libraryofcongress.svg)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.smeet666/mcp-libraryofcongress)
[![Glama](https://glama.ai/mcp/servers/smeet666/mcp-libraryofcongress/badges/score.svg)](https://glama.ai/mcp/servers/smeet666/mcp-libraryofcongress)
[![M8ven](https://m8ven.ai/badge/mcp/smeet666-mcp-libraryofcongress-1rr3lc?variant=verified)](https://m8ven.ai/mcp/smeet666-mcp-libraryofcongress-1rr3lc)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=libraryofcongress&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1saWJyYXJ5b2Zjb25ncmVzcyJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=libraryofcongress&config=%7B%22name%22%3A%22libraryofcongress%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-libraryofcongress%22%5D%7D)

<!-- m8ven-verify: 69c0541bf1d6a6e94b450b4d2b058659 -->

The [Library of Congress](https://www.loc.gov) is the national library of the
United States, and it publishes a large part of its holdings online: books,
photographs, maps, sound recordings, manuscripts, and the pages of American
newspapers going back to the eighteenth century. The newspaper pages have been
scanned and run through optical character recognition, so the words printed on
them can be searched. Curators also gather material into digital collections,
each described and published as a body of its own.

This server connects a chat client to that library. You can search the words
printed inside the newspapers, search the catalogue by title, creator, subject,
place or language, read one record with its rights statement and where the
original is held, and list the digital collections. It needs no API key and no
account.

_[Version française](#mcp-libraryofcongress-français)_

---

## Install

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

Node 24 or later is required, and no environment variable has to be set.

### With Docker

```json
{
  "mcpServers": {
    "libraryofcongress": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-libraryofcongress:3.0.0"]
    }
  }
}
```

`-i` keeps stdin open, which is where the protocol travels, and `-t` is left out
because a TTY rewrites the stream. The container needs outbound HTTPS to
`www.loc.gov` and `chroniclingamerica.loc.gov`, and nothing else: no volume, no
port, no credential.

### Bundle, without npm

Download `mcp-libraryofcongress-3.0.0.mcpb` from
[the latest release](https://github.com/smeet666/mcp-libraryofcongress/releases/latest)
and open it. A client that supports MCP bundles installs it on its own, with no
npm and no configuration file to edit. The bundle carries its dependencies, so
nothing is fetched at install time.

## What you can ask

- "What did Oklahoma newspapers write about the 1907 statehood vote?"
- "Find me photographs of Chicago tenements before 1920."
- "Read that record and tell me who holds the original."
- "What digital collections are there on the Civil War?"
- "Can I reuse that photograph?"

The ordinary path runs from a search to a record: a row carries an `identifier`,
and `get_item` reads it.

## Tools

| Tool                | What it does                                                          |
| ------------------- | --------------------------------------------------------------------- |
| `search_newspapers` | Searches the words printed inside scanned newspaper pages.            |
| `search_items`      | Searches the catalogue by title, creator, subject, place or language. |
| `get_item`          | Reads one record, its rights and where the original is held.          |
| `list_collections`  | Lists the digital collections curators published.                     |

### `search_newspapers`

Searches the text of scanned newspaper pages, which came off the page through
optical character recognition.

| Argument                 | Type                               | Required | What it does                        |
| ------------------------ | ---------------------------------- | -------- | ----------------------------------- |
| `query`                  | string, 1 to 300 characters        | yes      | The words to look for on the pages. |
| `location`               | string, up to 120 characters       | no       | A place the paper was published in. |
| `publication`            | string, up to 200 characters       | no       | One newspaper.                      |
| `year_from`              | integer, 1000 to 9999              | no       | Earliest year, inclusive.           |
| `year_to`                | integer, 1000 to 9999              | no       | Latest year, inclusive.             |
| `limit`                  | integer, 1 to 25, default `10`     | no       | Matches to serve.                   |
| `page`                   | integer, 1 to 100, default `1`     | no       | Which page of matches.              |
| `max_excerpt_chars`      | integer, 80 to 1200, default `300` | no       | How much of a passage to serve.     |
| `max_excerpts_per_match` | integer, 1 to 10, default `3`      | no       | Passages served per matching page.  |

**In return:** `hits`, each carrying `identifier`, which `get_item` takes;
`title`; `creator`, which is the library that contributed the scan; `year`;
`page_number`, the leaf within the issue; `published_on`; `publication` with the
years the paper ran; `state`; `excerpts`; and `excerpt_kind`.

**`excerpt_kind` decides what an excerpt is worth.** A `passage` is the text
around the words that matched, centred on them. A `page_opening` is the start of
the leaf, sent because the text the Library returned with the row stops before
those words appear: it does not carry the match, so quoting it quotes something
else, and `source_url` opens the leaf with the query applied. **`total` counts
newspaper leaves, and it pages:** it is never a count of how many times the words
occur.

### `search_items`

Searches the catalogue, one kind of thing at a time.

| Argument      | Type                                                              | Required | What it does                                    |
| ------------- | ----------------------------------------------------------------- | -------- | ----------------------------------------------- |
| `query`       | string, 1 to 300 characters                                       | yes      | Words to look for.                              |
| `media_type`  | `books`, `photos`, `maps`, `audio`, `manuscripts` or `newspapers` | no       | The catalogue to read.                          |
| `year_from`   | integer, 1000 to 9999                                             | no       | Earliest year, inclusive.                       |
| `year_to`     | integer, 1000 to 9999                                             | no       | Latest year, inclusive.                         |
| `subject`     | string, up to 120 characters                                      | no       | A subject heading.                              |
| `location`    | string, up to 120 characters                                      | no       | A place.                                        |
| `language`    | string, up to 120 characters                                      | no       | A language, written in English.                 |
| `collection`  | string, up to 160 characters                                      | no       | One collection, as `list_collections` names it. |
| `online_only` | boolean, default `true`                                           | no       | Keep the records available online.              |
| `sort`        | `relevance`, `newest`, `oldest` or `title`, default `relevance`   | no       | How the rows are ordered.                       |
| `limit`       | integer, 1 to 50, default `10`                                    | no       | Rows to serve.                                  |
| `page`        | integer, 1 to 100, default `1`                                    | no       | Which page of rows.                             |

**In return:** `items`, each carrying `identifier`, `title`, `creator`, `year`,
`date` as published, which is often a range, `is_collection` and `source_url`.
The Library keeps one catalogue per kind of thing, so a search without
`media_type` reads the general one, and `total` counts the records matching
there.

### `get_item`

Reads one record. The heavier parts are asked for rather than served by default,
and a long description paginates.

| Argument                | Type                                                                             | Required | What it does                          |
| ----------------------- | -------------------------------------------------------------------------------- | -------- | ------------------------------------- |
| `identifier`            | string, 1 to 300 characters                                                      | yes      | The identifier a row carries.         |
| `sections`              | array of `basic`, `citations`, `resources`, `full_metadata`, default `["basic"]` | no       | Which parts to return.                |
| `offset`                | integer, 0 or more, default `0`                                                  | no       | Where to resume the description.      |
| `max_description_chars` | integer, 200 to 20000, default `2000`                                            | no       | How much of the description to serve. |

**In return:** the record with its `title`, `creator`, `year`, `date`, `format`
and `source_url`, plus `description`, `subjects`, `location`, `language`,
`part_of` for the collections and divisions it sits in, `repository` naming where
the original is held, `call_number` and `rights`. A field the record leaves empty
is `null`. `next_offset` continues a long description and is `null` at the end.
An identifier can carry slashes: a single newspaper issue is named by its paper,
its date and its edition together.

### `list_collections`

Lists the digital collections, bodies of material a curator chose, described and
published together.

| Argument                | Type                               | Required | What it does                                      |
| ----------------------- | ---------------------------------- | -------- | ------------------------------------------------- |
| `limit`                 | integer, 1 to 50, default `20`     | no       | Collections to serve.                             |
| `page`                  | integer, 1 to 100, default `1`     | no       | Which page of collections.                        |
| `searchable_only`       | boolean, default `false`           | no       | Keep the collections a search can be narrowed to. |
| `max_description_chars` | integer, 80 to 2000, default `300` | no       | How much of each description to serve.            |

**In return:** `collections`, each carrying `identifier`, the slug it is
addressed by; `title`; `collection_filter`, the wording `search_items` takes;
`searchable_media_types`; `description`; `item_count`; `subjects`; `formats` for
the kinds of thing it holds; and `source_url`. `total` counts the collections the
Library publishes, which is more than the number returned.

## What scanned text is worth

The words inside a newspaper page came off the page through optical character
recognition, so an excerpt carries the misreadings of that process. It is served
as it was read rather than corrected. Quote it as scanned text, and link the page
so a reader can look at the leaf itself.

## Rights

A record states its own rights in `rights`, and the Library's terms differ from
one deposit to the next. Read that statement before reusing anything, and repeat
it beside whatever is shown.

## Configuration

Every variable is optional. Set them in the `env` block of your client config.

| Variable                   | Default              | What it does                                                                          |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `LOC_USER_AGENT`           | the project identity | Names your application to the Library, with an address where a person can be reached. |
| `LOC_MIN_INTERVAL_MS`      | `6000`               | Gap between two requests, from 3000 to 60000.                                         |
| `LOC_TIMEOUT_MS`           | `30000`              | Deadline for one request, from 1000 to 120000.                                        |
| `LOC_NEWSPAPER_TIMEOUT_MS` | `90000`              | Deadline for a newspaper search, from 1000 to 300000.                                 |
| `LOC_MAX_RETRIES`          | `3`                  | Attempts after a transient failure, from 0 to 8.                                      |
| `LOC_CACHE_TTL_MS`         | `900000`             | How long an answer stays in memory, from 0 to 86400000.                               |
| `LOC_CACHE_MAX_ENTRIES`    | `200`                | Answers held in memory at once, from 1 to 5000.                                       |
| `LOC_LOG_LEVEL`            | `error`              | `silent`, `error`, `info` or `debug`, written to stderr.                              |

A value outside its range falls back to the default, and the reason is written to
stderr.

## Errors

Every failure carries one of six codes, a message, and where it helps a hint
naming the next move.

| Code            | What happened                                           | What to do                                                                                                   |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `not_found`     | The Library answered, and holds no such record.         | Check the identifier with `search_items`.                                                                    |
| `invalid_input` | The arguments were refused before any request went out. | Read the message, which names the argument.                                                                  |
| `rate_limited`  | The Library asked this client to slow down.             | Wait the number of seconds the hint names and call again with the same arguments. The record is still there. |
| `parse_failure` | The answer arrived in a shape this client cannot read.  | Report it at [the issue tracker](https://github.com/smeet666/mcp-libraryofcongress/issues).                  |
| `network_error` | The request did not complete.                           | Try again shortly.                                                                                           |
| `timeout`       | The request passed its deadline.                        | Raise `LOC_TIMEOUT_MS`, or `LOC_NEWSPAPER_TIMEOUT_MS` for a newspaper search.                                |

## As a library

The layer reading the Library is published on its own, with its pacing, its cache
and its errors, and with no protocol attached.

```ts
import { LocClient } from "mcp-libraryofcongress/client";

const client = new LocClient();
const { data, cached } = await client.searchItems({ query: "tenement", mediaType: "photos" });
console.log(data.total, cached);
```

Each read answers `{ data, cached }`, and throws an error carrying one of the six
codes. The floor between two requests holds here as well.

## Pacing and attribution

The Library publishes a limit of 20 requests a minute for its API and 10 for the
site as a whole, and the lower of the two governs: requests go out one at a time
with at least six seconds between them, and the floor of three seconds holds
however the server is configured. The `User-Agent` always ends with the project
identity and an address where a person can be reached.

Every result carries the address of the page it was read from. The Library of
Congress is a public institution, and its records state their own rights.

This MCP server is an unofficial project, with no affiliation to the Library of
Congress.

## Privacy

This server collects nothing about you and sends nothing to its author. It runs
on your machine, contacts `www.loc.gov` and `chroniclingamerica.loc.gov` and nothing else, holds its answers in memory
while it runs, and writes nothing to disk.
[PRIVACY.md](PRIVACY.md) states what a request carries and which settings change
any of it.

## Development

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Tests run against generated fixtures and make no network request. The live suite,
`npm run test:live`, makes one request per route and runs nightly against the
Library itself.

## Contributing

Bugs, questions and ideas belong in
[the issue tracker](https://github.com/smeet666/mcp-libraryofcongress/issues).
Pull requests are welcome; opening an issue first helps agree on the shape of the
change. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE). The records belong to the Library of Congress and to
the depositors it names, under the rights each record states.

---

<a name="mcp-libraryofcongress-français"></a>

# mcp-libraryofcongress (français)

_[English version](#mcp-libraryofcongress)_

La [Library of Congress](https://www.loc.gov) est la bibliothèque nationale des
États-Unis, et elle publie en ligne une large part de ses fonds : livres,
photographies, cartes, enregistrements sonores, manuscrits, et les pages des
journaux américains depuis le dix-huitième siècle. Ces pages de journaux ont été
numérisées puis passées par la reconnaissance optique de caractères, si bien que
les mots qui y sont imprimés sont cherchables. Des conservateurs rassemblent
aussi des documents en collections numériques, chacune décrite et publiée comme
un ensemble à part entière.

Ce serveur relie un client de conversation à cette bibliothèque. On peut chercher
dans les mots imprimés à l'intérieur des journaux, chercher au catalogue par
titre, auteur, sujet, lieu ou langue, lire une notice avec ses conditions de
droits et le lieu où l'original est conservé, et lister les collections
numériques. Aucune clé d'API, aucun compte.

## Installation

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=libraryofcongress&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1saWJyYXJ5b2Zjb25ncmVzcyJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=libraryofcongress&config=%7B%22name%22%3A%22libraryofcongress%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-libraryofcongress%22%5D%7D)

**Claude Code**

```bash
claude mcp add libraryofcongress -- npx -y mcp-libraryofcongress
```

**Claude Desktop, Cursor, et tout client au format de configuration standard**

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

Node 24 ou plus récent est nécessaire, et aucune variable d'environnement n'est à
renseigner.

### Avec Docker

```json
{
  "mcpServers": {
    "libraryofcongress": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-libraryofcongress:3.0.0"]
    }
  }
}
```

`-i` garde l'entrée standard ouverte, qui est le canal du protocole, et `-t` est
omis parce qu'un TTY réécrit le flux. Le conteneur a besoin d'un accès HTTPS
sortant vers `www.loc.gov` et `chroniclingamerica.loc.gov`, et de rien d'autre :
aucun volume, aucun port, aucun identifiant.

### Bundle, sans npm

Téléchargez `mcp-libraryofcongress-3.0.0.mcpb` depuis
[la dernière publication](https://github.com/smeet666/mcp-libraryofcongress/releases/latest)
et ouvrez-le. Un client qui gère les bundles MCP l'installe seul, sans npm et
sans fichier de configuration à modifier. Le bundle emporte ses dépendances, donc
rien n'est téléchargé à l'installation.

## Ce qu'on peut demander

- « Qu'ont écrit les journaux de l'Oklahoma sur le vote d'accession de 1907 ? »
- « Trouve-moi des photographies d'immeubles de rapport à Chicago avant 1920. »
- « Lis cette notice et dis-moi qui conserve l'original. »
- « Quelles collections numériques existent sur la guerre de Sécession ? »
- « Puis-je réutiliser cette photographie ? »

Le chemin ordinaire va d'une recherche à une notice : une ligne porte un
`identifier`, et `get_item` la lit.

## Les outils

| Outil               | Ce qu'il fait                                                        |
| ------------------- | -------------------------------------------------------------------- |
| `search_newspapers` | Cherche dans les mots imprimés des pages de journaux numérisées.     |
| `search_items`      | Cherche au catalogue par titre, auteur, sujet, lieu ou langue.       |
| `get_item`          | Lit une notice, ses droits et le lieu de conservation de l'original. |
| `list_collections`  | Liste les collections numériques publiées par les conservateurs.     |

### `search_newspapers`

Cherche dans le texte des pages de journaux numérisées, texte issu de la
reconnaissance optique de caractères.

| Argument                 | Type                            | Requis | Ce qu'il fait                            |
| ------------------------ | ------------------------------- | ------ | ---------------------------------------- |
| `query`                  | chaîne, 1 à 300 caractères      | oui    | Les mots à chercher sur les pages.       |
| `location`               | chaîne, jusqu'à 120 caractères  | non    | Un lieu de publication du journal.       |
| `publication`            | chaîne, jusqu'à 200 caractères  | non    | Un journal en particulier.               |
| `year_from`              | entier, 1000 à 9999             | non    | Année la plus ancienne, incluse.         |
| `year_to`                | entier, 1000 à 9999             | non    | Année la plus récente, incluse.          |
| `limit`                  | entier, 1 à 25, défaut `10`     | non    | Correspondances à servir.                |
| `page`                   | entier, 1 à 100, défaut `1`     | non    | Quelle page de correspondances.          |
| `max_excerpt_chars`      | entier, 80 à 1200, défaut `300` | non    | La longueur de passage à servir.         |
| `max_excerpts_per_match` | entier, 1 à 10, défaut `3`      | non    | Passages servis par page correspondante. |

**En retour :** `hits`, chacun portant `identifier`, que `get_item` reprend ;
`title` ; `creator`, qui est la bibliothèque ayant fourni la numérisation ;
`year` ; `page_number`, le feuillet dans le numéro ; `published_on` ;
`publication` avec les années de parution du journal ; `state` ; `excerpts` ; et
`excerpt_kind`.

**`excerpt_kind` décide de ce que vaut un extrait.** Un `passage` est le texte
autour des mots trouvés, centré sur eux. Un `page_opening` est le début du
feuillet, envoyé parce que le texte rendu par la bibliothèque avec la ligne
s'arrête avant que ces mots apparaissent : il ne porte pas la correspondance,
donc le citer cite autre chose, et `source_url` ouvre le feuillet avec la requête
appliquée. **`total` compte des feuillets de journaux, et il pagine :** ce n'est
jamais un compte du nombre de fois où les mots apparaissent.

### `search_items`

Cherche au catalogue, un type de chose à la fois.

| Argument      | Type                                                              | Requis | Ce qu'il fait                                          |
| ------------- | ----------------------------------------------------------------- | ------ | ------------------------------------------------------ |
| `query`       | chaîne, 1 à 300 caractères                                        | oui    | Les mots à chercher.                                   |
| `media_type`  | `books`, `photos`, `maps`, `audio`, `manuscripts` ou `newspapers` | non    | Le catalogue à lire.                                   |
| `year_from`   | entier, 1000 à 9999                                               | non    | Année la plus ancienne, incluse.                       |
| `year_to`     | entier, 1000 à 9999                                               | non    | Année la plus récente, incluse.                        |
| `subject`     | chaîne, jusqu'à 120 caractères                                    | non    | Une vedette-matière.                                   |
| `location`    | chaîne, jusqu'à 120 caractères                                    | non    | Un lieu.                                               |
| `language`    | chaîne, jusqu'à 120 caractères                                    | non    | Une langue, écrite en anglais.                         |
| `collection`  | chaîne, jusqu'à 160 caractères                                    | non    | Une collection, telle que `list_collections` la nomme. |
| `online_only` | booléen, défaut `true`                                            | non    | Ne garder que les notices en ligne.                    |
| `sort`        | `relevance`, `newest`, `oldest` ou `title`, défaut `relevance`    | non    | L'ordre des lignes.                                    |
| `limit`       | entier, 1 à 50, défaut `10`                                       | non    | Lignes à servir.                                       |
| `page`        | entier, 1 à 100, défaut `1`                                       | non    | Quelle page de lignes.                                 |

**En retour :** `items`, chacun portant `identifier`, `title`, `creator`, `year`,
`date` tel que publié, souvent un intervalle, `is_collection` et `source_url`. La
bibliothèque tient un catalogue par type de chose, donc une recherche sans
`media_type` lit le catalogue général, et `total` y compte les notices
correspondantes.

### `get_item`

Lit une notice. Les parties lourdes se demandent au lieu d'être servies par
défaut, et une description longue se pagine.

| Argument                | Type                                                                              | Requis | Ce qu'il fait                        |
| ----------------------- | --------------------------------------------------------------------------------- | ------ | ------------------------------------ |
| `identifier`            | chaîne, 1 à 300 caractères                                                        | oui    | L'identifiant que porte une ligne.   |
| `sections`              | tableau de `basic`, `citations`, `resources`, `full_metadata`, défaut `["basic"]` | non    | Les parties à rendre.                |
| `offset`                | entier, 0 ou plus, défaut `0`                                                     | non    | Où reprendre la description.         |
| `max_description_chars` | entier, 200 à 20000, défaut `2000`                                                | non    | La longueur de description à servir. |

**En retour :** la notice avec son `title`, `creator`, `year`, `date`, `format`
et `source_url`, plus `description`, `subjects`, `location`, `language`,
`part_of` pour les collections et divisions où elle se range, `repository` qui
nomme le lieu de conservation de l'original, `call_number` et `rights`. Un champ
que la notice laisse vide vaut `null`. `next_offset` poursuit une description
longue et vaut `null` à la fin. Un identifiant peut porter des barres obliques :
un numéro de journal est nommé par son titre, sa date et son édition ensemble.

### `list_collections`

Liste les collections numériques, ensembles de documents qu'un conservateur a
choisis, décrits et publiés ensemble.

| Argument                | Type                            | Requis | Ce qu'il fait                                                      |
| ----------------------- | ------------------------------- | ------ | ------------------------------------------------------------------ |
| `limit`                 | entier, 1 à 50, défaut `20`     | non    | Collections à servir.                                              |
| `page`                  | entier, 1 à 100, défaut `1`     | non    | Quelle page de collections.                                        |
| `searchable_only`       | booléen, défaut `false`         | non    | Ne garder que celles auxquelles on peut restreindre une recherche. |
| `max_description_chars` | entier, 80 à 2000, défaut `300` | non    | La longueur de chaque description à servir.                        |

**En retour :** `collections`, chacune portant `identifier`, le slug qui
l'adresse ; `title` ; `collection_filter`, la formulation que `search_items`
reprend ; `searchable_media_types` ; `description` ; `item_count` ; `subjects` ;
`formats` pour les types de choses qu'elle contient ; et `source_url`. `total`
compte les collections que la bibliothèque publie, ce qui dépasse le nombre
rendu.

## Ce que vaut un texte numérisé

Les mots contenus dans une page de journal sont issus de la reconnaissance
optique de caractères, donc un extrait porte les erreurs de lecture de ce
procédé. Il est servi tel qu'il a été lu plutôt que corrigé. Citez-le comme un
texte numérisé, et liez la page pour qu'un lecteur puisse regarder le feuillet
lui-même.

## Les droits

Une notice énonce ses propres droits dans `rights`, et les conditions de la
bibliothèque diffèrent d'un dépôt à l'autre. Lisez cette mention avant toute
réutilisation, et redonnez-la à côté de ce qui est montré.

## Configuration

Chaque variable est facultative. Elles se posent dans le bloc `env` de la
configuration du client.

| Variable                   | Défaut               | Ce qu'elle fait                                                                              |
| -------------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `LOC_USER_AGENT`           | l'identité du projet | Nomme votre application auprès de la bibliothèque, avec une adresse où joindre une personne. |
| `LOC_MIN_INTERVAL_MS`      | `6000`               | Écart entre deux requêtes, de 3000 à 60000.                                                  |
| `LOC_TIMEOUT_MS`           | `30000`              | Délai d'une requête, de 1000 à 120000.                                                       |
| `LOC_NEWSPAPER_TIMEOUT_MS` | `90000`              | Délai d'une recherche dans les journaux, de 1000 à 300000.                                   |
| `LOC_MAX_RETRIES`          | `3`                  | Tentatives après un échec passager, de 0 à 8.                                                |
| `LOC_CACHE_TTL_MS`         | `900000`             | Durée pendant laquelle une réponse reste en mémoire, de 0 à 86400000.                        |
| `LOC_CACHE_MAX_ENTRIES`    | `200`                | Réponses gardées en mémoire à la fois, de 1 à 5000.                                          |
| `LOC_LOG_LEVEL`            | `error`              | `silent`, `error`, `info` ou `debug`, écrit sur la sortie d'erreur.                          |

Une valeur hors de sa plage retombe sur le défaut, et la raison est écrite sur la
sortie d'erreur.

## Erreurs

Chaque échec porte un des six codes, un message, et quand cela aide une
indication du geste suivant.

| Code            | Ce qui s'est passé                                   | Que faire                                                                                         |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `not_found`     | La bibliothèque a répondu, et n'a pas cette notice.  | Vérifiez l'identifiant avec `search_items`.                                                       |
| `invalid_input` | Les arguments ont été refusés avant toute requête.   | Lisez le message, qui nomme l'argument.                                                           |
| `rate_limited`  | La bibliothèque demande à ce client de ralentir.     | Attendez les secondes indiquées et rappelez avec les mêmes arguments. La notice est toujours là.  |
| `parse_failure` | La réponse est arrivée dans une forme illisible ici. | Signalez-le sur [le suivi d'incidents](https://github.com/smeet666/mcp-libraryofcongress/issues). |
| `network_error` | La requête n'a pas abouti.                           | Réessayez sous peu.                                                                               |
| `timeout`       | La requête a dépassé son délai.                      | Augmentez `LOC_TIMEOUT_MS`, ou `LOC_NEWSPAPER_TIMEOUT_MS` pour une recherche dans les journaux.   |

## Comme bibliothèque

La couche qui lit la bibliothèque est publiée seule, avec son rythme, son cache
et ses erreurs, sans protocole attaché.

```ts
import { LocClient } from "mcp-libraryofcongress/client";

const client = new LocClient();
const { data, cached } = await client.searchItems({ query: "tenement", mediaType: "photos" });
console.log(data.total, cached);
```

Chaque lecture répond `{ data, cached }`, et lève une erreur portant un des six
codes. Le plancher entre deux requêtes tient également ici.

## Rythme et attribution

La bibliothèque publie une limite de 20 requêtes par minute pour son API et de 10
pour l'ensemble du site, et c'est la plus basse qui gouverne : les requêtes
partent une à une avec au moins six secondes entre elles, et le plancher de trois
secondes tient quelle que soit la configuration. Le `User-Agent` se termine
toujours par l'identité du projet et une adresse où joindre une personne.

Chaque résultat porte l'adresse de la page d'où il a été lu. La Library of
Congress est une institution publique, et ses notices énoncent leurs propres
droits.

Ce MCP est un projet non officiel, sans affiliation à la Library of Congress.

## Confidentialité

Ce serveur ne collecte rien sur vous et n'envoie rien à son auteur. Il tourne sur
votre machine, ne joint que `www.loc.gov` et `chroniclingamerica.loc.gov`, garde ses réponses en mémoire le temps qu'il
tourne, et n'écrit rien sur le disque. [PRIVACY.md](PRIVACY.md) dit ce qu'une
requête emporte et quels réglages changent cela.

## Développement

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Les tests s'exécutent sur des fixtures engendrées et n'émettent aucune requête.
La suite en direct, `npm run test:live`, émet une requête par route et tourne
chaque nuit contre la bibliothèque elle-même.

## Contribuer

Les anomalies, les questions et les idées ont leur place dans
[le suivi d'incidents](https://github.com/smeet666/mcp-libraryofcongress/issues).
Les propositions de modification sont bienvenues ; ouvrir un ticket d'abord aide
à s'accorder sur la forme du changement. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT, voir [LICENSE](LICENSE). Les notices appartiennent à la Library of Congress
et aux déposants qu'elle nomme, sous les droits que chaque notice énonce.
