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
import { useSupabase } from "../db/SupabaseProvider";
import { listNotebooks, type Notebook } from "../db/notebooks";
import { listTagsWithCounts, type TagSummary } from "../db/tags";
import { toMessage } from "../lib/errors";
import { useToast } from "./ToastProvider";

interface WorkspaceContextValue {
  notebooks: Notebook[];
  tags: TagSummary[];
  version: number;
  loading: boolean;
  refreshNotebooks: () => Promise<void>;
  refreshTags: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const client = useSupabase();
  const toast = useToast();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
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

  const refreshNotebooks = useCallback(async () => {
    try {
      const rows = await listNotebooks(client);
      if (mounted.current) {
        setNotebooks(rows);
        bumpVersion();
      }
    } catch (nextError) {
      if (mounted.current) toast.push(toMessage(nextError), "error");
    }
  }, [bumpVersion, client, toast]);

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
      tags,
      version,
      loading,
      refreshNotebooks,
      refreshTags,
    }),
    [loading, notebooks, refreshNotebooks, refreshTags, tags, version]
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
