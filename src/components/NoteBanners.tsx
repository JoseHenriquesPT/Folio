import type { ReactNode } from "react";
import type { AutosaveStatus } from "../lib/autosave";
import type { NoteDraft } from "../lib/drafts";
import { formatRelativeTime } from "../lib/format";

interface NoteBannersProps {
  online: boolean;
  recovery: NoteDraft | null;
  status: AutosaveStatus;
  remoteChange: boolean;
  readOnlyReason: string;
  onRecoverDraft: () => void;
  onDiscardDraft: () => void;
  onReloadTheirs: () => void;
  onKeepMine: () => void;
  onRetry: () => void;
}

// The stack of status banners between the meta row and the toolbar: offline,
// draft recovery, conflict, save error, read-only. Purely presentational.
export default function NoteBanners({
  online,
  recovery,
  status,
  remoteChange,
  readOnlyReason,
  onRecoverDraft,
  onDiscardDraft,
  onReloadTheirs,
  onKeepMine,
  onRetry,
}: NoteBannersProps) {
  const banners: ReactNode[] = [];

  if (!online) {
    banners.push(
      <div key="offline" className="banner warning" role="status">
        You are offline. Changes stay in this browser until the connection
        returns.
      </div>
    );
  }

  if (recovery) {
    banners.push(
      <div key="recovery" className="banner" role="status">
        <span>
          An unsaved draft from {formatRelativeTime(recovery.savedAt)} is
          available.
        </span>
        <button type="button" className="link-button" onClick={onRecoverDraft}>
          Recover draft
        </button>
        <button
          type="button"
          className="link-button muted"
          onClick={onDiscardDraft}
        >
          Discard
        </button>
      </div>
    );
  }

  if (status === "conflict" || remoteChange) {
    banners.push(
      <div key="conflict" className="banner conflict" role="alert">
        <span>
          {status === "conflict"
            ? "This note changed elsewhere. Your draft is safe."
            : "This note changed elsewhere while you were editing. Your changes are still here."}
        </span>
        <button
          type="button"
          className="link-button"
          onClick={onReloadTheirs}
        >
          Reload theirs
        </button>
        <button type="button" className="link-button" onClick={onKeepMine}>
          Keep mine
        </button>
      </div>
    );
  }

  if (status === "error") {
    banners.push(
      <div key="error" className="banner error" role="alert">
        <span>Save failed. Your content is kept in this browser.</span>
        <button type="button" className="link-button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (readOnlyReason) {
    banners.push(
      <div key="readonly" className="banner muted" role="status">
        {readOnlyReason}
      </div>
    );
  }

  return <>{banners}</>;
}
