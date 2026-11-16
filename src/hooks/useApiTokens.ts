import { useCallback, useEffect, useState } from "react";
import type { DbClient } from "../db/supabase";
import {
  canManageApiTokens,
  createApiToken,
  listApiTokens,
  revokeApiToken,
  type ApiTokenScope,
  type ApiTokenSummary,
  type CreatedApiToken,
} from "../db/apiTokens";
import { toMessage } from "../lib/errors";

interface ToastLike {
  push: (message: string, tone: "success" | "error" | "info") => void;
}

export interface CreateApiTokenInput {
  name: string;
  scope: ApiTokenScope;
  expiresAt: string;
}

export interface ApiTokensController {
  canManage: boolean | null;
  tokens: ApiTokenSummary[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  created: CreatedApiToken | null;
  create: (input: CreateApiTokenInput) => Promise<boolean>;
  revoke: (id: string) => Promise<boolean>;
  dismissCreated: () => void;
  refresh: () => Promise<void>;
  clearError: () => void;
}

interface Options {
  client: DbClient;
  toast: ToastLike;
}

export function useApiTokens({ client, toast }: Options): ApiTokensController {
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedApiToken | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allowed = await canManageApiTokens(client);
      setCanManage(allowed);
      setTokens(allowed ? await listApiTokens(client) : []);
    } catch (nextError) {
      setError(toMessage(nextError));
      setCanManage(null);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const reportFailure = useCallback(
    (nextError: unknown): false => {
      const message = toMessage(nextError);
      setError(message);
      toast.push(message, "error");
      return false;
    },
    [toast]
  );

  // The raw token is already safe in `created`, and a revocation is already
  // recorded in the database; a failed list refresh must not turn either into
  // an error. The next visit refetches the canonical list.
  const refreshTokens = useCallback(async () => {
    try {
      setTokens(await listApiTokens(client));
    } catch {
      /* Keep the current list. */
    }
  }, [client]);

  const create = useCallback(
    async (input: CreateApiTokenInput): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const next = await createApiToken(client, input);
        setCreated(next);
        toast.push("Access token created.", "success");
        await refreshTokens();
        return true;
      } catch (nextError) {
        return reportFailure(nextError);
      } finally {
        setBusy(false);
      }
    },
    [client, refreshTokens, reportFailure, toast]
  );

  const revoke = useCallback(
    async (id: string): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const revoked = await revokeApiToken(client, id);
        if (!revoked) {
          throw new Error("The token could not be revoked.");
        }

        setTokens((current) =>
          current.map((token) =>
            token.id === id
              ? { ...token, revokedAt: new Date().toISOString() }
              : token
          )
        );
        toast.push("Access token revoked.", "success");
        await refreshTokens();
        return true;
      } catch (nextError) {
        return reportFailure(nextError);
      } finally {
        setBusy(false);
      }
    },
    [client, refreshTokens, reportFailure, toast]
  );

  const dismissCreated = useCallback(() => setCreated(null), []);
  const clearError = useCallback(() => setError(null), []);

  return {
    canManage,
    tokens,
    loading,
    error,
    busy,
    created,
    create,
    revoke,
    dismissCreated,
    refresh: load,
    clearError,
  };
}
