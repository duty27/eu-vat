# @duty27/eu-vat-mcp

An [MCP](https://modelcontextprotocol.io) server that lets an AI assistant answer
**"what was the VAT rate in Germany on 1 July 2020?"** correctly, for all 27 EU member states, any day since 2016.

It runs on your machine, offline, with no API key and no account. The rates are bundled in the package.

## Use it

**Claude Code**

```
claude mcp add eu-vat -- npx -y @duty27/eu-vat-mcp
```

**Claude Desktop, Cursor and other clients** (add to the client's MCP config)

```json
{
  "mcpServers": {
    "eu-vat": { "command": "npx", "args": ["-y", "@duty27/eu-vat-mcp"] }
  }
}
```

Then ask: *"Which EU countries changed their standard VAT rate since 2024?"*

## Tools

| Tool | Answers |
| --- | --- |
| `get_standard_rate` | The standard rate in one country on one day (today if no day is given). |
| `get_rate_history` | Every standard rate a country has had, with the first day of each. |
| `list_rate_changes` | Rate changes across the EU, newest first; filter by country and/or a start date. |
| `list_countries` | The 27 member states and their codes (Greece is `EL`; `GR` also works). |

All four are read-only and make no network calls.

## What it will not do

- **Standard rates only.** Reduced rates (e-books, food, ...) are not included.
- **Lookup, not calculation.** It returns the rate. It does not work out net or gross amounts, rounding, whether a sale is
  reverse-charged, or OSS reports: those are in the Duty27 API.
- **Nothing is guessed.** An unknown country, a date before 2016-01-01 or a malformed date is returned as an error the
  assistant can read, never a plausible-looking wrong rate.
- **It is a snapshot.** Every answer says when the data was last checked (`dataAsOf`). A rate that changed after that
  date appears in the next release. A pull request that updates the data opens automatically when Duty27's published
  rates change, and is released after a person checks it against the primary source.

## Need more than a rate?

Deciding what to charge and keeping the proof (B2B reverse charge, the EU €10,000 threshold, VIES checks, an archive and
OSS reports) is what the [Duty27 API](https://duty27.com/docs) does. It is free to try, no credit card.

## Same data as the libraries

This server uses exactly the data of the [Node, Python and Java libraries](https://github.com/duty27/eu-vat) from the same
repository: one shared source, one hash, one set of test vectors checked in every language and through this server.

## Licence

Code: MIT (`LICENSE`). Rate data: CC BY 4.0 (`DATA-LICENSE.md`); the answers include the credit it asks for:
*Rate data: Duty27 (https://duty27.com/vat-rates/history), CC BY 4.0*.
