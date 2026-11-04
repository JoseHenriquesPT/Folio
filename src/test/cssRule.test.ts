import { describe, expect, it } from "vitest";
import { cssRule } from "./cssRule";

const CSS = `
.a,
.b {
  color: red;
}

.a > li > label {
  flex: 1;
}

.a > li {
  display: flex;
}

.alone {
  margin: 0;
}
`;

describe("cssRule", () => {
  it("finds a rule shared by a selector group", () => {
    expect(cssRule(CSS, ".a")).toContain("color: red");
    expect(cssRule(CSS, ".b")).toContain("color: red");
  });

  it("still finds a single-selector rule", () => {
    expect(cssRule(CSS, ".alone")).toContain("margin: 0");
  });

  it("does not grab a longer selector that starts with the requested one", () => {
    expect(cssRule(CSS, ".a > li > label")).toContain("flex: 1");
    expect(cssRule(CSS, ".a > li")).toContain("display: flex");
    expect(cssRule(CSS, ".a > li")).not.toContain("flex: 1");
  });

  it("fails when the selector is absent", () => {
    expect(() => cssRule(CSS, ".missing")).toThrow();
  });
});
