# Citadel AI

Citadel AI is Citadel Sales & Marketing's proprietary AI marketing operating system: a modular platform of specialized AI agents that perform marketing, SEO, content, review, website, and analytics work on behalf of Citadel's clients — not a single chatbot.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the system is put together, [AGENTS.md](./AGENTS.md) for what each agent does (and what's still a stub), [TOOLS.md](./TOOLS.md) for the tool layer, [SECURITY.md](./SECURITY.md) for the security model, and [OPENCLAW.md](./OPENCLAW.md) for the OpenClaw integration point.

## Status

**Phase 1 (MVP):** one complete, tested, end-to-end workflow:

> **Client:** CDA Septic Systems
> **Request:** "Create a Facebook post about a septic installation."
>
> The Orchestrator identifies the client, loads its knowledge (services, brand profile), routes the request to the **Content Agent**, runs the result through **Brand QA**, and saves it as a `DRAFT` — ready for human approval before anything is published.

**Phase 2 (client knowledge system):** the client memory model was rebuilt from Phase 1's JSON-blob fields into a normalized Postgres schema — `Client` core record plus `Service`, `ServiceArea`, `BrandProfile`, `TargetAudience`, `SeoProfile`, `Offer`, `Faq`, `MarketingNote`, and extended `ContentItem` (platform/title/campaign/tags) tables — with a dedicated knowledge-retrieval service (`getClientContext`) and full CRUD API for populating it. Tenant isolation is enforced at both the repository and API layer and has automated proof (see [ARCHITECTURE.md](./ARCHITECTURE.md#client-memory-system)). Seed data now contains only facts actually given (just `companyName` for the demo client) — never invented business facts, matching the same rule already enforced on generated content.

**Phase 3 (AI engine & orchestrator):** the real AI execution layer — a provider-agnostic `ModelProvider` interface with structured-JSON generation, a structured `Orchestrator.generateContent()` entry point, and `POST /clients/:clientId/ai/generate`, which runs the full pipeline (identify client → retrieve context → Content Agent → model → Brand QA → save as `DRAFT`/`REVISION_REQUIRED` → return result) for Facebook social posts. Brand QA now returns `{ passed, issues, warnings }` with checks for invented locations, CTA accuracy, hashtag appropriateness, and repetition, in addition to Phase 1's forbidden-phrase/invented-phone/invented-price checks. A QA failure is always saved (as `REVISION_REQUIRED`), never discarded and never silently approved. Every prompt and policy (content-generation prompt, Brand QA thresholds, Orchestrator routing rules) lives in a versioned `@citadel/prompts` package. See [ARCHITECTURE.md](./ARCHITECTURE.md#structured-ai-generation-pipeline-phase-3).

**Phase 4 (SEO Intelligence Agent):** the second complete specialist — the SEO Agent audits a client's webpage via `POST /clients/:clientId/ai/seo-audit`, combining a real website fetch (`WebsiteFetchAdapter`, incl. robots.txt/sitemap.xml) and four deterministic check categories (technical, on-page, local SEO, conversion — `agents/src/seo/checks.ts`) with LLM-prioritized, client-friendly recommendations. Every recommendation must cite real evidence from the deterministic findings; one that cites an id the engine never produced is dropped rather than trusted. Audits are persisted (`SeoAudit`) so a client's SEO can be tracked over time, and both structured entry points (`generateContent`/`runSeoAudit`) now resolve their skill through one shared `task -> skill` lookup. See [ARCHITECTURE.md](./ARCHITECTURE.md#seo-analysis-pipeline-phase-4).

**Phase 5 (Review Intelligence Agent):** the third and fourth specialists — `ReviewAnalysisAgent` (deterministic, no model call) and `ReviewResponseAgent` (drafts a reply, grounded in the same analysis) — via `POST /clients/:clientId/ai/reviews/:reviewId/analyze` and `.../respond`. Reviews are ingested through a swappable `ReviewProvider` (mock fixtures today; a real Google Business Profile adapter is a documented future seam, never faked) into a persisted `Review` table, then analyzed for sentiment, service/location mentions, and — via a structured keyword-category match — potential escalation (legal threats, safety/injury/fraud/discrimination allegations, direct threats). Response drafts reuse the exact same `BrandQaAgent` every other generated artifact passes through, and every draft appends to an append-only `ReviewResponseVersion` history rather than overwriting the last one. Escalation is surfaced as a flag for a human reviewer, never a trigger for a different code path — every response, escalation or not, is saved as `DRAFT`/`REVISION_REQUIRED` and never auto-published. See [ARCHITECTURE.md](./ARCHITECTURE.md#review-intelligence-pipeline-phase-5).

Strategy, Website, and Analytics agents are registered but intentionally return an honest "not implemented yet" rather than a fabricated answer — see [AGENTS.md](./AGENTS.md) for what's built vs. planned.

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

Populate some real knowledge for the seeded client (seed data intentionally contains only its name — see ARCHITECTURE.md):

```bash
curl -X POST http://localhost:3000/clients/cda-septic-systems/services \
  -H 'Content-Type: application/json' -d '{"serviceName":"Septic Tank Pumping","description":"Routine and emergency pumping."}'
curl -X PUT http://localhost:3000/clients/cda-septic-systems/brand-profile \
  -H 'Content-Type: application/json' -d '{"brandVoice":"Straightforward, trustworthy, locally-rooted.","forbiddenPhrases":["best in the world"]}'
curl http://localhost:3000/clients/cda-septic-systems/context   # everything an agent would see, in one call
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
# clientIdOrSlug is required on every content-lifecycle call — see SECURITY.md
# "Tenant isolation": it's how the API knows which client authorizes this
# action, so content can never be approved/published through the wrong client.
curl -X POST http://localhost:3000/content/$CONTENT_ID/submit-for-review -H 'Content-Type: application/json' -d '{"clientIdOrSlug":"cda-septic-systems"}'
curl -X POST http://localhost:3000/content/$CONTENT_ID/approve -H 'Content-Type: application/json' -d '{"clientIdOrSlug":"cda-septic-systems","reviewer":"Your Name"}'
curl -X POST http://localhost:3000/content/$CONTENT_ID/publish -H 'Content-Type: application/json' -d '{"clientIdOrSlug":"cda-septic-systems","platform":"facebook"}'
```

`PUBLISH_PROVIDER` defaults to `mock` — no real social account is ever contacted until a real adapter is configured (see [TOOLS.md](./TOOLS.md)).

### Or use the Phase 3 structured generation endpoint directly

```bash
curl -X POST http://localhost:3000/clients/cda-septic-systems/ai/generate \
  -H 'Content-Type: application/json' \
  -d '{"task":"create_social_post","platform":"FACEBOOK","topic":"a septic installation"}'
```

Returns `{ content, qaResult, contentId, status, agentUsed, modelProvider, usage }` in one call — `status` is `DRAFT` if Brand QA passed or `REVISION_REQUIRED` if it didn't (the content is saved either way; see [ARCHITECTURE.md](./ARCHITECTURE.md#structured-ai-generation-pipeline-phase-3)).

### Or audit a client's website (Phase 4)

```bash
curl -X POST http://localhost:3000/clients/cda-septic-systems/ai/seo-audit \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/"}'
```

Returns `{ audit, evidence, recommendations, clientId, auditId, agentUsed, modelProvider, usage, executionTimeMs }` — `audit` contains `overall_score` plus `technical`/`on_page`/`local_seo`/`conversion` scorecards. Past audits for a client are listable via `GET /clients/cda-septic-systems/seo-audits` (optionally `?url=...`), newest first, for before/after comparison (see [ARCHITECTURE.md](./ARCHITECTURE.md#seo-analysis-pipeline-phase-4)).

### Or analyze and respond to a customer review (Phase 5)

```bash
# Sync mock fixture reviews for the demo client first (see ARCHITECTURE.md "Mock review data"):
curl -X POST http://localhost:3000/clients/cda-septic-systems/reviews/sync
curl http://localhost:3000/clients/cda-septic-systems/reviews   # list synced reviews to get a reviewId

REVIEW_ID=<id from the list above>
curl -X POST http://localhost:3000/clients/cda-septic-systems/ai/reviews/$REVIEW_ID/analyze
curl -X POST http://localhost:3000/clients/cda-septic-systems/ai/reviews/$REVIEW_ID/respond
```

`analyze` returns `{ analysis: { rating, classification, positive_points, negative_points, mentioned_services, mentioned_locations, concerns, escalation_needed, evidence }, reviewId, clientId, agentUsed }` — fully deterministic, no model call. `respond` returns `{ response, qaResult, escalationNeeded, reviewId, status, agentUsed, modelProvider, usage }` — `status` is `DRAFT` if Brand QA passed or `REVISION_REQUIRED` if it didn't, exactly like content generation; `GET /clients/cda-septic-systems/reviews/$REVIEW_ID` returns the review plus its full response-draft history (see [ARCHITECTURE.md](./ARCHITECTURE.md#review-intelligence-pipeline-phase-5)).

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
shared/          Core types & interfaces (Tool, Agent, Skill, ModelProvider, client knowledge & Content schemas)
database/        Prisma schema, migrations, repositories, getClientContext, seed script
integrations/    Concrete adapters: models (Anthropic/mock), social publishing, website fetch, reviews (mock/Google), OpenClaw
prompts/         Versioned prompt/policy modules: content + SEO + review prompts, Brand QA policy, Orchestrator routing policy
tools/           The tool abstraction layer agents call instead of hallucinating
agents/          Orchestrator + specialist agents (Content, Brand QA, SEO, Review implemented; others are stubs)
skills/          Complete user-facing workflows (create-social-post, seo-audit, review-analyze, review-respond)
knowledge/       Structured per-client/industry/SEO/brand-voice data
apps/api/        Express API — the composition root that wires everything together
tests/           Cross-package test infrastructure (test DB setup)
docs/            (reserved for future long-form docs)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the reasoning behind this structure and the dependency graph between packages.
