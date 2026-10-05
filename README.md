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
3. On the dashboard, click a message to acknowledge it. Press Space to pause, T to edit the topic, and D to mark the top reminder done.
4. End the session to see its report.

## Out of scope

Multi-user use, reading real platform chat, speech capture or transcription, a mobile app, and analytics beyond the report.

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md). Commits follow Conventional Commits, and releases come from semantic-release.
