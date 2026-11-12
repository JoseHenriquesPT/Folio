import { useCallback, useRef, useState } from "react";
import type { DbClient } from "../db/supabase";
import {
  runImport,
  type ImportFailure,
  type ImportResult,
} from "../db/import";
import { isAbortError, toMessage } from "../lib/errors";
import { formatCount } from "../lib/format";
import { planFolioBackupImport } from "../lib/folioBackup";
import { planFolioVaultImport } from "../lib/folioVault";
import { detectImportFormat } from "../lib/importFormat";
import { planFromJoplin, type ImportPlan } from "../lib/importPlan";
import { planJoplinImport } from "../lib/joplin";
import { readTar } from "../lib/tar";

export type ImportPhase = "reading" | "importing";

export interface ImportStatus {
  running: boolean;
  phase: ImportPhase | null;
  completed: number;
  total: number;
  plan: ImportPlan | null;
  result: ImportResult | null;
  failures: ImportFailure[];
  error: string | null;
}

interface ToastLike {
  push: (message: string, tone: "success" | "error" | "info") => void;
}

interface Options {
  client: DbClient;
  toast: ToastLike;
  now?: () => Date;
}

const IDLE: ImportStatus = {
  running: false,
  phase: null,
  completed: 0,
  total: 0,
  plan: null,
  result: null,
  failures: [],
  error: null,
};

const UNKNOWN_FORMAT =
  "This file is not a Joplin export, a Folio vault zip, or a Folio JSON backup.";

function readFile(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () =>
      reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsArrayBuffer(file);
  });
}

/** The bytes pick the parser; the file name is only a fallback. */
function planImport(bytes: Uint8Array, fileName: string): Promise<ImportPlan> {
  const format = detectImportFormat(bytes, fileName);

  switch (format) {
    case "joplin":
      return Promise.resolve(planFromJoplin(planJoplinImport(readTar(bytes))));
    case "folio-vault":
      return planFolioVaultImport(bytes);
    case "folio-json":
      return Promise.resolve(
        planFolioBackupImport(new TextDecoder().decode(bytes))
      );
    default:
      return Promise.reject(new Error(UNKNOWN_FORMAT));
  }
}

function describe(source: ImportResult): string {
  const notes = formatCount(source.notes, "note");
  const problems = source.failures.length;
  if (problems === 0) return `Imported ${notes}.`;
  return `Imported ${notes} with ${formatCount(problems, "problem")}.`;
}

/**
 * Two-step import for all three formats: `preview` parses and plans without
 * writing, `run` executes the plan that is on screen. Cancel is checked between
 * notebooks and notes, so a stopped import keeps what it already created
 * without leaving half-uploaded attachments behind.
 */
export function useImport({ client, toast, now = () => new Date() }: Options) {
  const [status, setStatus] = useState<ImportStatus>(IDLE);
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controller.current?.abort();
  }, []);

  const reset = useCallback(() => {
    if (controller.current) return;
    setStatus(IDLE);
  }, []);

  const preview = useCallback(
    async (file: File): Promise<ImportPlan | null> => {
      if (controller.current) return null;

      setStatus({ ...IDLE, running: true, phase: "reading" });

      try {
        const plan = await planImport(await readFile(file), file.name);
        setStatus({
          ...IDLE,
          plan,
          total: plan.notes.length,
        });
        return plan;
      } catch (error) {
        const message = toMessage(error);
        setStatus({ ...IDLE, error: message });
        toast.push(message, "error");
        return null;
      }
    },
    [toast]
  );

  const run = useCallback(async () => {
    const plan = status.plan;
    if (!plan || controller.current) return;

    const own = new AbortController();
    controller.current = own;
    setStatus((current) => ({
      ...current,
      running: true,
      phase: "importing",
      completed: 0,
      error: null,
      result: null,
      failures: [],
    }));

    try {
      const result = await runImport({
        client,
        plan,
        now: now(),
        signal: own.signal,
        onProgress: ({ completed, total }) =>
          setStatus((current) => ({
            ...current,
            running: true,
            phase: "importing",
            completed,
            total,
          })),
      });

      setStatus((current) => ({
        ...current,
        running: false,
        phase: null,
        completed: result.notes,
        total: plan.notes.length,
        result,
        failures: result.failures,
      }));

      if (result.cancelled) {
        toast.push("Import cancelled.", "info");
      } else {
        toast.push(describe(result), result.failures.length > 0 ? "info" : "success");
      }
    } catch (error) {
      if (isAbortError(error)) {
        setStatus((current) => ({ ...current, running: false, phase: null }));
        toast.push("Import cancelled.", "info");
        return;
      }

      const message = toMessage(error);
      setStatus((current) => ({
        ...current,
        running: false,
        phase: null,
        error: message,
      }));
      toast.push(message, "error");
    } finally {
      controller.current = null;
    }
  }, [client, now, status.plan, toast]);

  return { ...status, preview, run, cancel, reset };
}

export type ImportController = ReturnType<typeof useImport>;
