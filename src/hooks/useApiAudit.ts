import { useCallback, useEffect, useState } from "react";
import type { DbClient } from "../db/supabase";
import {
  listApiAudit,
  undoApiUpdate,
  type ApiAuditEntry,
} from "../db/apiAudit";
import { toMessage } from "../lib/errors";

interface ToastLike {
  push: (message: string, tone: "success" | "error" | "info") => void;
}

interface Options {
  client: DbClient;
  toast: ToastLike;
  enabled: boolean;
}

export interface ApiAuditController {
  enabled: boolean;
  audit: ApiAuditEntry[];
  loading: boolean;
  error: string | null;
  busyId: number | null;
  undo: (id: number) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useApiAudit({
  client,
  toast,
  enabled,
}: Options): ApiAuditController {
  const [audit, setAudit] = useState<ApiAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setAudit([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setAudit(await listApiAudit(client));
    } catch (nextError) {
      setError(toMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [client, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const undo = useCallback(
    async (id: number): Promise<boolean> => {
      setBusyId(id);
      setError(null);
      try {
        await undoApiUpdate(client, id);
        toast.push("External change undone.", "success");
        await load();
        return true;
      } catch (nextError) {
        const message = toMessage(nextError);
        setError(message);
        toast.push(message, "error");
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [client, load, toast]
  );

  return {
    enabled,
    audit,
    loading,
    error,
    busyId,
    undo,
    refresh: load,
  };
}
