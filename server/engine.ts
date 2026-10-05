import { isDuplicate } from './dedupe.js';
import { insertMessage, listMessages, getMessage, type DB, type Message, type Persona } from './db.js';
import { recentLines, type PromptContext, type RawMessage } from './llm.js';

export type Rate = 'quiet' | 'normal' | 'busy';
export type Rand = () => number;

export const RATE_MS: Record<Rate, number> = { quiet: 90_000, normal: 40_000, busy: 15_000 };
export const PERSONA_COOLDOWN_MS = 3 * 60_000;
export const FOLLOWUP_AFTER_MS = 3 * 60_000;
export const FOLLOWUP_CHANCE = 0.3;
export const QUEUE_LOW = 2;
const LLM_RETRY_MS = 10_000;
const DEDUPE_WINDOW = 30;

export const FOLLOWUP_TEXTS = ['did you see my question?', 'hey, any thoughts on that?', 'curious what you think about my question', 'still wondering about this one'];

type Recent = { persona_id: number; created_at: number };

export function nextDelay(rate: Rate, rand: Rand = Math.random): number {
  return RATE_MS[rate] * (0.5 + rand());
}

export function nextJoinDelay(rand: Rand = Math.random): number {
  return (4 + rand() * 4) * 60_000;
}

export function eligiblePersonas(personas: Persona[], recent: Recent[], now: number): Persona[] {
  const last = recent.length ? recent[recent.length - 1].persona_id : null;
  const cooling = new Set(recent.filter((r) => now - r.created_at < PERSONA_COOLDOWN_MS).map((r) => r.persona_id));
  return personas.filter((p) => p.active === 1 && p.id !== last && !cooling.has(p.id));
}

export function pickPersona(personas: Persona[], recent: Recent[], now: number, rand: Rand = Math.random): Persona | null {
  const pool = eligiblePersonas(personas, recent, now);
  return pool.length ? pool[Math.floor(rand() * pool.length)] : null;
}

export function pickFromQueue(queue: RawMessage[], personas: Persona[], recent: Recent[], now: number, recentTexts: string[]): { index: number; dropped: number[] } {
  const ok = new Set(eligiblePersonas(personas, recent, now).map((p) => p.id));
  const dropped: number[] = [];
  for (let i = 0; i < queue.length; i++) {
    if (isDuplicate(queue[i].text, recentTexts)) dropped.push(i);
    else if (ok.has(queue[i].persona_id)) return { index: i, dropped };
  }
  return { index: -1, dropped };
}

export function dueFollowups(messages: Message[], now: number, rolled: Set<number>): Message[] {
  return messages.filter((m) => m.kind === 'question' && m.acknowledged_at === null && now - m.created_at >= FOLLOWUP_AFTER_MS && !rolled.has(m.id));
}

export function shouldFollowup(rand: Rand = Math.random): boolean {
  return rand() < FOLLOWUP_CHANCE;
}

export type SessionSettings = { rate: Rate; paused: boolean };
export type Broadcast = (sessionId: number, type: 'message' | 'status', data: unknown) => void;
export type Generator = (ctx: PromptContext) => Promise<RawMessage[]>;

type State = {
  id: number;
  queue: RawMessage[];
  epoch: number;
  nextAt: number;
  nextJoinAt: number;
  refilling: boolean;
  retryAt: number;
  rolled: Set<number>;
};

