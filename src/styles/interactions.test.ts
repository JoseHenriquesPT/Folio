import { describe, expect, it } from "vitest";
import { cssRule } from "../test/cssRule";
import workspaceCss from "./workspace.css?raw";

// Long-pressing a link on iOS pops a native callout that the contextmenu
// event cannot suppress; the CSS opt-out is the only way to keep it down so
// Folio's own menu can take its place.
describe("long press on iOS", () => {
  it("disables the native link callout on note cards", () => {
    expect(cssRule(workspaceCss, ".note-card")).toContain(
      "-webkit-touch-callout: none"
    );
  });

  it("disables it on sidebar links", () => {
    expect(cssRule(workspaceCss, ".sidebar-link")).toContain(
      "-webkit-touch-callout: none"
    );
  });
});
