import { describe, it, expect } from 'vitest';
import { nextDelay, nextJoinDelay, eligiblePersonas, pickPersona, pickFromQueue, dueFollowups, shouldFollowup, RATE_MS } from '../server/engine.js';
import type { Persona, Message } from '../server/db.js';

const persona = (id: number, over: Partial<Persona> = {}): Persona => ({ id, name: `p${id}`, color: '#fff', style: '', interests: '', verbosity: 'low', skeptical: 0, active: 1, ...over });
const personas = [persona(1), persona(2), persona(3), persona(4, { skeptical: 1, active: 0 })];
const NOW = 1_000_000_000;
const msg = (id: number, over: Partial<Message> = {}): Message => ({ id, session_id: 1, persona_id: 1, kind: 'question', text: 'q', created_at: NOW, acknowledged_at: null, ...over });

describe('nextDelay', () => {
  it('applies +/-50% jitter around the rate', () => {
    expect(nextDelay('normal', () => 0)).toBe(RATE_MS.normal * 0.5);
    expect(nextDelay('normal', () => 0.5)).toBe(RATE_MS.normal);
    expect(nextDelay('busy', () => 1)).toBe(RATE_MS.busy * 1.5);
  });
  it('spaces joins 4 to 8 minutes apart', () => {
    expect(nextJoinDelay(() => 0)).toBe(4 * 60_000);
    expect(nextJoinDelay(() => 1)).toBe(8 * 60_000);
  });
});

describe('persona picker', () => {
  it('never picks the previous persona', () => {
    const recent = [{ persona_id: 1, created_at: NOW - 10 * 60_000 }];
    expect(eligiblePersonas(personas, recent, NOW).map((p) => p.id)).toEqual([2, 3]);
  });
  it('limits each persona to one message per 3 minutes', () => {
    const recent = [
      { persona_id: 2, created_at: NOW - 2 * 60_000 },
      { persona_id: 1, created_at: NOW - 60_000 },
    ];
    expect(eligiblePersonas(personas, recent, NOW).map((p) => p.id)).toEqual([3]);
  });
  it('excludes skeptical personas unless enabled', () => {
    expect(eligiblePersonas(personas, [], NOW).map((p) => p.id)).not.toContain(4);
    const enabled = personas.map((p) => (p.id === 4 ? { ...p, active: 1 } : p));
    expect(eligiblePersonas(enabled, [], NOW).map((p) => p.id)).toContain(4);
  });
  it('returns null when nobody is eligible', () => {
    const recent = personas.map((p) => ({ persona_id: p.id, created_at: NOW - 1000 }));
    expect(pickPersona(personas, recent, NOW, () => 0)).toBeNull();
  });
});

describe('pickFromQueue', () => {
  const queue = [
    { persona_id: 1, kind: 'comment' as const, text: 'great stream today' },
    { persona_id: 2, kind: 'question' as const, text: 'what mic do you use' },
  ];
  it('skips items from ineligible personas', () => {
    const recent = [{ persona_id: 1, created_at: NOW - 1000 }];
    expect(pickFromQueue(queue, personas, recent, NOW, []).index).toBe(1);
  });
  it('reports duplicates as dropped', () => {
    const r = pickFromQueue(queue, personas, [], NOW, ['great stream today']);
    expect(r.dropped).toEqual([0]);
    expect(r.index).toBe(1);
  });
  it('returns -1 for an empty queue', () => {
    expect(pickFromQueue([], personas, [], NOW, []).index).toBe(-1);
  });
});

describe('followups', () => {
  it('selects unacknowledged questions older than 3 minutes', () => {
    const list = [
      msg(1, { created_at: NOW - 4 * 60_000 }),
      msg(2, { created_at: NOW - 60_000 }),
      msg(3, { created_at: NOW - 4 * 60_000, acknowledged_at: NOW }),
      msg(4, { created_at: NOW - 4 * 60_000, kind: 'comment' }),
    ];
    expect(dueFollowups(list, NOW, new Set()).map((m) => m.id)).toEqual([1]);
  });
  it('skips questions already rolled', () => {
    expect(dueFollowups([msg(1, { created_at: NOW - 4 * 60_000 })], NOW, new Set([1]))).toEqual([]);
  });
  it('uses a 30% chance', () => {
    expect(shouldFollowup(() => 0.29)).toBe(true);
    expect(shouldFollowup(() => 0.3)).toBe(false);
  });
});
