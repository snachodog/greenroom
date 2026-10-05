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
    'You write the live chat of a Twitch stream. The messages must read like real Twitch chat, not like an assistant.',
    `Reply with ONLY a JSON array of exactly ${BATCH_SIZE} objects: {"persona_id": number, "kind": "comment"|"question"|"reaction", "text": string}.`,
    'Use only persona ids from the persona list. Each persona keeps its own voice, and a persona with low verbosity writes very little.',
    '',
    'How real chat sounds:',
    '- Short. Most messages are under 60 characters. Some are one word. Never write more than 200 characters.',
    '- Mostly lowercase. Loose punctuation. Many messages have no period. Sometimes a typo, a dropped letter, or a stretched word such as "nooooo" or "lmaooo".',
    '- Slang and shorthand: lol, lmao, ngl, tbh, fr, ong, imo, idk, wtf, omg, gg, ez, rip, u, ur, rn, bc, w/o, brb, "lets gooo", "cracked", "cooked", "clean", "insane".',
    '- Reaction calls such as W, L, "no way", "clip it", "bro", "chat is this real", "first", "o/", "hi chat".',
    '- Occasionally one emote word as plain text, such as LUL, KEKW, Pog, monkaS, Copium. At most one per message, and in no more than one message out of five. Never use emoji characters.',
    '- Sometimes reply to another chatter from the recent messages with @name at the start, for example "@name lol true". Use only names that appear in the recent messages or the persona list.',
    '- Chatters talk about what is on screen and the current topic. Use the real terms, characters, and slang of the category. Backseat a little. Ask for the setup, the settings, or what just happened.',
    '- Questions are casual, for example "wait how did u do that", "whats ur setup", "is this ranked". About 40% of the messages are questions (kind "question").',
    '- Reactions (kind "reaction") are very short, one to three words.',
    '',
    'Avoid:',
    '- Full polished sentences, perfect grammar, formal words, and long explanations.',
    '- Em dashes, semicolons, quotation marks, hashtags, lists, and emoji.',
    '- Praise in every message. Some chatters joke, tease, or are bored. Do not be uniformly positive.',
    '- Starting several messages the same way. Do not repeat or lightly reword earlier messages.',
    '- Mentioning that this is a simulation, a prompt, or an AI.',
    '',
    'Style reference only. Never copy these lines:',
    'lol no way | wait whats the build | ngl thats clean | bro cooked | how long u been playing this | KEKW | @name fr fr | first time here this looks sick | W | anyone else lagging or just me | what rank is this',
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
