import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DB } from './db.js';
import type { Generator } from './engine.js';
import type { Reminders } from './reminders.js';

const flag = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => (v ? 1 : 0));

const personaSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  style: z.string().trim().min(1).max(200),
  interests: z.string().trim().max(200),
  verbosity: z.enum(['low', 'medium', 'high']),
  skeptical: flag,
  active: flag,
});

const reminderSchema = z.object({
  label: z.string().trim().min(1).max(60),
  text: z.string().trim().min(1).max(200),
  interval_min: z.number().int().min(0).max(720),
  enabled: flag,
});

const KINDS = ['comment', 'question', 'reaction', 'join', 'followup'];

export function registerApi(app: FastifyInstance, db: DB, generate: Generator, reminders: Reminders) {
  const idOf = (req: { params: unknown }) => Number((req.params as { id: string }).id);

  function crud(path: string, table: string, schema: z.ZodObject, usedBy: string, hint: string) {
    const cols = Object.keys(schema.shape);
    const get = (id: number) => db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    app.get(`/api/${path}`, async () => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    app.post(`/api/${path}`, async (req, reply) => {
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: body.error.message });
      const r = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`).run(body.data);
      return reply.code(201).send(get(Number(r.lastInsertRowid)));
    });
    app.put(`/api/${path}/:id`, async (req, reply) => {
      const id = idOf(req);
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: body.error.message });
      const r = db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...body.data, id });
      return r.changes ? get(id) : reply.code(404).send({ error: 'not found' });
    });
    app.delete(`/api/${path}/:id`, async (req, reply) => {
      const id = idOf(req);
      const used = db.prepare(`SELECT 1 FROM ${usedBy} WHERE ${table === 'personas' ? 'persona_id' : 'reminder_id'} = ? LIMIT 1`).get(id);
      if (used) return reply.code(409).send({ error: hint });
      const r = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
      return r.changes ? { ok: true } : reply.code(404).send({ error: 'not found' });
    });
  }

  crud('personas', 'personas', personaSchema, 'messages', 'This persona has messages in past sessions. Turn it off instead.');
  crud('reminders', 'reminders', reminderSchema, 'reminder_events', 'This reminder has history in past sessions. Disable it instead.');

  app.get('/api/sessions/:id/reminders', async (req) => reminders.open(idOf(req)));
  app.post('/api/reminder-events/:id/done', async (req, reply) => reminders.done(idOf(req)) ?? reply.code(404).send({ error: 'not found' }));
  app.post('/api/reminder-events/:id/snooze', async (req, reply) => reminders.snooze(idOf(req)) ?? reply.code(404).send({ error: 'not found' }));

  app.post('/api/llm/test', async (_req, reply) => {
    const personas = db.prepare('SELECT * FROM personas WHERE active = 1').all() as Parameters<Generator>[0]['personas'];
    if (!personas.length) return reply.code(400).send({ ok: false, error: 'No active personas.' });
    const started = Date.now();
    try {
      const batch = await generate({ title: 'Connection test', category: 'Test', topic: '', recent: [], personas });
      return { ok: true, ms: Date.now() - started, count: batch.length, sample: batch[0]?.text ?? null };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  app.get('/api/report/:id', async (req, reply) => {
    const id = idOf(req);
    const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as { started_at: number; ended_at: number | null; title: string; category: string } | undefined;
    if (!s) return reply.code(404).send({ error: 'not found' });
    const counts = db.prepare('SELECT kind, COUNT(*) AS n FROM messages WHERE session_id = ? GROUP BY kind').all(id) as { kind: string; n: number }[];
    const by_kind = Object.fromEntries(KINDS.map((k) => [k, counts.find((c) => c.kind === k)?.n ?? 0]));
    const q = db.prepare("SELECT COUNT(*) AS total, SUM(acknowledged_at IS NOT NULL) AS acked FROM messages WHERE session_id = ? AND kind = 'question'").get(id) as { total: number; acked: number | null };
    const rem = db.prepare('SELECT COUNT(*) AS fired, SUM(done_at IS NOT NULL) AS done FROM reminder_events WHERE session_id = ?').get(id) as { fired: number; done: number | null };
    const acked = q.acked ?? 0;
    return {
      session: { id, title: s.title, category: s.category, started_at: s.started_at, ended_at: s.ended_at },
      duration_ms: (s.ended_at ?? Date.now()) - s.started_at,
      messages_total: counts.reduce((sum, c) => sum + c.n, 0),
      by_kind,
      questions: { total: q.total, acknowledged: acked, percent: q.total ? Math.round((acked / q.total) * 100) : null },
      reminders: { fired: rem.fired, done: rem.done ?? 0 },
    };
  });
}
