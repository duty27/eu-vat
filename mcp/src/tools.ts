/**
 * The four tools this MCP server offers, and the server that carries them.
 *
 * What MCP is, in one paragraph: an AI assistant (Claude Desktop, Claude Code, Cursor, ...) can be given
 * "tools", functions it may call. A tool has a name, a description the model reads to decide WHEN to use it,
 * and a typed input. The assistant starts this program, talks to it over stdin/stdout, and shows the answer
 * to the user. So the descriptions below are written for a model, not for a human skimming docs.
 *
 * Everything here is a thin wrapper over the @duty27/eu-vat library in ../node. There is no VAT logic in this
 * file: the rules (an unknown country, a date before 2016 or a malformed date is an error, never a guess) live
 * in the library, so the Node, Python, Java and MCP versions cannot disagree. The library is bundled into
 * dist/server.js by scripts/build.mjs, so this package needs no other install and works offline.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ATTRIBUTION, dataAsOf, getRateChanges, getRateHistory, getStandardRate, listCountries, normalizeCountry,
} from '../../node/src/index.js';

/** What every tool says about its data, so a model can tell the user how fresh the answer is. */
const FRESHNESS = `Standard VAT rates only (not reduced rates), from 2016-01-01. Data checked against the published rates on ${dataAsOf}; a change made after that date appears in a newer release.`;

/** All four tools only read data held in this program: no network, no files, no side effects. */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

type ToolResult = {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/** A successful answer: readable text for the model plus the same facts as structured data. */
function ok(text: string, data: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text: `${text}\n\n${ATTRIBUTION}` }], structuredContent: { ...data, dataAsOf, attribution: ATTRIBUTION } };
}

/**
 * Run a lookup, turning any error the library throws (unknown country, date out of range, malformed date) into a
 * tool error. The message is the library's own, which already says what is wrong and what would be valid, so
 * the model can correct itself and try again. The server itself never crashes on bad input.
 */
function run(lookup: () => ToolResult): ToolResult {
  try {
    return lookup();
  } catch (e) {
    return { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true };
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const percent = (rate: number) => `${rate}%`;

// Inputs are deliberately loose strings: the library does the real validation and produces the clearer error.
const country = z.string().describe('EU member state code such as "DE" or "FR" (case does not matter). Greece is "EL"; "GR" is accepted too.');
const date = z.string().describe('Day as YYYY-MM-DD, for example "2020-07-01". Optional: today (UTC) when omitted.').optional();

export function createServer(version: string): McpServer {
  const server = new McpServer({ name: 'eu-vat-rates', version });

  server.registerTool('get_standard_rate', {
    title: 'EU standard VAT rate on a date',
    description:
      'Look up the standard VAT rate in force in one EU member state on a given day (any day since 2016-01-01). ' +
      'Use this for "what was the VAT rate in Germany on 1 July 2020?" or "what is the VAT rate in Finland today?". ' +
      'The day a rate changes is the first day of the new rate. ' + FRESHNESS,
    inputSchema: { country, date },
    outputSchema: { country: z.string(), date: z.string(), rate: z.number(), dataAsOf: z.string(), attribution: z.string() },
    annotations: { title: 'EU standard VAT rate on a date', ...READ_ONLY },
  }, ({ country: input, date: day }) => run(() => {
    const code = normalizeCountry(input);
    const on = day ?? today();
    const rate = getStandardRate(code, on);
    return ok(`The standard VAT rate in ${code} on ${on} is ${percent(rate)}.`, { country: code, date: on, rate });
  }));

  server.registerTool('get_rate_history', {
    title: 'Every standard VAT rate a country has had',
    description:
      'List every standard VAT rate one EU member state has had since 2016-01-01, with the first day each one applied. ' +
      'Use this for "how has the VAT rate in Ireland changed?". ' + FRESHNESS,
    inputSchema: { country },
    outputSchema: { country: z.string(), windows: z.array(z.object({ from: z.string(), rate: z.number() })), dataAsOf: z.string(), attribution: z.string() },
    annotations: { title: 'Every standard VAT rate a country has had', ...READ_ONLY },
  }, ({ country: input }) => run(() => {
    const code = normalizeCountry(input);
    const windows = getRateHistory(code);
    const lines = windows.map((w, i) => `- ${percent(w.rate)} from ${w.from}${i === windows.length - 1 ? ' (current)' : ''}`);
    return ok(`Standard VAT rates in ${code}:\n${lines.join('\n')}`, { country: code, windows });
  }));

  server.registerTool('list_rate_changes', {
    title: 'Standard VAT rate changes across the EU',
    description:
      'List the changes of the standard VAT rate across the EU, newest first, optionally for one country and/or since a date. ' +
      'Use this for "which EU countries changed their VAT rate this year?". Each change gives the old rate, the new rate, ' +
      'and the first day of the new rate. ' + FRESHNESS,
    inputSchema: {
      country: country.optional().describe('Only this member state (for example "RO"). Omit for all 27.'),
      since: z.string().optional().describe('Only changes on or after this day, YYYY-MM-DD. Omit for all of them.'),
    },
    outputSchema: {
      changes: z.array(z.object({ country: z.string(), date: z.string(), from: z.number(), to: z.number() })),
      dataAsOf: z.string(), attribution: z.string(),
    },
    annotations: { title: 'Standard VAT rate changes across the EU', ...READ_ONLY },
  }, ({ country: input, since }) => run(() => {
    const changes = getRateChanges({ country: input, since });
    const lines = changes.map(c => `- ${c.country}: ${percent(c.from)} to ${percent(c.to)} from ${c.date}`);
    const text = changes.length === 0 ? 'No standard VAT rate changes match.' : `${changes.length} standard VAT rate change(s), newest first:\n${lines.join('\n')}`;
    return ok(text, { changes });
  }));

  server.registerTool('list_countries', {
    title: 'The 27 EU member states and their codes',
    description:
      'List the 27 EU member states with the codes the other tools expect. Greece is "EL", the code the European Union uses ("GR" is also accepted). ' +
      'Use this to find a code. The United Kingdom and other non-EU countries are not covered.',
    inputSchema: {},
    outputSchema: { countries: z.array(z.object({ code: z.string(), name: z.string() })), dataAsOf: z.string(), attribution: z.string() },
    annotations: { title: 'The 27 EU member states and their codes', ...READ_ONLY },
  }, () => run(() => {
    const countries = listCountries();
    return ok(countries.map(c => `${c.code}: ${c.name}`).join('\n'), { countries });
  }));

  return server;
}
