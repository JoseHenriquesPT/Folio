import { render, screen } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SessionContext } from "../auth/session";
import type { NoteSummary } from "../db/notes";
import { SupabaseProvider } from "../db/SupabaseProvider";
import { createFakeDb } from "../test/fakeDb";
import { TEST_ENV } from "../test/fakeSupabase";
import NoteCard from "./NoteCard";
import { ToastProvider } from "./ToastProvider";
import { WorkspaceProvider } from "./WorkspaceProvider";

const session = { user: { id: "user-1" } } as unknown as Session;

function summary(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: "note-1",
    owner_id: "user-1",
    notebook_id: null,
    title: "Garden",
    body_html: "<p>Tomatoes</p>",
    body_text: "Tomatoes",
    search: null,
    pinned: false,
    archived: false,
    deleted_at: null,
    version: 1,
    last_edited_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    tags: [],
    tag_ids: [],
    attachment_count: 0,
    share_count: 0,
    share_recipients: [],
    owner_display_name: null,
    my_share_permission: null,
    notebook_share_count: 0,
    ...overrides,
  };
}

function renderCard(note: NoteSummary) {
  const db = createFakeDb();
  db.queue("notebooks", { data: [] });
  db.queue("tag_summaries", { data: [] });
  db.queue("notebook_shares", { data: [] });

  return render(
    <SupabaseProvider client={db.client} env={TEST_ENV}>
      <ToastProvider>
        <SessionContext.Provider value={session}>
          <WorkspaceProvider>
            <MemoryRouter>
              <NoteCard
                note={note}
                mode="cards"
                hrefSearch=""
                onActions={vi.fn()}
                onDrop={vi.fn()}
              />
            </MemoryRouter>
          </WorkspaceProvider>
        </SessionContext.Provider>
      </ToastProvider>
    </SupabaseProvider>
  );
}

describe("NoteCard sharing badges", () => {
  it("marks owned notes that sit in a shared notebook", async () => {
    renderCard(summary({ notebook_share_count: 2 }));

    await screen.findByText("In shared notebook");
  });

  it("shows shared-by badges on a note reached through a notebook", async () => {
    renderCard(
      summary({
        owner_id: "user-2",
        owner_display_name: "Ana",
        my_share_permission: "read",
      })
    );

    await screen.findByText("Shared by Ana");
    expect(screen.getByText("Read only")).toBeTruthy();
  });

  it("stays quiet when nothing is shared", async () => {
    renderCard(summary());

    await screen.findByText("Garden");
    expect(screen.queryByText("In shared notebook")).toBeNull();
    expect(screen.queryByText("Shared")).toBeNull();
  });
});
