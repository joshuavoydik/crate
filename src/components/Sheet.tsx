"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Bottom sheet on mobile, centered dialog on larger screens. */
export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: React.ReactNode; label: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;
  // Portaled to <body> so page-level stacking contexts (and the mobile tab bar) never sit above it.
  return createPortal(
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label={label}>
      <div className="sheet-root__veil" onClick={onClose} />
      <div className="sheet">
        <div className="sheet__handle" />
        {children}
      </div>
    </div>,
    document.body,
  );
}
