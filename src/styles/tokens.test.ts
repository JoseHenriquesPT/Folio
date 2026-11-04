import { describe, expect, it } from "vitest";
import { PALETTES } from "../lib/palette";
import { cssRule } from "../test/cssRule";
import appCss from "./app.css?raw";
import editorCss from "./editor.css?raw";
import tokensCss from "./tokens.css?raw";
import workspaceCss from "./workspace.css?raw";

// Every theme block must be complete: palette blocks only override tokens,
// they never inherit a half-applied set from the default palette.
const REQUIRED_TOKENS = [
  "--bg",
  "--surface",
  "--surface-strong",
  "--surface-muted",
  "--ink",
  "--muted",
  "--faint",
  "--line",
  "--line-strong",
  "--accent",
  "--accent-strong",
  "--accent-soft",
  "--accent-contrast",
  "--accent-ink",
  "--danger",
  "--danger-strong",
  "--danger-soft",
  "--danger-contrast",
  "--warning",
  "--shadow-sm",
  "--shadow-md",
];

const BLOCKS = [
  ':root, [data-palette="sage"]',
  ':root[data-theme="dark"], [data-palette="sage"][data-theme="dark"]',
  ...PALETTES.filter((palette) => palette.id !== "sage").flatMap((palette) => [
    `[data-palette="${palette.id}"]`,
    `[data-palette="${palette.id}"][data-theme="dark"]`,
  ]),
];

describe("theme token blocks", () => {
  for (const selector of BLOCKS) {
    it(`${selector} defines every color token`, () => {
      const block = cssRule(tokensCss, selector);
      for (const token of REQUIRED_TOKENS) {
        expect(block, `${token} missing from ${selector}`).toContain(`${token}:`);
      }
    });
  }
});

describe("component stylesheets", () => {
  it("use tokens instead of dark-only overrides, so palettes need no per-component work", () => {
    expect(appCss).not.toContain('[data-theme="dark"]');
    expect(workspaceCss).not.toContain('[data-theme="dark"]');
    expect(editorCss).not.toContain('[data-theme="dark"]');
  });

  it("derive the swatch preview from tokens rather than copied colors", () => {
    const swatch = cssRule(appCss, ".theme-swatch");
    expect(swatch).toContain("var(--surface-strong)");
    expect(swatch).toContain("var(--accent)");
    expect(swatch).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
