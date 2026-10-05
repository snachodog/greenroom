# Greenroom

Greenroom is a practice room for streamers. It fills a private dashboard with a simulated chat audience, so you can rehearse a stream before you go live.

Only you see it. Simulated messages never reach viewers, and the app never talks to a streaming platform.

## Why

Talking to an empty chat is hard to practice. Greenroom gives you a realistic audience on a second monitor. You can learn to read chat, answer questions, and keep a steady pace. You can also build habits, such as asking for follows and welcoming new arrivals, before the stakes are real.

## Aspirations

### A believable audience
- A cast of personas: a curious newcomer, a longtime regular, a topic expert, a lurker, a question-asker, a hype friend, and a practical tip-sharer. A mildly skeptical persona is available when you want pushback.
- Messages arrive at a pace you choose: quiet, normal, or busy.
- About four in ten messages are questions. Unanswered questions can bring a short followup.
- New viewers show up every few minutes.
- Chat follows your topic. When you change the topic, the audience changes with it.
- Repeated or near-identical messages are filtered out.

### Gentle prompts for good habits
- Timed reminders to ask for a follow, mention your socials, share your schedule, recap for new arrivals, and drink water.
- Each reminder has Done and Snooze. Every reminder and its outcome is logged.

### A useful look back
- A report after each session: duration, messages by kind, how many questions you answered, reminders done against reminders fired, and dead-air moments.

### Listening to you
- Planned: capture your microphone and transcribe it locally with whisper.cpp.
- Planned: comments that refer to what you just said, and a nudge with a talking point after a long silence.
- The app works fully without speech input.

## Safety rules
- No writes to any streaming platform.
- The dashboard refuses to render inside OBS and shows a full-screen warning.
- Every simulated message carries a SIM badge.
- One user. The server binds to 127.0.0.1 unless you set HOST. Basic auth with APP_PASSWORD is available when you expose it.

## Status

| Phase | Scope | State |
|-------|-------|-------|
| 1 | Sessions, personas, engine, LLM batching, dedupe, live chat, acknowledgements | Done |
| 2 | Reminders, settings, report, auth, Docker, full setup guide | Planned |
| 3 | Microphone capture, transcripts, dead-air nudges | Planned |

## Stack

Node 22, TypeScript run with tsx, Fastify, SQLite (better-sqlite3), zod, and vitest. The frontend is plain HTML, CSS, and JavaScript modules. Any OpenAI-compatible chat completions API can power the audience.

## Run it

```
nvm use          # or install Node 22
npm ci
cp .env.example .env
npm start        # http://127.0.0.1:3000
```

Set these in your environment:

| Variable | Purpose |
|----------|---------|
| LLM_BASE_URL | Base URL of an OpenAI-compatible API |
| LLM_API_KEY | API key for that service |
| LLM_MODEL | Model name |
| HOST | Bind address. Default 127.0.0.1 |
| PORT | Port. Default 3000 |
| DATA_DIR | Folder for the SQLite file. Default ./data |

The app does not read `.env` by itself. Export the values, or start it with `npx tsx --env-file=.env server/index.ts`.

## Out of scope

Multi-user use, reading real platform chat, a mobile app, and analytics beyond the report.

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md). Commits follow Conventional Commits, and releases come from semantic-release.
