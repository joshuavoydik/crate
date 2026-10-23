import { getKeys } from "./keys";
import { appUrl } from "./app-url";

/**
 * One way out for email: Resend when there is an API key (needs a domain of your own), else SMTP
 * (a Gmail address with an app password does, for a small crew). Neither set means no email
 * sign-in; the sign-in page says so and offers the other doors.
 */
export async function mailConfigured(): Promise<boolean> {
  if (sink()) return true;
  const k = await getKeys();
  return !!k.RESEND_API_KEY || !!k.SMTP_URL;
}

/** Tests only: with CRATE_TEST_HOOKS=1, mail lands in memory instead of an inbox, read back by /api/test/mail. */
export const sentInTest: Array<{ to: string; subject: string; text: string; html: string; at: number }> = [];
function sink(): boolean {
  return process.env.CRATE_TEST_HOOKS === "1";
}

function fromAddress(k: { EMAIL_FROM: string; SMTP_URL: string }): string {
  if (k.EMAIL_FROM) return k.EMAIL_FROM;
  if (k.SMTP_URL) {
    try {
      const u = new URL(k.SMTP_URL);
      if (u.username) return `Crate <${decodeURIComponent(u.username)}>`;
    } catch {
      /* fall through */
    }
  }
  return `Crate <no-reply@${new URL(appUrl()).hostname}>`;
}

export async function sendMail(to: string, subject: string, text: string, html: string): Promise<void> {
  if (sink()) {
    sentInTest.push({ to, subject, text, html, at: Date.now() });
    return;
  }
  const k = await getKeys();
  const from = fromAddress(k);
  if (k.RESEND_API_KEY) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${k.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    if (!r.ok) throw new Error(`Email did not go out (Resend said ${r.status})`);
    return;
  }
  if (k.SMTP_URL) {
    const { createTransport } = await import("nodemailer");
    const t = createTransport(k.SMTP_URL);
    await t.sendMail({ from, to, subject, text, html });
    return;
  }
  throw new Error("Email is not set up on this Crate");
}

/** The sign-in email: one line, one link, nothing to learn. */
export function signInMail(link: string, crewLine: string | null): { subject: string; text: string; html: string } {
  const subject = "Your Crate sign-in link";
  const lead = crewLine ?? "Here is your way into Crate.";
  const text = `${lead}\n\nOpen this link on the device you want to use:\n${link}\n\nIt works for an hour, once. If you did not ask for it, ignore this.`;
  const html = `<div style="font:16px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:520px">
<p>${esc(lead)}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600">Open Crate</a></p>
<p style="color:#666;font-size:13px">Or paste this into the browser on the device you want to use:<br><span style="word-break:break-all">${esc(link)}</span></p>
<p style="color:#666;font-size:13px">It works for an hour, once. If you did not ask for it, ignore this.</p>
</div>`;
  return { subject, text, html };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
