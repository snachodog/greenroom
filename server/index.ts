import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { WebSocket } from 'ws';
import { openDb, listMessages, type DB } from './db.js';
import { Engine, RATE_MS, type Generator } from './engine.js';
import { fetchBatch, llmConfigFromEnv } from './llm.js';

const rateSchema = z.enum(Object.keys(RATE_MS) as [keyof typeof RATE_MS, ...(keyof typeof RATE_MS)[]]);
const createSchema = z.object({ title: z.string().trim().min(1).max(120), category: z.string().trim().min(1).max(60), rate: rateSchema.default('normal') });
const patchSchema = z.object({ topic: z.string().trim().max(200).optional(), rate: rateSchema.optional(), paused: z.boolean().optional() });

export async function buildApp(db: DB, generate: Generator) {
  const app = Fastify({ logger: { level: 'warn' } });
  const clients = new Map<number, Set<WebSocket>>();

  const engine = new Engine(db, (sessionId, type, data) => {
    const payload = JSON.stringify({ type, data });
    clients.get(sessionId)?.forEach((ws) => ws.readyState === 1 && ws.send(payload));
  }, generate);

  await app.register(websocket);
  await app.register(fastifyStatic, { root: join(fileURLToPath(import.meta.url), '../../public') });

  app.get('/ws', { websocket: true }, (socket, req) => {
    const id = Number((req.query as { session?: string }).session);
    if (!Number.isInteger(id)) return socket.close();
    if (!clients.has(id)) clients.set(id, new Set());
    clients.get(id)!.add(socket);
    socket.on('close', () => clients.get(id)?.delete(socket));
  });

  const session = (id: number) => db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  const idParam = (req: { params: unknown }) => Number((req.params as { id: string }).id);

  app.get('/api/personas', async () => db.prepare('SELECT * FROM personas ORDER BY id').all());

  app.get('/api/sessions/active', async (_req, reply) => {
    const row = db.prepare('SELECT id FROM sessions WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1').get() as { id: number } | undefined;
    return row ? { id: row.id } : reply.code(404).send({ error: 'no active session' });
  });

  app.post('/api/sessions', async (req, reply) => {
    const body = createSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    const open = db.prepare('SELECT id FROM sessions WHERE ended_at IS NULL').all() as { id: number }[];
    open.forEach((r) => {
      db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(Date.now(), r.id);
      engine.untrack(r.id);
    });
    const r = db
      .prepare('INSERT INTO sessions (started_at, title, category, settings_json) VALUES (?, ?, ?, ?)')
      .run(Date.now(), body.data.title, body.data.category, JSON.stringify({ rate: body.data.rate, paused: false }));
    const id = Number(r.lastInsertRowid);
    engine.track(id);
    return reply.code(201).send(session(id));
  });

  app.get('/api/sessions/:id', async (req, reply) => {
    const s = session(idParam(req));
    return s ? { ...s, ...engine.status(Number(s.id)) } : reply.code(404).send({ error: 'not found' });
  });

  app.get('/api/sessions/:id/messages', async (req) => listMessages(db, idParam(req)));

  app.patch('/api/sessions/:id', async (req, reply) => {
    const id = idParam(req);
    const s = session(id);
    if (!s) return reply.code(404).send({ error: 'not found' });
    if (s.ended_at !== null) return reply.code(409).send({ error: 'session ended' });
    const body = patchSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    const { topic, rate, paused } = body.data;
    if (topic !== undefined && topic !== s.topic) {
      db.prepare('UPDATE sessions SET topic = ? WHERE id = ?').run(topic, id);
      engine.flush(id);
    }
    if (rate !== undefined || paused !== undefined) {
      const next = { ...engine.settings(id), ...(rate !== undefined && { rate }), ...(paused !== undefined && { paused }) };
      db.prepare('UPDATE sessions SET settings_json = ? WHERE id = ?').run(JSON.stringify(next), id);
    }
    const status = engine.status(id);
    clients.get(id)?.forEach((ws) => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'status', data: status })));
    return status;
  });

  app.post('/api/sessions/:id/end', async (req, reply) => {
    const id = idParam(req);
    if (!session(id)) return reply.code(404).send({ error: 'not found' });
    db.prepare('UPDATE sessions SET ended_at = COALESCE(ended_at, ?) WHERE id = ?').run(Date.now(), id);
    engine.untrack(id);
    const status = engine.status(id);
    clients.get(id)?.forEach((ws) => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'status', data: status })));
    return status;
  });

  app.post('/api/messages/:id/ack', async (req, reply) => {
    const id = idParam(req);
    db.prepare('UPDATE messages SET acknowledged_at = COALESCE(acknowledged_at, ?) WHERE id = ?').run(Date.now(), id);
    const msg = engine.getMessage(id);
    return msg ?? reply.code(404).send({ error: 'not found' });
  });

  app.addHook('onReady', async () => engine.start());
  app.addHook('onClose', async () => engine.stop());
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb(join(process.env.DATA_DIR ?? './data', 'greenroom.sqlite'));
  const cfg = llmConfigFromEnv();
  const app = await buildApp(db, (ctx) => fetchBatch(cfg, ctx));
  const host = process.env.HOST ?? '127.0.0.1';
  await app.listen({ host, port: Number(process.env.PORT ?? 3000) });
}
