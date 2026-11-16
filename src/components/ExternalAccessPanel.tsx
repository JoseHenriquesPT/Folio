import { useState, type FormEvent } from "react";
import type { ApiTokenSummary } from "../db/apiTokens";
import type { ApiTokensController } from "../hooks/useApiTokens";
import {
  TOKEN_DAILY_CALL_LIMIT,
  TOKEN_EXPIRY_DAYS,
  TOKEN_EXPIRY_LABELS,
  scopeDescription,
  scopeLabel,
  statusLabel,
  tokenExpiryDate,
  tokenPrefixLabel,
  tokenStatus,
  validateTokenName,
  type ApiTokenScope,
  type TokenExpiryDays,
} from "../lib/apiTokens";
import { formatDate, formatRelativeTime } from "../lib/format";
import { useConfirm } from "./ConfirmProvider";
import Modal from "./Modal";

interface ExternalAccessPanelProps {
  controller: ApiTokensController;
  now?: () => Date;
}

export default function ExternalAccessPanel({
  controller,
  now = () => new Date(),
}: ExternalAccessPanelProps) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Desktop");
  const [scope, setScope] = useState<ApiTokenScope>("read");
  const [expiryDays, setExpiryDays] = useState<TokenExpiryDays>(90);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  if (controller.canManage !== true) return null;

  const created = controller.created;
  const modalOpen = open || created !== null;
  const nameError = validateTokenName(name);

  function close() {
    if (controller.busy) return;
    setOpen(false);
    setCopied(false);
    setCopyError(null);
    controller.dismissCreated();
    controller.clearError();
  }

  function start() {
    setName("Desktop");
    setScope("read");
    setExpiryDays(90);
    setCopied(false);
    setCopyError(null);
    controller.clearError();
    setOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (nameError) return;

    const ok = await controller.create({
      name: name.trim(),
      scope,
      expiresAt: tokenExpiryDate(expiryDays, now()),
    });
    if (ok) setOpen(false);
  }

  async function copy() {
    if (!created) return;
    try {
      if (!navigator.clipboard) {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
      setCopyError(null);
    } catch {
      setCopyError(
        "Copy is not available. Select the token and copy it manually."
      );
    }
  }

  async function revoke(token: ApiTokenSummary) {
    const ok = await confirm({
      title: "Revoke access token",
      message: `Revoke “${token.name}”? Any client using it will stop working immediately.`,
      confirmLabel: "Revoke token",
      tone: "danger",
    });
    if (ok) await controller.revoke(token.id);
  }

  return (
    <div className="data-panel">
      <p className="muted">
        Connect an external client such as VS Code Copilot. Tokens are scoped,
        revocable, and only ever see what your account can see. Folio never
        calls an AI provider.
      </p>

      {controller.error ? (
        <p className="form-error" role="alert">
          {controller.error}
        </p>
      ) : null}

      {controller.tokens.length === 0 ? (
        <p className="muted">No tokens yet. Create one for each device you use.</p>
      ) : (
        <ul className="token-list">
          {controller.tokens.map((token) => {
            const status = tokenStatus(token, now());
            return (
              <li className="token-row" key={token.id}>
                <div className="token-row-head">
                  <span className="token-name">{token.name}</span>
                  <span className={`token-badge ${status}`}>
                    {statusLabel(status)}
                  </span>
                </div>
                <p className="token-prefix">
                  <code>{tokenPrefixLabel(token.prefix)}</code> ·{" "}
                  {scopeLabel(token.scope)}
                </p>
                <p className="token-meta">
                  {token.lastUsedAt
                    ? `Last used ${formatRelativeTime(token.lastUsedAt, now())}`
                    : "Never used"}
                  {" · "}
                  {token.callsToday.toLocaleString("en")} of{" "}
                  {TOKEN_DAILY_CALL_LIMIT.toLocaleString("en")} calls today
                  {" · "}
                  {status === "revoked"
                    ? "Revoked"
                    : `Expires ${formatDate(token.expiresAt)}`}
                </p>
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => void revoke(token)}
                  disabled={controller.busy || status === "revoked"}
                >
                  Revoke
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className="button"
        onClick={start}
        disabled={controller.busy}
      >
        New token
      </button>

      <p className="muted token-hint">
        Read tokens can search and read. Write tokens can also create, edit,
        move and tag notes and rename notebooks. Use a separate token for each
        device so a lost device can be revoked on its own. Each token is limited
        to 5,000 calls per day.
      </p>

      <Modal
        open={modalOpen}
        title={created ? "Copy access token" : "Create access token"}
        onClose={close}
      >
        {created ? (
          <div className="token-created">
            <p className="muted">
              Copy this token now. It will not be shown again.
            </p>
            <code className="token-secret">{created.token}</code>
            <p className="muted">
              {scopeDescription(created.scope)} It expires on{" "}
              {formatDate(created.expiresAt)}.
            </p>
            {copyError ? (
              <p className="form-error" role="alert">
                {copyError}
              </p>
            ) : null}
            <div className="dialog-actions">
              <button type="button" className="button" onClick={close}>
                Done
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => void copy()}
              >
                {copied ? "Copied" : "Copy token"}
              </button>
            </div>
          </div>
        ) : (
          <form className="settings-form" onSubmit={submit}>
            <label htmlFor="token-name">Device name</label>
            <input
              id="token-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoComplete="off"
            />
            {nameError ? (
              <p className="form-error" role="alert">
                {nameError}
              </p>
            ) : null}

            <label htmlFor="token-scope">Access</label>
            <select
              id="token-scope"
              value={scope}
              onChange={(event) =>
                setScope(event.target.value as ApiTokenScope)
              }
            >
              <option value="read">Read only — search and read</option>
              <option value="write">
                Read and write — edit, move, tag
              </option>
            </select>
            <p className="muted">{scopeDescription(scope)}</p>

            <label htmlFor="token-expiry">Expires</label>
            <select
              id="token-expiry"
              value={expiryDays}
              onChange={(event) =>
                setExpiryDays(Number(event.target.value) as TokenExpiryDays)
              }
            >
              {TOKEN_EXPIRY_DAYS.map((days) => (
                <option key={days} value={days}>
                  {TOKEN_EXPIRY_LABELS[days]}
                </option>
              ))}
            </select>

            <div className="dialog-actions">
              <button
                type="button"
                className="button ghost"
                onClick={close}
                disabled={controller.busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={controller.busy || nameError !== null}
              >
                {controller.busy ? "Creating..." : "Create token"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
