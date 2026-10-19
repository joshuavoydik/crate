/**
 * A crew's invite link can be customized: crate.example/join/<slug>. The slug is lowercase
 * letters, digits and dashes, 3 to 40 long. Anything typed is bent into that shape (spaces and
 * punctuation become dashes); null when nothing usable is left.
 */
export const INVITE_CODE_MIN = 3;
export const INVITE_CODE_MAX = 40;

export function normalizeInviteCode(input: string): string | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (s.length < INVITE_CODE_MIN || s.length > INVITE_CODE_MAX) return null;
  return s;
}
