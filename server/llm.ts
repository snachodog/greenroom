import { z } from 'zod';
import type { Persona, Message } from './db.js';

export const MAX_CHARS = 200;
export const BATCH_SIZE = 5;

export type PromptContext = {
  title: string;
  category: string;
  topic: string;
  recent: string[];
  personas: Persona[];
};

export type RawMessage = { persona_id: number; kind: 'comment' | 'question' | 'reaction'; text: string };

const itemSchema = z.object({
  persona_id: z.coerce.number().int(),
  kind: z.enum(['comment', 'question', 'reaction']),
  text: z.string().min(1),
});

export function buildPrompt(ctx: PromptContext): { system: string; user: string } {
  const cards = ctx.personas
    .map((p) => `- id ${p.id} "${p.name}": ${p.style}; interests: ${p.interests}; verbosity: ${p.verbosity}${p.skeptical ? '; mildly skeptical' : ''}`)
    .join('\n');
  const system = [
    'You simulate a live stream chat audience for a streamer who is practicing.',
    `Reply with ONLY a JSON array of exactly ${BATCH_SIZE} objects: {"persona_id": number, "kind": "comment"|"question"|"reaction", "text": string}.`,
    `Each text is at most ${MAX_CHARS} characters, written like casual live chat.`,
    'No hashtags. No emoji spam. About 40% of the messages must be questions (kind "question").',
    'Use only persona ids from the persona list. Do not repeat earlier messages.',
  ].join('\n');
  const user = [
    `Stream title: ${ctx.title}`,
    `Category: ${ctx.category}`,
    `Current topic: ${ctx.topic || '(not set)'}`,
    `Personas:\n${cards}`,
    `Last chat messages:\n${ctx.recent.length ? ctx.recent.join('\n') : '(none yet)'}`,
  ].join('\n\n');
  return { system, user };
}

export function parseBatch(raw: string, validPersonaIds: Set<number>): RawMessage[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: RawMessage[] = [];
  for (const item of data) {
    const r = itemSchema.safeParse(item);
    if (!r.success || !validPersonaIds.has(r.data.persona_id)) continue;
    const text = r.data.text.trim().slice(0, MAX_CHARS);
    if (text) out.push({ ...r.data, text });
  }
  return out;
}

export type LlmConfig = { baseUrl: string; apiKey: string; model: string };

export function llmConfigFromEnv(env = process.env): LlmConfig {
  return {
    baseUrl: (env.LLM_BASE_URL ?? '').replace(/\/+$/, ''),
    apiKey: env.LLM_API_KEY ?? '',
    model: env.LLM_MODEL ?? '',
  };
}

export async function fetchBatch(cfg: LlmConfig, ctx: PromptContext): Promise<RawMessage[]> {
  if (!cfg.baseUrl || !cfg.model) throw new Error('LLM_BASE_URL and LLM_MODEL must be set');
  const { system, user } = buildPrompt(ctx);
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 1,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? '';
  return parseBatch(content, new Set(ctx.personas.map((p) => p.id)));
}

export function recentLines(messages: Message[]): string[] {
  return messages.map((m) => `${m.persona_name}: ${m.text}`);
}
