# Security

## Reporting a vulnerability

Use GitHub's private reporting: **Security → Report a vulnerability** on
<https://github.com/smeet666/mcp-libraryofcongress/security/advisories/new>. It
reaches me without the report being public first.

Please do not open a public issue for something exploitable.

I will acknowledge within a few days. This is a single-maintainer project, so
treat that as a best effort rather than a service commitment.

## What is in scope

This server is a read-only client for the Library of Congress. It holds no
credentials, needs no API key, opens no port, and writes nothing back to the
Library. That rules out most of what a vulnerability report usually concerns.

What remains is worth reporting:

- **Anything that lets a caller reach a host other than the Library of
  Congress.** The URLs are built from a fixed base in `src/loc/paths.ts`; an
  argument that escapes it is a real finding. So is an identifier carrying
  slashes that resolves to a path the server does not intend to call.
- **Anything upstream text can do to the caller.** Titles, descriptions and
  scanned passages come from a third party and end up in front of a model. A
  path by which that text could be read as instructions rather than as content
  is in scope, and so is anything that could make it look like the server's own
  words.
- **Anything that turns a failure into a confident answer.** A crafted response
  that makes the server report "there is none" when it means "I could not ask"
  is a correctness bug with real consequences, and I treat it as security.
- **Anything that defeats the pacing.** The floor on the interval between
  requests exists so this client cannot be turned into a load generator against
  a public institution. A way past it is a finding.
- **Dependency vulnerabilities** that are actually reachable from this code.

## What is not

Rate limiting by the Library, or the Library being down, is the upstream's
business and the server already reports it as such. A report that consists only
of an automated scanner's output, with no path from it to this code, will be
closed.

## Versions

Only the latest published version is supported. Fixes go out as a new release on
npm rather than as a patch to an older line.
