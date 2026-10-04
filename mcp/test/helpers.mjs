// Starts the BUILT server (dist/server.js) as a child process and talks to it over stdio with the SDK's own
// client: the same path Claude Desktop, Claude Code or Cursor use. Nothing here imports the server's source.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const MCP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function connect() {
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(MCP_DIR, 'dist', 'server.js')], stderr: 'pipe' });
  const client = new Client({ name: 'eu-vat-mcp-test', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

/** Call a tool; a protocol-level rejection (bad arguments) and a tool-level isError both come back as { isError: true, text }. */
export async function call(client, name, args = {}) {
  try {
    const r = await client.callTool({ name, arguments: args });
    return { isError: r.isError === true, text: (r.content ?? []).map(c => c.text).join('\n'), data: r.structuredContent };
  } catch (e) {
    return { isError: true, text: String(e.message), data: undefined };
  }
}
