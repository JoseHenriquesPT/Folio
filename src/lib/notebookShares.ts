import { ownerShareBadge, permissionLabel } from "./shares";
import type { NotebookRow, NotebookShareRow } from "../db/database.types";

export interface NotebookBadge {
  label: string;
  title: string;
}

// Badges attach to the subtree root only: the tree's nesting already shows
// which notebooks hang under a shared one.
export function notebookBadges(
  notebooks: NotebookRow[],
  shares: NotebookShareRow[],
  userId: string,
  ownerNames: ReadonlyMap<string, string>
): Map<string, NotebookBadge> {
  const badges = new Map<string, NotebookBadge>();

  for (const notebook of notebooks) {
    if (notebook.owner_id === userId) {
      const count = shares.filter(
        (share) => share.notebook_id === notebook.id
      ).length;
      const label = ownerShareBadge(count);
      if (!label) continue;
      badges.set(notebook.id, {
        label,
        title: `Shared with ${count} ${
          count === 1 ? "person" : "people"
        }, including its sub-notebooks.`,
      });
      continue;
    }

    const own = shares.find(
      (share) =>
        share.notebook_id === notebook.id && share.shared_with === userId
    );
    if (!own) continue;
    const ownerName = ownerNames.get(notebook.owner_id) ?? "the owner";
    badges.set(notebook.id, {
      label: "Shared",
      title: `Shared by ${ownerName} · ${permissionLabel(own.permission)}.`,
    });
  }

  return badges;
}
