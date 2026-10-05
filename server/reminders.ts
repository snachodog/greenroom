import type { DB, Reminder } from './db.js';

export const SNOOZE_MS = 5 * 60_000;

export type ReminderPayload = {
  state: 'fired' | 'done' | 'snoozed';
  id: number;
  reminder_id: number;
  label: string;
  text: string;
  fired_at: number;
  snoozed_until: number | null;
  detail?: string;
};
export type ReminderBroadcast = (sessionId: number, type: 'reminder', data: ReminderPayload) => void;

type Row = Omit<ReminderPayload, 'state'> & { session_id: number; done_at: number | null };
type Slot = { interval: number; nextAt: number };

const EVENT_SELECT = `SELECT e.id, e.session_id, e.reminder_id, r.label, r.text, e.fired_at, e.snoozed_until, e.done_at
  FROM reminder_events e JOIN reminders r ON r.id = e.reminder_id`;

export class Reminders {
  private slots = new Map<number, Map<number, Slot>>();
  private resurfaced = new Set<number>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private db: DB,
    private broadcast: ReminderBroadcast,
    private clock: () => number = Date.now,
  ) {}

  start() {
    const rows = this.db.prepare('SELECT id FROM sessions WHERE ended_at IS NULL').all() as { id: number }[];
    rows.forEach((r) => this.track(r.id));
    this.timer = setInterval(() => this.tick(), 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  track(sessionId: number) {
    this.slots.set(sessionId, new Map());
  }

  untrack(sessionId: number) {
    this.slots.delete(sessionId);
  }

  tick() {
    const now = this.clock();
    const timed = this.db.prepare('SELECT * FROM reminders WHERE enabled = 1 AND interval_min > 0').all() as Reminder[];
    for (const [sessionId, slots] of this.slots) {
      const live = new Set(timed.map((r) => r.id));
      for (const id of slots.keys()) if (!live.has(id)) slots.delete(id);
      for (const r of timed) {
        const slot = slots.get(r.id);
        if (!slot || slot.interval !== r.interval_min) {
          slots.set(r.id, { interval: r.interval_min, nextAt: now + r.interval_min * 60_000 });
        } else if (now >= slot.nextAt) {
          slot.nextAt = now + r.interval_min * 60_000;
          this.fire(sessionId, r.id, now);
        }
      }
      this.resurface(sessionId, now);
    }
  }

  fireOnEvent(sessionId: number, detail: string) {
    if (!this.slots.has(sessionId)) return;
    const rows = this.db.prepare('SELECT id FROM reminders WHERE enabled = 1 AND interval_min = 0').all() as { id: number }[];
    rows.forEach((r) => this.fire(sessionId, r.id, this.clock(), detail, true));
  }

  open(sessionId: number): ReminderPayload[] {
    const now = this.clock();
    const rows = this.db
      .prepare(`${EVENT_SELECT} WHERE e.session_id = ? AND e.done_at IS NULL AND (e.snoozed_until IS NULL OR e.snoozed_until <= ?) ORDER BY e.id`)
      .all(sessionId, now) as Row[];
    return rows.map((r) => this.payload('fired', r));
  }

  done(eventId: number): ReminderPayload | undefined {
    this.db.prepare('UPDATE reminder_events SET done_at = COALESCE(done_at, ?) WHERE id = ?').run(this.clock(), eventId);
    return this.emit('done', eventId);
  }

  snooze(eventId: number): ReminderPayload | undefined {
    this.resurfaced.delete(eventId);
    this.db.prepare('UPDATE reminder_events SET snoozed_until = ? WHERE id = ? AND done_at IS NULL').run(this.clock() + SNOOZE_MS, eventId);
    return this.emit('snoozed', eventId);
  }

  private fire(sessionId: number, reminderId: number, now: number, detail?: string, always = false) {
    if (!always) {
      const pending = this.db.prepare('SELECT 1 FROM reminder_events WHERE session_id = ? AND reminder_id = ? AND done_at IS NULL').get(sessionId, reminderId);
      if (pending) return;
    }
    const r = this.db.prepare('INSERT INTO reminder_events (session_id, reminder_id, fired_at) VALUES (?, ?, ?)').run(sessionId, reminderId, now);
    this.emit('fired', Number(r.lastInsertRowid), detail);
  }

  private resurface(sessionId: number, now: number) {
    const rows = this.db
      .prepare(`${EVENT_SELECT} WHERE e.session_id = ? AND e.done_at IS NULL AND e.snoozed_until IS NOT NULL AND e.snoozed_until <= ?`)
      .all(sessionId, now) as Row[];
    for (const row of rows) {
      if (this.resurfaced.has(row.id)) continue;
      this.resurfaced.add(row.id);
      this.broadcast(sessionId, 'reminder', this.payload('fired', row));
    }
  }

  private emit(state: ReminderPayload['state'], eventId: number, detail?: string) {
    const row = this.db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(eventId) as Row | undefined;
    if (!row) return undefined;
    const payload = this.payload(state, row, detail);
    this.broadcast(row.session_id, 'reminder', payload);
    return payload;
  }

  private payload(state: ReminderPayload['state'], row: Row, detail?: string): ReminderPayload {
    const { session_id: _s, done_at: _d, ...rest } = row;
    return { state, ...rest, ...(detail && { detail }) };
  }
}
