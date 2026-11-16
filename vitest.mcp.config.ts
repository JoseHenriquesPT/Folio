import { defineConfig } from "vitest/config";

// The MCP server is a Node process, not a browser app. It gets its own project
// so the jsdom setup (and its `window` dependency) never runs here.
export default defineConfig({
  test: {
    environment: "node",
    include: ["mcp/**/*.test.ts"],
    restoreMocks: true,
    clearMocks: true,
  },
});
