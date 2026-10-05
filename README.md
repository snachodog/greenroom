# Greenroom

Greenroom is a simulated audience for streamers. It keeps a private chat moving on your second monitor, so a quiet stream never feels empty, and it reminds you to do the small things that help a channel grow.

Only you see it. Simulated messages never reach viewers, and the app never talks to a streaming platform.

## Why

Streaming to a small or empty chat is hard. Silence makes it easy to run out of things to say, and easy to forget the basics, such as asking for a follow or welcoming someone who just arrived. Greenroom gives you messages to react to, questions to answer, and viewers to welcome, so you keep talking. Timed reminders cover the routine tasks so you do not have to track them yourself.

Greenroom does not listen to you and does not detect silence. It keeps chat flowing at the pace you set, and it nudges you on a schedule.

## What it does

### Chat that keeps the room alive
- A cast of personas: a curious newcomer, a longtime regular, a topic expert, a lurker, a question-asker, a hype friend, and a practical tip-sharer. A mildly skeptical persona is available when you want some pushback.
- Messages read like real Twitch chat: short, casual, and tied to your category and topic.
- You choose the pace: quiet, normal, or busy.
- About four in ten messages are questions, which gives you something to answer. Unanswered questions can bring a short followup.
- New viewers show up every few minutes.
- Chat follows your topic. When you change the topic, the audience changes with it.
- Repeated or near-identical messages are filtered out.

### Reminders that prompt you
- Timed reminders to ask for a follow, mention your socials, share your schedule, recap for new arrivals, and drink water.
- A reminder to welcome each new viewer by name.
- Each reminder has Done and Snooze. Every reminder and its outcome is logged.

### A look back
- A report after each session: duration, messages by kind, how many questions you answered, and reminders done against reminders fired.

## Safety rules
- No writes to any streaming platform.
- The dashboard refuses to render inside OBS and shows a full-screen warning.
- Every simulated message carries a SIM badge.
- One user. The server binds to 127.0.0.1 unless you set HOST. Basic auth with APP_PASSWORD is available when you expose it.

## Status

| Phase | Scope | State |
|-------|-------|-------|
| 1 | Sessions, personas, engine, LLM batching, dedupe, live chat, acknowledgements | Done |
| 2 | Reminders, settings, report, auth, Docker | Done |

## Stack

Node 22, TypeScript run with tsx, Fastify, SQLite (better-sqlite3), zod, and vitest. The frontend is plain HTML, CSS, and JavaScript modules. Any OpenAI-compatible chat completions API can power the audience.

## Run it with Docker

```
cp .env.example .env     # then fill in the LLM values
docker compose up -d --build
```

The app is at http://127.0.0.1:3000. Compose publishes the port on 127.0.0.1 only. Set `BIND_ADDRESS=0.0.0.0` to reach it from another machine, and set `APP_PASSWORD` when you do. SQLite data lives in the `greenroom-data` volume, mounted at /data.

Every release publishes a multi-architecture image (amd64 and arm64) to `ghcr.io/snachodog/greenroom`, tagged with the version and `latest`. To use it instead of building, run `docker compose pull && docker compose up -d`. If the package is private, run `docker login ghcr.io` first with a token that has the `read:packages` scope.

## Run it without Docker

```
nvm use          # or install Node 22
npm ci
npm start        # http://127.0.0.1:3000
```

The app does not read `.env` by itself. Export the values, or start it with `npx tsx --env-file=.env server/index.ts`.

## Configuration

| Variable | Purpose |
|----------|---------|
| LLM_BASE_URL | Base URL of an OpenAI-compatible API |
| LLM_API_KEY | API key for that service |
| LLM_MODEL | Model name |
| HOST | Bind address. Default 127.0.0.1 |
| PORT | Port. Default 3000 |
| DATA_DIR | Folder for the SQLite file. Default ./data |
| APP_PASSWORD | Basic auth password. Enforced only when HOST is not local. Any user name works |

If HOST is not local and APP_PASSWORD is empty, the server starts and prints a warning. The `/healthz` path never needs a password.

## Using it

1. Open the settings page to review personas and reminders, and press Test LLM to check your API settings.
2. Start a session from the setup page.
3. On the setup page, pick a category by typing and choosing from the list. The list is a snapshot of Twitch categories dated 2026-10-05, stored in `server/categories.json`. The app never contacts Twitch. To refresh it, edit that file.
4. On the dashboard, click a message to acknowledge it. Press Space to pause, T to edit the topic, and D to mark the top reminder done.
5. End the session to see its report. Or turn on "End the session when the dashboard tab is closed" in settings. The server then ends the session 20 seconds after the last dashboard or settings page disconnects, so a reload does not end it.

## Out of scope

Multi-user use, reading real platform chat, speech capture or transcription, a mobile app, and analytics beyond the report.

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md). Commits follow Conventional Commits, and releases come from semantic-release.
