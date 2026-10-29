import { describe, expect, it } from "vitest";

const sources = {
  ...import.meta.glob<string>("../*.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob<string>("../**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
};

const sourceFiles = Object.entries(sources).filter(
  ([path]) => !/\.test\.tsx?$/.test(path)
);

/**
 * Folio renders its own dialogs: the browser's blocking boxes look like the
 * OS, not like the app, and cannot be styled or tested. This keeps them from
 * creeping back into source files.
 */
describe("native dialogs", () => {
  it.each(["window.confirm", "window.prompt"])(
    "never calls %s in source files",
    (callee) => {
      const pattern = new RegExp(`${callee}\\s*\\(`);

      for (const [path, source] of sourceFiles) {
        expect(pattern.test(source), `${path} uses ${callee}`).toBe(false);
      }
    }
  );
});
