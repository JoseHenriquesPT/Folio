import { fireEvent, render, screen } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SessionContext } from "../auth/session";
import type { NotebookRow, NotebookShareRow } from "../db/database.types";
import { SupabaseProvider } from "../db/SupabaseProvider";
import { createFakeDb, type FakeDb } from "../test/fakeDb";
import { TEST_ENV } from "../test/fakeSupabase";
import { ConfirmProvider } from "./ConfirmProvider";
import NotebookDialog from "./NotebookDialog";
import { ToastProvider } from "./ToastProvider";
import { WorkspaceProvider } from "./WorkspaceProvider";

const session = { user: { id: "user-1" } } as unknown as Session;

function Providers({ db, children }: { db: FakeDb; children: ReactNode }) {
  return (
    <SupabaseProvider client={db.client} env={TEST_ENV}>
      <ToastProvider>
        <ConfirmProvider>
          <SessionContext.Provider value={session}>
            <WorkspaceProvider>{children}</WorkspaceProvider>
          </SessionContext.Provider>
        </ConfirmProvider>
      </ToastProvider>
    </SupabaseProvider>
  );
}

function notebook(overrides: Partial<NotebookRow> = {}): NotebookRow {
  return {
    id: "nb-1",
    owner_id: "user-1",
    parent_id: null,
    name: "Writing",
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function share(overrides: Partial<NotebookShareRow> = {}): NotebookShareRow {
  return {
    id: "nb-share-1",
    notebook_id: "nb-2",
    shared_with: "user-1",
    permission: "read",
    created_by: "user-2",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderDialog(
  notebooks: NotebookRow[],
  shares: NotebookShareRow[],
  names: Array<{ id: string; display_name: string }> = []
) {
  const db = createFakeDb();
  db.queue("notebooks", { data: notebooks });
  db.queue("tag_summaries", { data: [] });
  db.queue("notebook_shares", { data: shares });
  if (names.length > 0) db.queue("public_profiles", { data: names });

  return render(
    <Providers db={db}>
      <NotebookDialog open onClose={vi.fn()} />
    </Providers>
  );
}

describe("NotebookDialog sharing", () => {
  it("opens the notebook share dialog from an owned row", async () => {
    const db = createFakeDb();
    db.queue("notebooks", { data: [notebook()] });
    db.queue("tag_summaries", { data: [] });
    db.queue("notebook_shares", { data: [] });
    // The share dialog loads the notebook's own share rows when it opens.
    db.queue("notebook_shares", { data: [] });

    render(
      <Providers db={db}>
        <NotebookDialog open onClose={vi.fn()} />
      </Providers>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    await screen.findByRole("heading", { name: "Share notebook" });
  });

  it("keeps a notebook shared with me read-only and badged", async () => {
    renderDialog(
      [notebook({ id: "nb-2", owner_id: "user-2", name: "Theirs" })],
      [share()],
      [{ id: "user-2", display_name: "Alice" }]
    );

    await screen.findByText("Theirs");
    expect(screen.getByText("Shared")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Move Theirs" })).toBeNull();
  });

  it("offers only owned notebooks as parents", async () => {
    renderDialog(
      [
        notebook(),
        notebook({ id: "nb-2", owner_id: "user-2", name: "Theirs" }),
      ],
      [share()],
      [{ id: "user-2", display_name: "Alice" }]
    );

    const select = (await screen.findByLabelText(
      "Parent notebook"
    )) as HTMLSelectElement;
    expect(
      Array.from(select.options).map((option) => option.textContent)
    ).toEqual(["Top level", "Writing"]);
  });
});
