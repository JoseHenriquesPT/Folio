import { describe, expect, it } from "vitest";
import {
  isWorkspacePath,
  lastLocationKey,
  readLastLocation,
  rememberLastLocation,
  restoreTarget,
  workspaceSearch,
} from "./lastLocation";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const NOTE = { pathname: "/note/abc", search: "?notebook=n1" };

describe("last workspace location", () => {
  it("keys the remembered screen per account", () => {
    expect(lastLocationKey("user-1")).toBe("folio.lastLocation.user-1");
  });

  it("only treats real workspace screens as restorable", () => {
    expect(isWorkspacePath("/")).toBe(true);
    expect(isWorkspacePath("/shared")).toBe(true);
    expect(isWorkspacePath("/archived")).toBe(true);
    expect(isWorkspacePath("/trash")).toBe(true);
    expect(isWorkspacePath("/note/abc")).toBe(true);

    expect(isWorkspacePath("/note/new")).toBe(false);
    expect(isWorkspacePath("/note/")).toBe(false);
    expect(isWorkspacePath("/note/a/b")).toBe(false);
    expect(isWorkspacePath("/settings")).toBe(false);
    expect(isWorkspacePath("/nope")).toBe(false);
  });

  it("keeps only the list context parameters", () => {
    expect(
      workspaceSearch(
        "?view=trash&code=abc&q=tomato&sort=title&dir=asc&notebook=n1&tag=t1&junk=1"
      )
    ).toBe("?view=trash&notebook=n1&tag=t1&q=tomato&sort=title&dir=asc");
    expect(workspaceSearch("")).toBe("");
    expect(workspaceSearch("?q=")).toBe("");
  });

  it("round-trips a screen for one account without leaking to another", () => {
    const storage = memoryStorage();

    rememberLastLocation(
      "user-1",
      { pathname: "/note/abc", search: "?notebook=n1&q=tomato" },
      storage
    );

    expect(readLastLocation("user-1", storage)).toEqual({
      pathname: "/note/abc",
      search: "?notebook=n1&q=tomato",
    });
    expect(readLastLocation("user-2", storage)).toBeNull();
  });

  it("never stores a new-note draft or Settings", () => {
    const storage = memoryStorage();

    rememberLastLocation("user-1", NOTE, storage);
    rememberLastLocation("user-1", { pathname: "/note/new", search: "" }, storage);
    rememberLastLocation("user-1", { pathname: "/settings", search: "" }, storage);

    expect(readLastLocation("user-1", storage)).toEqual(NOTE);
  });

  it("ignores missing, malformed, or foreign stored values", () => {
    const store = (value: string) =>
      memoryStorage({ [lastLocationKey("user-1")]: value });

    expect(readLastLocation("user-1", memoryStorage())).toBeNull();
    expect(readLastLocation("user-1", store("not json"))).toBeNull();
    expect(
      readLastLocation("user-1", store('{"pathname":"/settings","search":""}'))
    ).toBeNull();
    expect(
      readLastLocation("user-1", store('{"pathname":"/note/abc"}'))
    ).toBeNull();
    expect(readLastLocation("user-1", store('["/note/abc"]'))).toBeNull();
  });

  it("survives storage that refuses to read or write", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };

    expect(readLastLocation("user-1", broken)).toBeNull();
    expect(() =>
      rememberLastLocation("user-1", { pathname: "/", search: "" }, broken)
    ).not.toThrow();
  });

  it("restores only when the app opens at a bare root", () => {
    const root = { pathname: "/", search: "" };

    expect(restoreTarget(root, NOTE)).toEqual(NOTE);
    expect(
      restoreTarget(root, { pathname: "/", search: "?notebook=n1" })
    ).toEqual({ pathname: "/", search: "?notebook=n1" });

    expect(restoreTarget({ pathname: "/", search: "?view=pinned" }, NOTE)).toBeNull();
    expect(restoreTarget({ pathname: "/shared", search: "" }, NOTE)).toBeNull();
    expect(restoreTarget({ pathname: "/note/other", search: "" }, NOTE)).toBeNull();
    expect(restoreTarget(root, null)).toBeNull();
    expect(restoreTarget(root, root)).toBeNull();
  });
});
