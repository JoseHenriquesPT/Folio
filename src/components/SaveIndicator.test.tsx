import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SaveIndicator from "./SaveIndicator";

describe("SaveIndicator", () => {
  it("draws an icon instead of save words", () => {
    const { container } = render(
      <SaveIndicator status="saving" hasNote={true} />
    );

    const indicator = container.querySelector(".save-indicator");
    expect(indicator?.getAttribute("data-status")).toBe("saving");
    expect(indicator?.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toBe("");
  });

  it("announces nothing itself because the live region does", () => {
    const { container } = render(
      <SaveIndicator status="saved" hasNote={true} />
    );

    expect(
      container.querySelector(".save-indicator")?.getAttribute("aria-hidden")
    ).toBe("true");
  });

  it("renders nothing before a new note has any content worth saving", () => {
    const { container } = render(
      <SaveIndicator status="idle" hasNote={false} />
    );

    expect(container.innerHTML).toBe("");
  });
});
