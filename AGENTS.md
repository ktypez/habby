# Habby

## KB
Project context is stored in Second Brain (brain.mcky.space via secondbrain MCP).
Use `recall` to retrieve context, `remember` to save new info.
- `recall query="habby project"` — tech stack, features, data model
- `recall query="habby agent"` — personality, triggers
- Tags: `habby`, `project`

## Stack
- Vite 8 + vanilla HTML/CSS/JS (frontend)
- Express 5 + ioredis/Upstash (backend)
- Dual storage: localStorage (guest) + Redis API (owner)
- SHA-256 access password auth (owner mode)
- XP/leveling gamification system
- Triple-tap 🎯 logo for hidden owner login

## Rules
- skip tests — do not run test commands

## Local
- Env: `.env` (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, APP_PASSWORD)
- Deploy: push to GitHub → Vercel auto-deploys

## MCP Source Cite
When answering using data from an MCP server, indicate the source in square brackets at the end:
- `[source: brain]` — from brain.mcky.space
- `[source: context7]` — from library docs
