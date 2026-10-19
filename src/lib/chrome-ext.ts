/**
 * The extension's manifest, built for one Crate: this Crate's address joins the pages its pairing
 * script runs on, so a copy downloaded here pairs itself on this site and nowhere else.
 */
type Manifest = { content_scripts?: Array<{ matches: string[]; js: string[]; run_at?: string }>; host_permissions?: string[] };

export function manifestFor(raw: string, origin: string): string {
  const m = JSON.parse(raw) as Manifest;
  const pattern = `${origin.replace(/\/$/, "")}/*`;
  const pairing = (m.content_scripts ?? []).find((c) => c.js.includes("sites/crate.js"));
  if (pairing && !pairing.matches.includes(pattern)) pairing.matches.push(pattern);
  // Host permission too, so the pairing script can be put into a Crate tab that was already open.
  m.host_permissions = m.host_permissions ?? [];
  if (!m.host_permissions.includes(pattern)) m.host_permissions.push(pattern);
  return JSON.stringify(m, null, 2) + "\n";
}
