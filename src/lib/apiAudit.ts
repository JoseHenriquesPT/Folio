import type { Json } from "../db/database.types";

export interface AuditTargetInput {
  noteIds: string[];
  noteTitles: string[];
  summary: Json;
}

export function auditToolLabel(tool: string): string {
  switch (tool) {
    case "create_note":
      return "Created note";
    case "update_note":
      return "Updated note";
    case "move_notes":
      return "Moved notes";
    case "add_tags":
      return "Added tags";
    case "remove_tags":
      return "Removed tags";
    case "create_notebook":
      return "Created notebook";
    case "rename_notebook":
      return "Renamed notebook";
    case "undo_update":
      return "Undid a note update";
    default:
      return "External change";
  }
}

function textField(summary: Json, key: string): string | null {
  if (typeof summary !== "object" || summary === null || Array.isArray(summary)) {
    return null;
  }

  const value = (summary as Record<string, Json | undefined>)[key];
  return typeof value === "string" ? value : null;
}

export function auditTarget(entry: AuditTargetInput): string {
  const title = textField(entry.summary, "title");
  if (title) return title;

  const name = textField(entry.summary, "name");
  if (name) return name;

  if (entry.noteTitles.length === 1) return entry.noteTitles[0];
  if (entry.noteTitles.length > 1) return `${entry.noteTitles.length} notes`;
  if (entry.noteIds.length === 1) return "1 note";
  if (entry.noteIds.length > 1) return `${entry.noteIds.length} notes`;
  return "Notebook change";
}
