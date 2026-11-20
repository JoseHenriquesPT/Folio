import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "../test/fakeDb";
import { useNotebookArchive } from "./useNotebookArchive";

const toast = { push: vi.fn() };
const confirm = vi.fn(async () => true);

const notebook = { id: "nb-1", name: "Work" };

function setup() {
  const db = createFakeDb();
  const onChanged = vi.fn();

  const view = renderHook(() =>
    useNotebookArchive({
      client: db.client,
      toast,
      confirm,
      onChanged,
    })
  );

  return { db, onChanged, view };
}

beforeEach(() => {
  toast.push.mockClear();
  confirm.mockReset();
  confirm.mockResolvedValue(true);
});

describe("useNotebookArchive", () => {
  it("confirms, archives the subtree, toasts the count and refreshes", async () => {
    const { db, onChanged, view } = setup();
    db.queueRpc("set_notebook_archived", { data: 3 });

    await expect(view.result.current(notebook, true)).resolves.toBe(3);

    expect(confirm).toHaveBeenCalledExactlyOnceWith({
      title: "Archive notebook",
      message:
        "Archive every active note in “Work” and its sub-notebooks? They move to Archived, where you can restore them.",
      confirmLabel: "Archive notes",
    });
    expect(db.rpc).toHaveBeenCalledWith("set_notebook_archived", {
      p_notebook_id: "nb-1",
      p_archived: true,
    });
    expect(toast.push).toHaveBeenCalledWith(
      "Archived 3 notes in “Work”.",
      "success"
    );
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("stops without a request when the confirmation is declined", async () => {
    confirm.mockResolvedValue(false);
    const { db, onChanged, view } = setup();

    await expect(view.result.current(notebook, true)).resolves.toBeNull();

    expect(db.rpc).not.toHaveBeenCalled();
    expect(toast.push).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("unarchives with its own confirmation and toast", async () => {
    const { db, onChanged, view } = setup();
    db.queueRpc("set_notebook_archived", { data: 1 });

    await expect(view.result.current(notebook, false)).resolves.toBe(1);

    expect(confirm).toHaveBeenCalledExactlyOnceWith({
      title: "Unarchive notebook",
      message:
        "Bring every archived note in “Work” and its sub-notebooks back to the main list?",
      confirmLabel: "Unarchive notes",
    });
    expect(db.rpc).toHaveBeenCalledWith("set_notebook_archived", {
      p_notebook_id: "nb-1",
      p_archived: false,
    });
    expect(toast.push).toHaveBeenCalledWith(
      "Unarchived 1 note in “Work”.",
      "success"
    );
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("says so when there was nothing to change and skips the refresh", async () => {
    const { db, onChanged, view } = setup();
    db.queueRpc("set_notebook_archived", { data: 0 });

    await expect(view.result.current(notebook, true)).resolves.toBe(0);

    expect(toast.push).toHaveBeenCalledWith(
      "No active notes to archive in “Work”.",
      "info"
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("reports a database refusal without refreshing", async () => {
    const { db, onChanged, view } = setup();
    db.queueRpc("set_notebook_archived", { error: { message: "denied" } });

    await expect(view.result.current(notebook, true)).resolves.toBeNull();

    expect(toast.push).toHaveBeenCalledWith("denied", "error");
    expect(onChanged).not.toHaveBeenCalled();
  });
});
