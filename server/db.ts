import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = Database.Database;

export type Persona = {
  id: number;
  name: string;
  color: string;
  style: string;
  interests: string;
  verbosity: string;
  skeptical: number;
  active: number;
};

export type Message = {
  id: number;
  session_id: number;
  persona_id: number;
  kind: string;
  text: string;
  created_at: number;
  acknowledged_at: number | null;
  persona_name?: string;
  persona_color?: string;
};

const MIGRATIONS = [
  `CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    settings_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE personas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    style TEXT NOT NULL,
    interests TEXT NOT NULL,
    verbosity TEXT NOT NULL,
    skeptical INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    persona_id INTEGER NOT NULL REFERENCES personas(id),
    kind TEXT NOT NULL CHECK (kind IN ('comment','question','reaction','join','followup')),
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    acknowledged_at INTEGER
  );
  CREATE INDEX messages_session ON messages(session_id, id);`,
];

const SEED_PERSONAS: Omit<Persona, 'id'>[] = [
  { name: 'newbie_nora', color: '#4cc9f0', style: 'curious newcomer, asks basic questions', interests: 'learning what the stream is about', verbosity: 'medium', skeptical: 0, active: 1 },
  { name: 'old_reliable', color: '#f9c74f', style: 'longtime regular, familiar and warm', interests: 'running jokes, past streams', verbosity: 'medium', skeptical: 0, active: 1 },
  { name: 'dr_deepdive', color: '#90be6d', style: 'topic expert, precise and detailed', interests: 'technical details of the topic', verbosity: 'high', skeptical: 0, active: 1 },
  { name: 'lurker_leo', color: '#adb5bd', style: 'lurker who rarely talks, very short', interests: 'watching quietly', verbosity: 'low', skeptical: 0, active: 1 },
  { name: 'why_wendy', color: '#f8961e', style: 'question-asker, always wants to know why', interests: 'reasons and motivations', verbosity: 'medium', skeptical: 0, active: 1 },
  { name: 'hype_harry', color: '#f72585', style: 'hype friend, enthusiastic, supportive', interests: 'celebrating wins', verbosity: 'low', skeptical: 0, active: 1 },
  { name: 'tip_tammy', color: '#43aa8b', style: 'practical tip-sharer, helpful', interests: 'shortcuts and settings', verbosity: 'medium', skeptical: 0, active: 1 },
  { name: 'doubting_dan', color: '#b5838d', style: 'mildly skeptical, polite pushback', interests: 'questioning claims', verbosity: 'medium', skeptical: 1, active: 0 },
];

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  seed(db);
  return db;
}

function migrate(db: DB) {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

function seed(db: DB) {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM personas').get() as { n: number }).n;
  if (count > 0) return;
  const insert = db.prepare(
    'INSERT INTO personas (name, color, style, interests, verbosity, skeptical, active) VALUES (@name, @color, @style, @interests, @verbosity, @skeptical, @active)',
  );
  db.transaction(() => SEED_PERSONAS.forEach((p) => insert.run(p)))();
}

const MESSAGE_SELECT = `SELECT m.*, p.name AS persona_name, p.color AS persona_color
  FROM messages m JOIN personas p ON p.id = m.persona_id`;

export function getMessage(db: DB, id: number): Message | undefined {
  return db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(id) as Message | undefined;
}

export function listMessages(db: DB, sessionId: number, limit = 200): Message[] {
  const rows = db
    .prepare(`${MESSAGE_SELECT} WHERE m.session_id = ? ORDER BY m.id DESC LIMIT ?`)
    .all(sessionId, limit) as Message[];
  return rows.reverse();
}

export function insertMessage(
  db: DB,
  m: { session_id: number; persona_id: number; kind: string; text: string; created_at: number },
): Message {
  const r = db
    .prepare('INSERT INTO messages (session_id, persona_id, kind, text, created_at) VALUES (@session_id, @persona_id, @kind, @text, @created_at)')
    .run(m);
  return getMessage(db, Number(r.lastInsertRowid))!;
}
