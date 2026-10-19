"use client";

import { useState } from "react";
import { useStore } from "./Store";
import { Sheet } from "./Sheet";
import { Avatar } from "./Avatar";
import { api } from "@/lib/client";
import { normalizeInviteCode, INVITE_CODE_MAX } from "@/lib/invite";
import type { Me } from "@/lib/types";

/**
 * The one way to bring someone in, from any page: a sheet over whatever you were doing, with
 * the link big enough to tap, the system share where there is one, and the code to read out
 * across a table.
 */
export function InviteSheet() {
  const { me, crew, inviteOpen, closeInvite, refreshMe, toast } = useStore();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  if (!crew || !inviteOpen) return null;

  const url = `${location.origin}/join/${crew.inviteCode}`;
  const others = crew.members.filter((m) => m.id !== me.id);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const preview = normalizeInviteCode(slug);

  function startEditing() {
    setSlug(crew!.inviteCode);
    setEditing(true);
  }

  async function saveSlug(e: React.FormEvent) {
    e.preventDefault();
    if (!preview || preview === crew!.inviteCode) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await api<{ me: Me }>(`/api/crews/${crew!.id}`, { method: "PATCH", json: { inviteCode: preview } });
      await refreshMe();
      setEditing(false);
      toast("Your link is now yours");
    } catch (x) {
      toast((x as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast("Invite link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(url);
    }
  }

  async function share() {
    if (canShare) {
      try {
        await navigator.share({ title: `Join ${crew!.name} on Crate`, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    copy();
  }

  return (
    <Sheet open={inviteOpen} onClose={closeInvite} label="Invite someone">
      <div className="invite">
        <div className="invite__faces" aria-hidden>
          {crew.members.slice(0, 4).map((m) => (
            <Avatar key={m.id} name={m.name} url={m.avatarUrl} size={44} />
          ))}
          <span className="invite__plus">+</span>
        </div>
        <div className="caps">{crew.name}</div>
        <h3 className="display invite__title">Bring someone in.</h3>
        <p className="muted invite__lede">
          {others.length
            ? `Whoever opens this link joins you and ${others.map((m) => m.name.split(" ")[0]).join(", ")}. What they play and like lands in the same playlist.`
            : "Whoever opens this link lands in your crew. What you each play and like shows up in one playlist, and you see what they have on as they play it."}
        </p>
        {editing ? (
          <form className="invite__edit" onSubmit={saveSlug}>
            <label className="invite__editrow">
              <span className="invite__prefix">{location.host}/join/</span>
              <input
                className="field invite__slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                maxLength={INVITE_CODE_MAX}
                aria-label="Custom link"
                autoFocus
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <p className="faint invite__hint">
              {preview ? `Becomes ${location.host}/join/${preview}` : "Three to forty letters, numbers or dashes."}
            </p>
            <div className="send__actions" style={{ marginTop: 10 }}>
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="btn btn--sm" type="submit" disabled={saving || !preview}>
                {saving ? "Saving" : "Save link"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <button className="invite__link" onClick={copy} type="button" aria-label="Copy the invite link">
              <span className="invite__url">{url.replace(/^https?:\/\//, "")}</span>
              <span className="invite__copy">{copied ? "Copied" : "Copy"}</span>
            </button>
            <p className="faint invite__custom">
              <button className="linkbtn" type="button" onClick={startEditing}>
                Make the link yours
              </button>
            </p>
          </>
        )}
        <div className="invite__actions">
          <button className="btn btn--primary btn--block" onClick={share} type="button">
            {canShare ? "Share the link" : "Copy the link"}
          </button>
          <button className="btn btn--ghost btn--block" onClick={closeInvite} type="button">
            Later
          </button>
        </div>
        <p className="faint invite__code">
          Across a table? They can type the code <b>{crew.inviteCode}</b> on the first screen.
        </p>
      </div>
    </Sheet>
  );
}
