import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "../auth/session";
import { useSupabase } from "../db/SupabaseProvider";
import type { NotebookShareRow } from "../db/database.types";
import { listNotebooks, type Notebook } from "../db/notebooks";
import { listVisibleNotebookShares } from "../db/notebookShares";
import { listProfilesByIds } from "../db/profiles";
import { listTagsWithCounts, type TagSummary } from "../db/tags";
import { toMessage } from "../lib/errors";
import { useToast } from "./ToastProvider";

interface WorkspaceContextValue {
  notebooks: Notebook[];
  notebookShares: NotebookShareRow[];
  sharedOwnerNames: ReadonlyMap<string, string>;
  tags: TagSummary[];
  version: number;
  loading: boolean;
  refreshNotebooks: () => Promise<void>;
  refreshTags: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const client = useSupabase();
  const session = useSession();
  const userId = session.user.id;
  const toast = useToast();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebookShares, setNotebookShares] = useState<NotebookShareRow[]>([]);
  const [sharedOwnerNames, setSharedOwnerNames] = useState<
    ReadonlyMap<string, string>
  >(new Map());
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const ready = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const bumpVersion = useCallback(() => {
    if (ready.current) setVersion((current) => current + 1);
  }, []);

  // Notebooks, the visible share rows and the display names behind them load
  // together: badges and share dialogs all read from this one snapshot.
  const refreshNotebooks = useCallback(async () => {
    try {
      const [rows, shares] = await Promise.all([
        listNotebooks(client),
        listVisibleNotebookShares(client),
      ]);
      const ownerIds = [
        ...new Set(
          rows
            .filter((notebook) => notebook.owner_id !== userId)
            .map((notebook) => notebook.owner_id)
        ),
      ];
      const profiles = ownerIds.length
        ? await listProfilesByIds(client, ownerIds)
        : [];
      if (mounted.current) {
        setNotebooks(rows);
        setNotebookShares(shares);
        setSharedOwnerNames(
          new Map(
            profiles.map((profile) => [profile.id, profile.display_name])
          )
        );
        bumpVersion();
      }
    } catch (nextError) {
      if (mounted.current) toast.push(toMessage(nextError), "error");
    }
  }, [bumpVersion, client, toast, userId]);

  const refreshTags = useCallback(async () => {
    try {
      const rows = await listTagsWithCounts(client);
      if (mounted.current) {
        setTags(rows);
        bumpVersion();
      }
    } catch (nextError) {
      if (mounted.current) toast.push(toMessage(nextError), "error");
    }
  }, [bumpVersion, client, toast]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([refreshNotebooks(), refreshTags()]);
    ready.current = true;
    if (mounted.current) setLoading(false);
  }, [refreshNotebooks, refreshTags]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      notebooks,
      notebookShares,
      sharedOwnerNames,
      tags,
      version,
      loading,
      refreshNotebooks,
      refreshTags,
    }),
    [
      loading,
      notebooks,
      notebookShares,
      refreshNotebooks,
      refreshTags,
      sharedOwnerNames,
      tags,
      version,
    ]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
