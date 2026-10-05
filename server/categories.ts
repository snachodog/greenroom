import { readFileSync } from 'node:fs';

type Snapshot = { snapshot: string; categories: string[] };

const data = JSON.parse(readFileSync(new URL('./categories.json', import.meta.url), 'utf8')) as Snapshot;

export const SNAPSHOT_DATE = data.snapshot;
export const CATEGORIES = data.categories;

const byLower = new Map(CATEGORIES.map((c) => [c.toLowerCase(), c]));

export function canonicalCategory(input: string): string | undefined {
  return byLower.get(input.trim().toLowerCase());
}
