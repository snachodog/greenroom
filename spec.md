# Greenroom: simulated practice chat for streamers

## Purpose
Self-hosted web app. Streamer-only dashboard (second monitor) showing an AI-simulated chat audience, promo reminders, and post-stream stats. Simulated messages must never reach viewers.

## Hard rules
1. Never write to any streaming platform. No Twitch/YouTube/Kick APIs.
2. Dashboard refuses to render if navigator.userAgent contains "OBS"; show a full-screen warning instead.
3. Every simulated message displays a "SIM" badge.
4. Single user. Bind 127.0.0.1 unless HOST env is set. Optional APP_PASSWORD (basic auth) when HOST is not localhost.

## Stack (do not substitute or propose alternatives)
- Node 22, TypeScript run via tsx (no server build step), Fastify, @fastify/websocket, @fastify/static, better-sqlite3, zod, vitest.
- Frontend: vanilla HTML/CSS/JS ES modules in /public. No framework, no bundler.
- LLM: OpenAI-compatible POST {LLM_BASE_URL}/chat/completions. Env: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL.
- STT (Phase 3 only): whisper.cpp server, env STT_URL. App must work without it.
- Deploy: Dockerfile + docker-compose.yml, one service, volume at /data for SQLite.

## File tree
server/index.ts        Fastify setup, routes, ws
server/db.ts           schema, migrations, seed
server/engine.ts       scheduler, persona picker, queue
server/llm.ts          prompt build, batch call, JSON parse
server/dedupe.ts       trigram similarity
server/reminders.ts    reminder timers
server/stt.ts          Phase 3
public/index.html      dashboard
public/setup.html
public/settings.html
public/report.html
public/app.js, public/ws.js, public/style.css
test/engine.test.ts, test/dedupe.test.ts
.env.example, Dockerfile, docker-compose.yml, README.md, CLAUDE.md

## Data model (SQLite)
- sessions(id, started_at, ended_at, title, category, topic, settings_json)
- personas(id, name, color, style, interests, verbosity, skeptical INTEGER, active INTEGER)
- messages(id, session_id, persona_id, kind, text, created_at, acknowledged_at)
  kind in: comment, question, reaction, join, followup
- reminders(id, label, text, interval_min, enabled)
- reminder_events(id, session_id, reminder_id, fired_at, done_at, snoozed_until)
- transcript(id, session_id, text, started_at, ended_at)  (Phase 3)

## Engine
- 1s tick per active session. Rate setting: quiet ~90s, normal ~40s, busy ~15s between messages, +/-50% jitter.
- Persona picker: never same persona twice in a row; max 1 message per persona per 3 min; skeptical personas only if enabled.
- LLM batching: one call returns a JSON array of 5 messages {persona_id, kind, text}. Refill when queue < 2 or when topic changes (flush queue on topic change).
- Prompt context: session title, category, current topic, last 8 transcript lines if any, last 10 sim messages, active persona cards. Messages max 200 chars, chat-style, no hashtags, no emoji spam, about 40% questions.
- Dedupe: drop any message with trigram similarity > 0.6 against the last 30.
- Followup: if a question is unacknowledged after 3 min, 30% chance the same persona sends a short followup.
- Join events: every 4-8 min emit a "join" message ("<name> just showed up") which also fires a "Welcome them" reminder.
- Seed 8 personas: curious newcomer, longtime regular, topic expert, lurker who rarely talks, question-asker, hype friend, practical tip-sharer, mildly skeptical (inactive by default).

## Reminders
Seed defaults: ask for follow (20m), socials/Discord (30m), stream schedule (45m), recap for new arrivals (25m), hydrate/posture (60m). Show as a banner with Done / Snooze 5m. Log every fire and resolution.

## UI
- Dashboard: chat column (persona color + SIM badge, click to acknowledge), topic input (Enter updates topic), rate selector, pause, reminder banners, session timer, End Session button.
- Setup: title, category, rate, start.
- Settings: personas CRUD, reminders CRUD, "Test LLM" button.
- Report /report.html?id=N: duration, messages by kind, % questions acknowledged, reminders done vs fired, dead-air count (Phase 3).
- Dark, high contrast, large font. Shortcuts: Space pause, T focus topic, D mark top reminder done.

## API
REST JSON under /api (sessions, personas, reminders, messages/:id/ack, report/:id). WebSocket /ws pushes {type: "message"|"reminder"|"status", data}.

## Phases
P1: db, seed, setup page, dashboard, engine, llm batching, dedupe, ws, ack. Done when: a session starts, messages appear at the chosen rate, topic change flushes the queue, ack persists, tests pass.
P2: reminders, settings page, report page, auth, Dockerfile, compose, README. Done when: docker compose up serves the app and the report shows correct stats.
P3: browser mic capture -> chunks POSTed to server -> whisper.cpp -> transcript table -> fed into prompts. Dead-air nudge after 45s of no speech, with one suggested talking point. Done when: comments reference recent speech.

## Out of scope
Multi-user, reading real platform chat, mobile app, analytics beyond the report.

## Conventions for Claude Code
- Build only the requested phase. Do not stub later phases.
- Do not explore the repo beyond files you created; do not ask about stack choices.
- Files under 250 lines. No explanatory comments on obvious code.
- Tests only for engine pure functions and dedupe.
- At end of each phase: run tests, commit with message "phase N".