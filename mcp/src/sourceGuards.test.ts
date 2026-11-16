import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MCP_DIR = fileURLToPath(new URL("../", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") {
      return [];
    }
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function sources(dir: string): string[] {
  return walk(dir).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts")
  );
}

describe("MCP source guards", () => {
  it("never writes to stdout; stdio is the MCP protocol", () => {
    const offenders = sources(MCP_DIR).filter((file) =>
      /console\.log\s*\(/.test(readFileSync(file, "utf8"))
    );

    expect(offenders).toEqual([]);
  });

  it("never mentions a service-role key", () => {
    const offenders = [MCP_DIR, join(REPO_ROOT, "supabase", "functions")]
      .flatMap(sources)
      .filter((file) => /service_role/i.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });
});
