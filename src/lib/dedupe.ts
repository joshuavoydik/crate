/**
 * Doubles: the same thing written twice by two syncs that ran at once (a phone and a laptop both
 * opening the app, the cron under an open tab). Rows that share a key and fall within a window
 * of the first are one thing; the first is kept and the rest are its doubles.
 */
export function clusterDoubles<T>(rows: T[], keyOf: (r: T) => string, atOf: (r: T) => number, windowMs: number): Array<{ keep: T; dups: T[] }> {
  const byKey = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = byKey.get(k);
    if (g) g.push(r);
    else byKey.set(k, [r]);
  }
  const out: Array<{ keep: T; dups: T[] }> = [];
  for (const group of byKey.values()) {
    group.sort((a, b) => atOf(a) - atOf(b));
    let cur: { keep: T; dups: T[] } | null = null;
    for (const r of group) {
      if (cur && atOf(r) - atOf(cur.keep) < windowMs) cur.dups.push(r);
      else {
        if (cur && cur.dups.length) out.push(cur);
        cur = { keep: r, dups: [] };
      }
    }
    if (cur && cur.dups.length) out.push(cur);
  }
  return out;
}
