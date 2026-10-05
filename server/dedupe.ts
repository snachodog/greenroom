export function trigrams(text: string): Set<string> {
  const s = `  ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
}

export function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const g of ta) if (tb.has(g)) shared++;
  return shared / (ta.size + tb.size - shared);
}

export function isDuplicate(text: string, recent: string[], threshold = 0.6): boolean {
  return recent.some((r) => similarity(text, r) > threshold);
}
