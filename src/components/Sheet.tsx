"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Bottom sheet on mobile, centered dialog on larger screens.
 * A modal dialog: focus moves inside when it opens, Tab stays inside, and focus goes back to
 * whatever had it when it closes.
 */
export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: React.ReactNode; label: string }) {
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // Parents pass a fresh onClose on every render; the focus work below must only run on open and close.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const topmost = () => {
      const all = document.querySelectorAll(".sheet-root");
      return all[all.length - 1] === rootRef.current;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !rootRef.current || !topmost()) return;
      const items = focusables(rootRef.current);
      if (items.length === 0) {
        e.preventDefault();
        sheetRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = rootRef.current.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first || active === sheetRef.current) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Something inside may focus itself (the send field does); otherwise the sheet takes focus
    // so a screen reader announces it and the next Tab lands on its first control.
    const raf = requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root || root.contains(document.activeElement)) return;
      sheetRef.current?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || !mounted) return null;
  // Portaled to <body> so page-level stacking contexts (and the mobile tab bar) never sit above it.
  return createPortal(
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label={label} ref={rootRef}>
      <div className="sheet-root__veil" onClick={onClose} />
      <div className="sheet" ref={sheetRef} tabIndex={-1}>
        <div className="sheet__handle" />
        <div className="sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
