"use client";

import { useState } from "react";
import { useStore } from "./Store";
import { Sheet } from "./Sheet";
import { Avatar } from "./Avatar";

/**
 * The one way to bring someone in, from any page: a sheet over whatever you were doing, with
 * the link big enough to tap, the system share where there is one, and the code to read out
 * across a table.
 */
export function InviteSheet() {
  const { me, crew, inviteOpen, closeInvite, toast } = useStore();
  const [copied, setCopied] = useState(false);
  if (!crew || !inviteOpen) return null;

  const url = `${location.origin}/join/${crew.inviteCode}`;
  const others = crew.members.filter((m) => m.id !== me.id);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

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
        <button className="invite__link" onClick={copy} type="button" aria-label="Copy the invite link">
          <span className="invite__url">{url.replace(/^https?:\/\//, "")}</span>
          <span className="invite__copy">{copied ? "Copied" : "Copy"}</span>
        </button>
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
