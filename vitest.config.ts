import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
    // jsdom setup can exceed the 5s default when the machine is busy; the
    // assertions themselves still use their own waitFor timeouts.
    testTimeout: 15_000,
    // The MCP server tests run in a separate Node project; see vitest.mcp.config.ts.
    exclude: ["**/node_modules/**", "**/dist/**", "mcp/**"],
    // Lets tests read source stylesheets with `?raw` (see editor.test.ts).
    css: true,
  },
});
