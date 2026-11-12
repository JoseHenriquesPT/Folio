import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SupabaseProvider } from "../db/SupabaseProvider";
import type { NoteShareRow } from "../db/database.types";
import { createFakeDb, type FakeDb } from "../test/fakeDb";
import { TEST_ENV } from "../test/fakeSupabase";
import { ConfirmProvider } from "./ConfirmProvider";
import { ToastProvider } from "./ToastProvider";
import ShareDialog from "./ShareDialog";

function shareRow(overrides: Partial<NoteShareRow> = {}): NoteShareRow {
  return {
    id: "share-1",
    note_id: "note-1",
    shared_with: "user-2",
    permission: "read",
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function Providers({ db, children }: { db: FakeDb; children: ReactNode }) {
  return (
    <SupabaseProvider client={db.client} env={TEST_ENV}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </SupabaseProvider>
  );
}

function renderDialog(
  db: FakeDb,
  props: Partial<Parameters<typeof ShareDialog>[0]> = {}
) {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  const view = render(
    <Providers db={db}>
      <ShareDialog
        open
        kind="note"
        targetId="note-1"
        ownerId="user-1"
        currentUserId="user-1"
        version={0}
        onClose={onClose}
        onChanged={onChanged}
        {...props}
      />
    </Providers>
  );
  return { ...view, onClose, onChanged };
}

describe("ShareDialog", () => {
  it("renders nothing when closed", () => {
    const db = createFakeDb();
    const { container } = renderDialog(db, { open: false });

    expect(container.querySelector(".manage-list")).toBeNull();
    expect(db.from).not.toHaveBeenCalled();
  });

  it("explains per-note sharing", () => {
    const db = createFakeDb();
    db.queue("note_shares", { data: [] });

    renderDialog(db);

    expect(screen.getByRole("heading", { name: "Share note" })).toBeTruthy();
    expect(
      screen.getByText(/Sharing is per note, and private by default\./)
    ).toBeTruthy();
  });

  it("explains the subtree when sharing a notebook", async () => {
    const db = createFakeDb();
    db.queue("notebook_shares", { data: [] });

    renderDialog(db, { kind: "notebook", targetId: "nb-1" });

    expect(screen.getByRole("heading", { name: "Share notebook" })).toBeTruthy();
    expect(screen.getByText(/sub-notebooks/)).toBeTruthy();
    await screen.findByText("Only you can open this notebook.");
  });

  it("lists recipients with their names and permissions", async () => {
    const db = createFakeDb();
    db.queue("note_shares", {
      data: [shareRow({ shared_with: "user-2", permission: "read" })],
    });
    db.queue("public_profiles", {
      data: [{ id: "user-2", display_name: "Ana" }],
    });

    renderDialog(db);

    await screen.findByText("Ana");
    expect(screen.queryByText("Only you can open this note.")).toBeNull();
    const row = screen.getByText("Ana").closest(".manage-row") as HTMLElement;
    expect(
      (within(row).getByRole("combobox") as HTMLSelectElement).value
    ).toBe("read");
  });

  it("says only the owner has access when there are no recipients", async () => {
    const db = createFakeDb();
    db.queue("note_shares", { data: [] });

    renderDialog(db);

    await screen.findByText("Only you can open this note.");
  });

  it("adds a recipient through the notebook share table", async () => {
    const db = createFakeDb();
    db.queue("notebook_shares", { data: [] });
    db.queueRpc("find_profile_by_email", {
      data: [{ id: "user-2", display_name: "Ana" }],
    });
    db.queue("notebook_shares", {
      data: shareRow({ id: "nb-share-1", note_id: "nb-1" }),
    });
    const { onChanged } = renderDialog(db, {
      kind: "notebook",
      targetId: "nb-1",
    });

    fireEvent.change(screen.getByLabelText("Recipient email"), {
      target: { value: "ana@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await screen.findByText("Shared with Ana.");
    expect(db.from).toHaveBeenCalledWith("notebook_shares");
    expect(onChanged).toHaveBeenCalled();
  });

  it("refuses to share a notebook with its owner", async () => {
    const db = createFakeDb();
    db.queue("notebook_shares", { data: [] });
    db.queueRpc("find_profile_by_email", {
      data: [{ id: "user-1", display_name: "Ana" }],
    });

    renderDialog(db, { kind: "notebook", targetId: "nb-1" });

    fireEvent.change(screen.getByLabelText("Recipient email"), {
      target: { value: "ana@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await screen.findByText("You already own this notebook.");
  });

  it("rejects an unknown email", async () => {
    const db = createFakeDb();
    db.queue("note_shares", { data: [] });
    db.queueRpc("find_profile_by_email", { data: [] });

    renderDialog(db);

    fireEvent.change(screen.getByLabelText("Recipient email"), {
      target: { value: "nobody@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await screen.findByText("No account uses that email.");
  });

  it("changes a recipient's permission", async () => {
    const db = createFakeDb();
    db.queue("note_shares", {
      data: [shareRow({ shared_with: "user-2" })],
    });
    db.queue("public_profiles", {
      data: [{ id: "user-2", display_name: "Ana" }],
    });
    db.queue("note_shares", {
      data: shareRow({ shared_with: "user-2", permission: "edit" }),
    });
    const { onChanged } = renderDialog(db);

    await screen.findByText("Ana");
    fireEvent.change(
      within(screen.getByText("Ana").closest(".manage-row") as HTMLElement).getByRole(
        "combobox"
      ),
      { target: { value: "edit" } }
    );

    await screen.findByText("Permission updated.");
    expect(onChanged).toHaveBeenCalled();
  });

  it("removes a recipient after confirmation", async () => {
    const db = createFakeDb();
    db.queue("note_shares", {
      data: [shareRow({ shared_with: "user-2" })],
    });
    db.queue("public_profiles", {
      data: [{ id: "user-2", display_name: "Ana" }],
    });
    db.queue("note_shares", { data: null });
    const { onChanged } = renderDialog(db);

    await screen.findByText("Ana");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(screen.queryByText("Ana")).toBeNull()
    );
    expect(onChanged).toHaveBeenCalled();
  });
});
