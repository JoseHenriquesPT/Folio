#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FolioApi } from "./api";
import { readMcpEnv } from "./env";
import { createFolioServer } from "./server";

async function main(): Promise<void> {
  const env = readMcpEnv(process.env);
  const server = createFolioServer(new FolioApi(env));
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Folio MCP failed to start."
  );
  process.exit(1);
});