export class Engine {
  private states = new Map<number, State>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private db: DB,
    private broadcast: Broadcast,
    private generate: Generator,
    private rand: Rand = Math.random,
    private clock: () => number = Date.now,
  ) {}

  start() {
    const rows = this.db.prepare('SELECT id FROM sessions WHERE ended_at IS NULL').all() as { id: number }[];
    rows.forEach((r) => this.track(r.id));
    this.timer = setInterval(() => void this.tick(), 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  track(sessionId: number) {
    const now = this.clock();
    const settings = this.settings(sessionId);
    this.states.set(sessionId, {
      id: sessionId,
      queue: [],
      epoch: 0,
      nextAt: now + nextDelay(settings.rate, this.rand) / 4,
      nextJoinAt: now + nextJoinDelay(this.rand),
      refilling: false,
      retryAt: 0,
      rolled: new Set(),
    });
  }

  untrack(sessionId: number) {
    this.states.delete(sessionId);
  }

  flush(sessionId: number) {
    const s = this.states.get(sessionId);
    if (!s) return;
    s.queue = [];
    s.epoch++;
    s.refilling = false;
    s.retryAt = 0;
  }

  settings(sessionId: number): SessionSettings {
    const row = this.db.prepare('SELECT settings_json FROM sessions WHERE id = ?').get(sessionId) as { settings_json: string } | undefined;
    const parsed = row ? JSON.parse(row.settings_json) : {};
    return { rate: parsed.rate in RATE_MS ? parsed.rate : 'normal', paused: parsed.paused === true };
  }

  async tick() {
    const now = this.clock();
    for (const s of this.states.values()) {
      if (this.settings(s.id).paused) continue;
      this.emitDue(s, now);
      if (s.queue.length < QUEUE_LOW && !s.refilling && now >= s.retryAt) void this.refill(s);
    }
  }

  private personas(): Persona[] {
    return this.db.prepare('SELECT * FROM personas WHERE active = 1').all() as Persona[];
  }

  private push(s: State, p: { persona_id: number; kind: string; text: string }, now: number): Message {
    const msg = insertMessage(this.db, { session_id: s.id, created_at: now, ...p });
    this.broadcast(s.id, 'message', msg);
    return msg;
  }

  private emitDue(s: State, now: number) {
    const recent = listMessages(this.db, s.id, DEDUPE_WINDOW);
    const personas = this.personas();

    if (now >= s.nextJoinAt) {
      const who = pickPersona(personas, recent, now, this.rand);
      if (who) {
        this.push(s, { persona_id: who.id, kind: 'join', text: `${who.name} just showed up` }, now);
        s.nextJoinAt = now + nextJoinDelay(this.rand);
        return;
      }
    }

    for (const q of dueFollowups(recent, now, s.rolled)) {
      s.rolled.add(q.id);
      const free = eligiblePersonas(personas, recent, now).some((p) => p.id === q.persona_id);
      if (free && shouldFollowup(this.rand)) {
        const text = FOLLOWUP_TEXTS[Math.floor(this.rand() * FOLLOWUP_TEXTS.length)];
        this.push(s, { persona_id: q.persona_id, kind: 'followup', text }, now);
        return;
      }
    }

    if (now < s.nextAt) return;
    const texts = recent.map((m) => m.text);
    const { index, dropped } = pickFromQueue(s.queue, personas, recent, now, texts);
    const item = index >= 0 ? s.queue[index] : null;
    const remove = new Set(index >= 0 ? [...dropped, index] : dropped);
    s.queue = s.queue.filter((_, i) => !remove.has(i));
    if (item) {
      this.push(s, item, now);
      s.nextAt = now + nextDelay(this.settings(s.id).rate, this.rand);
    }
  }

  private async refill(s: State) {
    const epoch = s.epoch;
    s.refilling = true;
    try {
      const row = this.db.prepare('SELECT title, category, topic FROM sessions WHERE id = ?').get(s.id) as { title: string; category: string; topic: string };
      const recent = listMessages(this.db, s.id, 10);
      const batch = await this.generate({ ...row, recent: recentLines(recent), personas: this.personas() });
      if (epoch !== s.epoch || !this.states.has(s.id)) return;
      const texts = listMessages(this.db, s.id, DEDUPE_WINDOW).map((m) => m.text);
      for (const m of batch) {
        if (isDuplicate(m.text, [...texts, ...s.queue.map((q) => q.text)])) continue;
        s.queue.push(m);
      }
    } catch (err) {
      if (epoch === s.epoch) s.retryAt = this.clock() + LLM_RETRY_MS;
      console.error('llm refill failed:', (err as Error).message);
    } finally {
      if (epoch === s.epoch) s.refilling = false;
    }
  }

  status(sessionId: number) {
    const row = this.db.prepare('SELECT topic, ended_at FROM sessions WHERE id = ?').get(sessionId) as { topic: string; ended_at: number | null };
    return { ...this.settings(sessionId), topic: row.topic, ended: row.ended_at !== null };
  }

  getMessage(id: number) {
    return getMessage(this.db, id);
  }
}
