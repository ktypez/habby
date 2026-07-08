# Habby

## KB
- `~/OKF/projects/habby/agent.md` — full context (personality, stack, features, data model, commands, triggers)
- `~/OKF/projects/habby/status.md` — project status (routes, design, changelog, known issues)
- `~/OKF/system/conventions.md` — communication rules, Termux setup
- `~/OKF/system/workspace.md` — cross-project comparison, dev commands
- `~/OKF/skills/INDEX.md` — available skills

## Stack
- Vite 6 + vanilla HTML/CSS/JS (frontend)
- Express 5 + ioredis/Upstash (backend)
- SHA-256 access password auth
- XP/leveling gamification system

## Rules
- skip tests — do not run test commands

## Local
- Env: `.env` (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, APP_PASSWORD)
- Deploy: push to GitHub → Vercel auto-deploys
