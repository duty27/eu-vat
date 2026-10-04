#!/usr/bin/env node
/**
 * Entry point: `npx @duty27/eu-vat-mcp`. Starts the server on stdin/stdout, which is how an MCP client (Claude
 * Desktop, Claude Code, Cursor, ...) talks to a local server.
 *
 * Never print to stdout here: stdout carries the protocol, and a stray console.log would corrupt it. Anything
 * meant for a human goes to stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './tools.js';
// The hash of the rates this build carries (the same value as in the Node, Python and Java libraries). Printing it
// at startup is how a person can check which data a running server has; it also proves the data is in the bundle.
import { DATA_SOURCE_SHA256 } from '../../node/src/data.js';

// Replaced by scripts/build.mjs with the version in package.json, so the two can never differ.
declare const PACKAGE_VERSION: string;

const server = createServer(PACKAGE_VERSION);
await server.connect(new StdioServerTransport());
console.error(`eu-vat-mcp: ready (EU standard VAT rates, offline, data ${DATA_SOURCE_SHA256.slice(0, 16)})`);
