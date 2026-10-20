import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Only public web addresses are fetched on a person's behalf. Anything that points back at this
 * server, a private network, the loopback or a cloud metadata address is refused before a
 * single byte moves, so pasting a link can never read what the server itself can reach.
 */

function privateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function privateV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return true;
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateV4(mapped[1]);
  return s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb") || s.startsWith("ff");
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return privateV4(ip);
  if (v === 6) return privateV6(ip);
  return true;
}

const LOCAL_NAMES = /(^|\.)(localhost|local|internal|intranet|home|lan|corp|test|example|invalid)$/i;

/** The URL when it is a public http(s) address, else null. Resolves the host so a name cannot stand in for a private address. */
export async function publicHttpUrl(input: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host || LOCAL_NAMES.test(host)) return null;
  if (isIP(host)) return isPrivateAddress(host) ? null : u;
  try {
    const addrs = await lookup(host, { all: true, verbatim: true });
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return null;
  } catch {
    return null;
  }
  return u;
}
