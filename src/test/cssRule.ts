import { expect } from "vitest";

/**
 * Pulls the declarations out of a raw stylesheet so a test can assert a rule
 * exists without parsing full CSS. The selector may stand alone or be one
 * entry of a comma-grouped selector list.
 */
export function cssRule(css: string, selector: string): string {
  for (
    let at = css.indexOf(selector);
    at !== -1;
    at = css.indexOf(selector, at + 1)
  ) {
    const after = at + selector.length;
    const open = css.indexOf("{", after);
    if (open === -1) continue;
    const between = css.slice(after, open);
    if (/[;{}]/.test(between)) continue;
    const rest = between.trim();
    // "" ends a lone selector, "," continues a selector group; anything else
    // means the match was only the prefix of a longer selector.
    if (rest !== "" && !rest.startsWith(",")) continue;
    const end = css.indexOf("}", open);
    return css.slice(open + 1, end);
  }
  expect.fail(`missing rule for ${selector}`);
}
