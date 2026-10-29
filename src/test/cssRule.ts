import { expect } from "vitest";

/**
 * Pulls the declarations out of a raw stylesheet so a test can assert a rule
 * exists without parsing full CSS.
 */
export function cssRule(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `missing rule for ${selector}`).toBeGreaterThan(-1);
  const start = at + selector.length + 1;
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}
