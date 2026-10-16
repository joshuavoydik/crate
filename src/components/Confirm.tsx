"use client";

import { Sheet } from "./Sheet";

/** A small "are you sure" for anything that removes something. */
export function Confirm({
  open,
  title,
  body,
  confirmLabel = "Remove",
  onConfirm,
  onClose,
  busy,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <h3 className="display" style={{ fontSize: 30, margin: "4px 0 8px" }}>
        {title}
      </h3>
      {body && (
        <p className="muted" style={{ fontSize: 15, margin: 0 }}>
          {body}
        </p>
      )}
      <div className="send__actions">
        <button className="btn btn--ghost" onClick={onClose} type="button">
          Cancel
        </button>
        <button className="btn btn--primary" onClick={onConfirm} disabled={busy} type="button" data-confirm>
          {busy ? "Removing" : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
