# Architecture

## Guiding principle

Citadel AI is an **extensible agent architecture**, not a chatbot with a system prompt. The Orchestrator never does the work itself — it identifies the client, classifies the request, and delegates to a specialist agent or skill. Every agent/skill is backed by **tools** for real data instead of being trusted to recall facts, and nothing reaches an external channel (social post, GBP update) without passing through an explicit human approval gate.

## Package graph

```
shared            (types & interfaces only — zero runtime deps besides zod)
  ↑
  ├── database     (Prisma + Postgres, repositories)
  ├── integrations (Anthropic/mock model providers, publish adapters, website fetch, GBP stub, OpenClaw adapter)
  ↑
tools              (Tool implementations — DB-backed + integration-backed)
  ↑
agents             (Orchestrator, Content Agent, Brand QA Agent, 5 stub specialist agents)
  ↑
skills             (create-social-post — the one complete end-to-end workflow)
  ↑
apps/api           (composition root: wires concrete providers/adapters into the abstractions above, exposes HTTP)
```

Dependencies only point one direction (down the list above). In particular:

- **`agents` never imports a concrete model SDK.** `ContentAgent` takes a `ModelProvider` (interface from `shared`) in its constructor; `apps/api`'s `container.ts` is the only place that decides whether that's `AnthropicProvider` or `MockModelProvider`. Swapping model vendors later means writing one new class in `integrations/models` and changing one line in `container.ts` — no agent or skill code changes.
- **`agents` never imports `skills` or `tools`.** The Orchestrator depends on the `ToolRegistry`/`SkillRegistry`/`AgentRegistry` *interfaces* (defined in `shared`) and receives populated instances via constructor injection from `apps/api`. This keeps the dependency graph acyclic (`skills` depends on `agents`, so the reverse would be circular) and keeps the Orchestrator testable with fakes (see `agents/src/orchestrator/router.test.ts` for the pure-router tests, and how `Orchestrator` itself only needs three interfaces to be unit-testable).
- **`integrations/openclaw` never imports `skills`.** It's a generic `Skill[] -> OpenClawToolDefinition[]` mapper (`skillsToOpenClawTools`). `apps/api` passes it the populated skill registry. This means the core application works, builds, and is fully testable with zero OpenClaw dependency, satisfying "the core Citadel AI application must remain independently testable."

## Client memory system

Client knowledge is Postgres-backed (`database/prisma/schema.prisma`, `Client` model), not file-based, so it's queryable, transactional, and safe for concurrent writes. Two kinds of fields:

- **Real columns** for anything queried/filtered on or with obvious relational structure: `slug` (unique per tenant), `serviceArea`, `seoKeywords`, `locations`, `notes` (Postgres text arrays).
- **JSON columns** for nested, client-specific structures that don't need their own join tables yet: `services`, `offers`, `competitors`, `faqs`, `brandRules`. Shapes are defined once, with Zod, in `shared/src/types/client.ts` and reused for both validation and TypeScript types.

This is a deliberate simplicity tradeoff: "support structured data first... do not introduce unnecessary complexity." If a field like `services` grows the need for its own queries/joins (e.g., "find all clients offering X service"), promoting it to a real table with a foreign key is a contained migration — the Zod schema and repository layer are the only things that would need to change.

**Tenant isolation**: every content item and audit log row carries a `clientId` foreign key. Tools that touch client data always take an explicit `clientId`/`idOrSlug` — there is no ambient "current client" global that could leak across requests. `agents` receive a `ClientProfile` object per call (in `AgentContext`), scoped to exactly the client the request is for.

### `/knowledge` directory

`knowledge/clients/*.json` are the source files the seed script (`database/src/seed.ts`) loads into Postgres — a versionable, reviewable source of truth for demo/fixture client data, distinct from the runtime database. `knowledge/industries/`, `knowledge/services/`, `knowledge/seo/`, and `knowledge/brand-voices/` are reserved for future shared (cross-client) reference data — e.g., industry-specific SEO keyword sets or brand-voice templates multiple clients could opt into. Nothing reads from them yet beyond the client seed; wiring them into agents (as additional retrieval context) is future work. No vector/semantic retrieval layer exists yet — the MVP's structured lookups (`client_lookup` by id/slug) are sufficient for the current scale, per "add vector retrieval only where it provides a clear benefit."

## Content lifecycle & approval gate

```
DRAFT --submit--> REVIEW --approve--> APPROVED --publish--> PUBLISHED
                     |
                     +--reject--> REJECTED
                     +--request revision--> REVISION_REQUIRED --submit--> REVIEW
APPROVED --(publish adapter throws)--> FAILED
```

Enforced in exactly one place: `database/src/repositories/content-repository.ts`'s `ALLOWED_TRANSITIONS` table, checked on every `transition()` call. This means the guarantee "nothing external gets published without prior approval" holds regardless of which caller (API route, future OpenClaw tool call, future scheduled agent) attempts it — the guard is in the repository, not duplicated in every caller. `tools/src/publish-tools.ts` additionally checks status *before* calling the publish adapter, so a publish attempt on non-approved content fails immediately with an unambiguous error instead of a masked one from a subsequent failed `FAILED` transition attempt.

## Model provider abstraction

`shared/src/model-provider.ts` defines `ModelProvider` (`generate(params): Promise<GenerateResult>`). Two implementations exist today (`integrations/src/models/`):

- `AnthropicProvider` — real Claude calls via `@anthropic-ai/sdk`. The only file in the codebase that imports that SDK.
- `MockModelProvider` — deterministic, dependency-free. Extracts labeled fields (`Company:`, `Phone:`, etc.) from the structured prompt the Content Agent builds and stitches together plausible on-brand copy. Used automatically whenever `ANTHROPIC_API_KEY` isn't set, and always in the test suite, so contributors and CI never need a real API key to develop or verify the platform.

`integrations/src/models/factory.ts` (`createModelProviderFromEnv`) is the only place that reads `MODEL_PROVIDER`/`ANTHROPIC_API_KEY` from the environment.

## Approval-gated publishing & "don't fake integrations"

`PublishAdapter` (`integrations/src/social/types.ts`) has two implementations: `MockPublishAdapter` (always succeeds, always returns a `mock-`-prefixed external ID and `isMock: true` — used for local dev/demo and never claims a real publish happened) and `FacebookAdapter` (a real seam that currently always throws `NotConfiguredError`, since the real Graph API integration is explicitly future work per the master spec). This is the pattern followed throughout: `GoogleBusinessAdapter` (future GBP integration) and the `review_lookup`/`analytics_lookup`/`web_search` tools all throw `NotConfiguredError` or return an explicit "no provider configured" result rather than fabricating data.

## Brand QA

Rule-based, not another model call (`agents/src/brand-qa/checks.ts`): forbidden-phrase matching, invented-phone-number detection (any phone-shaped string in the output that doesn't match the client's stored number is blocking), invented-price detection (any `$NN` not found anywhere in the client's profile is blocking), and AI-cliché detection (non-blocking warning). Deterministic and fast, and it directly enforces "never invent client facts" rather than delegating that enforcement to a second, equally fallible model call.

## Why not one big agent loop?

The spec is explicit: "Do NOT build a single chatbot... build an extensible agent architecture." Concretely this means: every specialist is a separate, independently testable unit with a narrow contract (`Agent<Input, Output>` or `Skill<Input, Output>`); the Orchestrator's job is classification and delegation, not generation; and unimplemented specialists (Strategy, SEO, Review, Website, Analytics) are registered stubs that answer honestly rather than absent capabilities the Orchestrator would otherwise silently mishandle.
