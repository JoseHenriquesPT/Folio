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

export type NoteTagRow = {
  note_id: string;
  tag_id: string;
  created_at: string;
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
    };
    Views: {
      public_profiles: {
        Row: PublicProfileRow;
        Relationships: [];
      };
    };
    Functions: {
      can_edit_note: {
        Args: { target_note_id: string };
        Returns: boolean;
      };
      can_read_note: {
        Args: { target_note_id: string };
        Returns: boolean;
      };
      find_profile_by_email: {
        Args: { candidate_email: string };
        Returns: PublicProfileRow[];
      };
      owns_note: {
        Args: { target_note_id: string };
        Returns: boolean;
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
