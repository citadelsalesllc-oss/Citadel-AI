# Citadel AI

Citadel AI is Citadel Sales & Marketing's proprietary AI marketing operating system: a modular platform of specialized AI agents that perform marketing, SEO, content, review, website, and analytics work on behalf of Citadel's clients — not a single chatbot.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the system is put together, [AGENTS.md](./AGENTS.md) for what each agent does (and what's still a stub), [TOOLS.md](./TOOLS.md) for the tool layer, [SECURITY.md](./SECURITY.md) for the security model, and [OPENCLAW.md](./OPENCLAW.md) for the OpenClaw integration point.

## Status

This is an MVP. One complete, tested, end-to-end workflow exists today:

> **Client:** CDA Septic Systems
> **Request:** "Create a Facebook post about a septic installation."
>
> The Orchestrator identifies the client, loads its brand rules and services, routes the request to the **Content Agent**, runs the result through **Brand QA**, and saves it as a `DRAFT` — ready for human approval before anything is published.

Strategy, SEO, Review, Website, and Analytics agents are registered but intentionally return an honest "not implemented yet" rather than a fabricated answer — see [AGENTS.md](./AGENTS.md) for what's built vs. planned.

## Prerequisites

- Node.js >= 20 and [pnpm](https://pnpm.io) (`corepack enable` or `npm i -g pnpm`)
- PostgreSQL 14+ running locally (or reachable via `DATABASE_URL`)

## Quickstart

```bash
pnpm install
cp .env.example .env            # edit DATABASE_URL if needed; MODEL_PROVIDER=mock needs no API key
pnpm db:migrate                 # applies the Prisma schema
pnpm db:seed                    # seeds the CDA Septic Systems demo client
pnpm dev:api                    # starts the API on http://localhost:3000
```

In another terminal, run the demo request:

```bash
curl -X POST http://localhost:3000/orchestrator/requests \
  -H 'Content-Type: application/json' \
  -H 'x-actor-label: Demo User' \
  -d '{"clientIdOrSlug":"cda-septic-systems","instruction":"Create a Facebook post about a septic installation."}'
```

Then walk it through approval:

```bash
CONTENT_ID=<id from the response above>
curl -X POST http://localhost:3000/content/$CONTENT_ID/submit-for-review
curl -X POST http://localhost:3000/content/$CONTENT_ID/approve -H 'Content-Type: application/json' -d '{"reviewer":"Your Name"}'
curl -X POST http://localhost:3000/content/$CONTENT_ID/publish -H 'Content-Type: application/json' -d '{"platform":"facebook"}'
```

`PUBLISH_PROVIDER` defaults to `mock` — no real social account is ever contacted until a real adapter is configured (see [TOOLS.md](./TOOLS.md)).

## Running with a real model

By default `MODEL_PROVIDER=mock` uses a deterministic, dependency-free content generator — no API key required, and it's what the automated tests use. To use real Claude-generated content:

```bash
MODEL_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm build` | Builds all workspace packages |
| `pnpm typecheck` | Type-checks every workspace package |
| `pnpm lint` | Runs ESLint |
| `pnpm test` | Runs the full test suite (spins up a dedicated `citadel_ai_test` database) |
| `pnpm db:migrate` | Applies Prisma migrations to `DATABASE_URL` |
| `pnpm db:seed` | Seeds demo clients from `knowledge/clients/` |
| `pnpm dev:api` | Runs the API with hot reload |

## Project layout

```
shared/          Core types & interfaces (Tool, Agent, Skill, ModelProvider, Client/Content schemas)
database/        Prisma schema, migrations, repositories, seed script
integrations/    Concrete adapters: models (Anthropic/mock), social publishing, website fetch, Google, OpenClaw
tools/           The tool abstraction layer agents call instead of hallucinating
agents/          Orchestrator + specialist agents (Content, Brand QA implemented; others are stubs)
skills/          Complete user-facing workflows (create-social-post is the one fully built skill)
knowledge/       Structured per-client/industry/SEO/brand-voice data
apps/api/        Express API — the composition root that wires everything together
tests/           Cross-package test infrastructure (test DB setup)
docs/            (reserved for future long-form docs)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the reasoning behind this structure and the dependency graph between packages.
