// Handwritten mirror of the public schema in supabase/migrations.
// Regenerate from the local stack once the CLI types command is wired up.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProfileRow = {
  id: string;
  email: string;
  display_name: string;
  is_owner: boolean;
  created_at: string;
  updated_at: string;
};

export type PublicProfileRow = {
  id: string;
  display_name: string;
};

export type NotebookRow = {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type TagRow = {
  id: string;
  owner_id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type NoteRow = {
  id: string;
  owner_id: string;
  notebook_id: string | null;
  title: string;
  body_html: string;
  body_text: string;
  search: unknown;
  pinned: boolean;
  archived: boolean;
  deleted_at: string | null;
  version: number;
  last_edited_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NoteShareRow = {
  id: string;
  note_id: string;
  shared_with: string;
  permission: "read" | "edit";
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type NotebookShareRow = {
  id: string;
  notebook_id: string;
  shared_with: string;
  permission: "read" | "edit";
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type AttachmentRow = {
  id: string;
  note_id: string;
  owner_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type ApiTokenRow = {
  id: string;
  owner_id: string;
  name: string;
  token_hash: string;
  prefix: string;
  scope: "read" | "write";
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
  revoked_at: string | null;
};

export type ApiUsageRow = {
  token_id: string;
  day: string;
  calls: number;
};

export type ApiAuditRow = {
  id: number;
  owner_id: string;
  token_id: string | null;
  tool: string;
  status: "ok" | "error";
  note_ids: string[];
  summary: Json;
  before_snapshot: Json | null;
  created_at: string;
};

export type NoteTagRow = {
  note_id: string;
  tag_id: string;
  created_at: string;
};

export type NoteTagSummary = {
  id: string;
  name: string;
  color: string | null;
};

export type NoteSummaryRow = NoteRow & {
  tags: NoteTagSummary[];
  tag_ids: string[];
  attachment_count: number;
  share_count: number;
  share_recipients: string[];
  owner_display_name: string | null;
  my_share_permission: "read" | "edit" | null;
  notebook_share_count: number;
};

export type TagSummaryRow = TagRow & {
  note_count: number;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: {
          id: string;
          email: string;
          display_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
        };
        Relationships: [];
      };
      notebooks: {
        Row: NotebookRow;
        Insert: {
          id?: string;
          owner_id?: string;
          parent_id?: string | null;
          name: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          parent_id?: string | null;
          position?: number;
        };
        Relationships: [];
      };
      tags: {
        Row: TagRow;
        Insert: {
          id?: string;
          owner_id?: string;
          name: string;
          color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          color?: string | null;
        };
        Relationships: [];
      };
      notes: {
        Row: NoteRow;
        Insert: {
          id?: string;
          owner_id?: string;
          notebook_id?: string | null;
          title?: string;
          body_html?: string;
          body_text?: string;
          pinned?: boolean;
          archived?: boolean;
          deleted_at?: string | null;
          version?: number;
          last_edited_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          notebook_id?: string | null;
          title?: string;
          body_html?: string;
          pinned?: boolean;
          archived?: boolean;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      note_tags: {
        Row: NoteTagRow;
        Insert: {
          note_id: string;
          tag_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      note_shares: {
        Row: NoteShareRow;
        Insert: {
          id?: string;
          note_id: string;
          shared_with: string;
          permission: "read" | "edit";
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          permission?: "read" | "edit";
        };
        Relationships: [];
      };
      notebook_shares: {
        Row: NotebookShareRow;
        Insert: {
          id?: string;
          notebook_id: string;
          shared_with: string;
          permission: "read" | "edit";
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          permission?: "read" | "edit";
        };
        Relationships: [];
      };
      attachments: {
        Row: AttachmentRow;
        Insert: {
          id?: string;
          note_id: string;
          owner_id?: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          created_at?: string;
        };
        Update: {
          file_name?: string;
          mime_type?: string;
        };
        Relationships: [];
      };
      api_tokens: {
        Row: ApiTokenRow;
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          token_hash: string;
          prefix: string;
          scope: "read" | "write";
          created_at?: string;
          last_used_at?: string | null;
          expires_at: string;
          revoked_at?: string | null;
        };
        Update: {
          last_used_at?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      api_usage: {
        Row: ApiUsageRow;
        Insert: {
          token_id: string;
          day?: string;
          calls?: number;
        };
        Update: {
          calls?: number;
        };
        Relationships: [];
      };
      api_audit: {
        Row: ApiAuditRow;
        Insert: {
          id?: number;
          owner_id: string;
          token_id?: string | null;
          tool: string;
          status: "ok" | "error";
          note_ids?: string[];
          summary?: Json;
          before_snapshot?: Json | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      public_profiles: {
        Row: PublicProfileRow;
        Relationships: [];
      };
      note_summaries: {
        Row: NoteSummaryRow;
        Relationships: [];
      };
      tag_summaries: {
        Row: TagSummaryRow;
        Relationships: [];
      };
    };
    Functions: {
      attachment_usage: {
        Args: Record<string, never>;
        Returns: { total_bytes: number; attachment_count: number }[];
      };
      can_edit_note: {
        Args: { target_note_id: string };
        Returns: boolean;
      };
      can_read_note: {
        Args: { target_note_id: string };
        Returns: boolean;
      };
      can_read_notebook: {
        Args: { target_notebook_id: string };
        Returns: boolean;
      };
      find_profile_by_email: {
        Args: { candidate_email: string };
        Returns: PublicProfileRow[];
      };
      my_note_share_permission: {
        Args: { target_note_id: string };
        Returns: "read" | "edit" | null;
      };
      notebook_share_count: {
        Args: { target_note_id: string };
        Returns: number;
      };
      owns_note: {
        Args: { target_note_id: string };
        Returns: boolean;
      };
      reorder_notebooks: {
        Args: { p_parent_id: string | null; p_ordered_ids: string[] };
        Returns: NotebookRow[];
      };
      set_notebook_archived: {
        Args: { p_notebook_id: string; p_archived: boolean };
        Returns: number;
      };
      can_manage_api_tokens: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      create_api_token: {
        Args: {
          p_name: string;
          p_scope: "read" | "write";
          p_expires_at: string;
        };
        Returns: {
          id: string;
          token: string;
          prefix: string;
          scope: "read" | "write";
          expires_at: string;
        }[];
      };
      list_api_tokens: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          name: string;
          prefix: string;
          scope: "read" | "write";
          created_at: string;
          last_used_at: string | null;
          expires_at: string;
          revoked_at: string | null;
          calls_today: number;
        }[];
      };
      revoke_api_token: {
        Args: { p_id: string };
        Returns: boolean;
      };
      list_api_audit: {
        Args: { p_limit?: number };
        Returns: {
          id: number;
          tool: string;
          status: string;
          note_ids: string[];
          note_titles: string[];
          summary: Json;
          token_name: string | null;
          token_prefix: string | null;
          created_at: string;
          can_undo: boolean;
        }[];
      };
      undo_api_update: {
        Args: { p_audit_id: number };
        Returns: Json;
      };
      save_note: {
        Args: {
          target_note_id: string;
          expected_version: number;
          new_title: string;
          new_body_html: string;
        };
        Returns: NoteRow;
      };
      storage_note_id: {
        Args: { object_name: string };
        Returns: string | null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
