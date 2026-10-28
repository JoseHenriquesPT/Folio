import { useCallback, useRef, useState } from "react";
import type { DbClient } from "../db/supabase";
import {
  downloadAttachmentFiles,
  fetchExportData,
  type ExportAttachmentRecord,
} from "../db/export";
import { isAbortError, toMessage } from "../lib/errors";
import { formatCount } from "../lib/format";
import { planJsonBackup, planVaultExport } from "../lib/exportPlan";
import { buildZip, saveBlob, type ArchiveEntry } from "../lib/archive";

export type ExportFormat = "vault" | "json";
export type ExportPhase = "loading" | "downloading" | "packing";

export interface ExportStatus {
  running: boolean;
  phase: ExportPhase | null;
  completed: number;
  total: number;
  error: string | null;
}

interface ToastLike {
  push: (message: string, tone: "success" | "error" | "info") => void;
}

interface Options {
  client: DbClient;
  ownerId: string;
  toast: ToastLike;
  now?: () => Date;
}

const IDLE: ExportStatus = {
  running: false,
  phase: null,
  completed: 0,
  total: 0,
  error: null,
};

/**
 * Runs one export at a time: the whole vault as a zip, or the JSON backup.
 * One AbortController covers the database pages, the attachment downloads, and
 * the zip step, so Cancel always has something to stop.
 */
export function useVaultExport({
  client,
  ownerId,
  toast,
  now = () => new Date(),
}: Options) {
  const [status, setStatus] = useState<ExportStatus>(IDLE);
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controller.current?.abort();
  }, []);

  const start = useCallback(
    async (format: ExportFormat) => {
      if (controller.current) return;

      const own = new AbortController();
      controller.current = own;
      setStatus({ ...IDLE, running: true, phase: "loading" });

      try {
        const data = await fetchExportData(client, {
          ownerId,
          signal: own.signal,
          onProgress: ({ completed, total }) =>
            setStatus({
              running: true,
              phase: "loading",
              completed,
              total,
              error: null,
            }),
        });

        const exportedAt = now();

        if (format === "json") {
          const backup = planJsonBackup(data, { now: exportedAt });
          saveBlob(
            new Blob([backup.content], { type: "application/json" }),
            backup.fileName
          );
          setStatus({ ...IDLE, completed: 1, total: 1 });
          toast.push("Backup downloaded.", "success");
          return;
        }

        const plan = planVaultExport(data, { now: exportedAt });
        const attachments: Array<
          Pick<ExportAttachmentRecord, "id" | "fileName" | "storagePath">
        > = [];

        for (const media of plan.media) {
          const storagePath = data.storagePaths.get(media.attachment.id);
          if (!storagePath) continue;
          attachments.push({
            id: media.attachment.id,
            fileName: media.attachment.fileName,
            storagePath,
          });
        }

        setStatus({
          running: true,
          phase: "downloading",
          completed: 0,
          total: attachments.length,
          error: null,
        });

        const files = await downloadAttachmentFiles({
          client,
          attachments,
          signal: own.signal,
          onProgress: (completed, total) =>
            setStatus({
              running: true,
              phase: "downloading",
              completed,
              total,
              error: null,
            }),
        });

        setStatus({
          running: true,
          phase: "packing",
          completed: attachments.length,
          total: attachments.length,
          error: null,
        });

        const entries: ArchiveEntry[] = plan.files.map((file) => ({
          path: file.path,
          text: file.content,
        }));

        for (const media of plan.media) {
          const bytes = files.get(media.attachment.id);
          if (bytes) entries.push({ path: media.path, bytes });
        }

        const archive = await buildZip(entries);
        saveBlob(
          new Blob([archive.slice()], { type: "application/zip" }),
          `${plan.root}.zip`
        );

        setStatus({
          ...IDLE,
          completed: attachments.length,
          total: attachments.length,
        });
        toast.push(
          `Exported ${formatCount(plan.counts.notes, "note")}.`,
          "success"
        );
      } catch (error) {
        if (isAbortError(error)) {
          setStatus(IDLE);
          toast.push("Export cancelled.", "info");
          return;
        }

        const message = toMessage(error);
        setStatus({ ...IDLE, error: message });
        toast.push(message, "error");
      } finally {
        controller.current = null;
      }
    },
    [client, now, ownerId, toast]
  );

  return { ...status, start, cancel };
}

export type VaultExportController = ReturnType<typeof useVaultExport>;
