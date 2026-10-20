import { NextResponse } from "next/server";
import { currentUser, type SessionUser } from "./auth";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function error(message: string, status = 400): NextResponse {
  return json({ error: message }, status);
}

/** The request body as a JSON object; null for no body, bad JSON, or JSON that is not an object (every route here wants an object). */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    const v: unknown = await req.json();
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return v as T;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await currentUser();
  if (!user) return { response: error("Not signed in", 401) };
  return { user };
}

export function str(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}
