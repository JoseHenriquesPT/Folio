import { afterEach, describe, expect, it } from "vitest";
import {
  dropTargetFrom,
  planDrop,
  type DropSubject,
  type DropTarget,
} from "./dragNote";

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

function subject(overrides: Partial<DropSubject> = {}): DropSubject {
  return {
    notebook_id: null,
    tag_ids: [],
    deleted_at: null,
    ...overrides,
  };
}

const notebookTarget: DropTarget = {
  kind: "notebook",
  id: "notebook-1",
  label: "Ideas",
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("dropTargetFrom", () => {
  it("reads a notebook drop target and its label", () => {
    const host = mount(
      '<a data-drop-kind="notebook" data-drop-id="notebook-1" data-drop-label="Ideas">Ideas</a>'
    );

    expect(dropTargetFrom(host.firstElementChild)).toEqual({
      kind: "notebook",
      id: "notebook-1",
      label: "Ideas",
    });
  });

  it("resolves from a child of the target, which is what the pointer hits", () => {
    const host = mount(`
      <a data-drop-kind="tag" data-drop-id="tag-1" data-drop-label="recipes">
        <span>recipes</span><span class="count">4</span>
      </a>
    `);

    expect(dropTargetFrom(host.querySelector(".count"))).toEqual({
      kind: "tag",
      id: "tag-1",
      label: "recipes",
    });
  });

  it("returns null outside a target, and for unusable attributes", () => {
    expect(dropTargetFrom(mount("<div>just text</div>").firstElementChild)).toBeNull();
    expect(dropTargetFrom(null)).toBeNull();
    expect(
      dropTargetFrom(
        mount('<a data-drop-kind="notebook" data-drop-id="n1">no label</a>')
          .firstElementChild
      )
    ).toBeNull();
    expect(
      dropTargetFrom(
        mount('<a data-drop-kind="magic" data-drop-id="x" data-drop-label="X">x</a>')
          .firstElementChild
      )
    ).toBeNull();
  });
});

describe("planDrop", () => {
  it("does nothing without a target under the pointer", () => {
    expect(planDrop(subject(), null)).toEqual({ action: "none" });
  });

  it("refuses to move a note that is in the trash", () => {
    expect(
      planDrop(subject({ deleted_at: "2026-10-29T10:00:00Z" }), notebookTarget)
    ).toEqual({ action: "none" });
  });

  it("drops into a different notebook", () => {
    expect(planDrop(subject({ notebook_id: "notebook-2" }), notebookTarget)).toEqual({
      action: "move",
      notebookId: "notebook-1",
      label: "Ideas",
    });
  });

  it("treats dropping on the current notebook as a no-op", () => {
    expect(planDrop(subject({ notebook_id: "notebook-1" }), notebookTarget)).toEqual({
      action: "noop",
      label: "Ideas",
    });
  });

  it("files a note into Unfiled and notices when it is already there", () => {
    const unfiled: DropTarget = {
      kind: "notebook",
      id: "unfiled",
      label: "Unfiled",
    };

    expect(planDrop(subject({ notebook_id: "notebook-1" }), unfiled)).toEqual({
      action: "move",
      notebookId: null,
      label: "Unfiled",
    });
    expect(planDrop(subject(), unfiled)).toEqual({
      action: "noop",
      label: "Unfiled",
    });
  });

  it("adds a tag the note does not have and removes one it does", () => {
    const recipes: DropTarget = { kind: "tag", id: "tag-1", label: "recipes" };

    expect(planDrop(subject(), recipes)).toEqual({
      action: "tag-add",
      tagId: "tag-1",
      label: "recipes",
    });
    expect(planDrop(subject({ tag_ids: ["tag-1"] }), recipes)).toEqual({
      action: "tag-remove",
      tagId: "tag-1",
      label: "recipes",
    });
  });
});
