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

**Phase 2 rewrote this from Phase 1's JSON-blob `Client` model to a normalized structure** (`database/prisma/schema.prisma`): a lean core `Client` record plus one-to-many child tables (`Service`, `ServiceArea`, `Offer`, `Faq`, `MarketingNote`) and one-to-one "profile" tables (`BrandProfile`, `TargetAudience`, `SeoProfile`). This is a knowledge system, not a generic CRM — every table exists because a specific agent needs that specific, structured slice of context, not because a CRM schema conventionally has one. Postgres-backed throughout, so it's queryable, transactional, and safe for concurrent writes.

Design decisions worth calling out:

- **`slug` is kept beyond the spec's minimum `Client` field list** — a human-friendly identifier the API and demo flows already depend on; costs nothing structurally.
- **`BrandProfile`/`TargetAudience`/`SeoProfile` are 1:1 tables** (nullable relation, unique `clientId`), not repeated rows — the spec describes each as a singular "profile."
- **`SeoProfile.competitors` is `String[]` of names**, not a relational `Competitor` table — a full entity with its own history is more structure than a knowledge system needs today; add one later if a real use case needs per-competitor detail.
- **`ContentItem` gained `platform`/`title`/`campaign`/`tags`** as new columns, additive to the Phase 1 `type`/`status` fields — `type` is the kind of content, `platform` is where it's headed (nullable for platform-agnostic content).
- **Two write endpoints exist beyond the spec's literal API list**: `POST /clients/:id/offers` and `PUT /clients/:id/target-audience`. The spec's data model and numbered objective both require storing offers and target-customer data, but its API list omitted a way to write either — omitting the endpoints would make those objective items unsatisfiable, so they were added (add-only, matching the spec's own pattern for FAQs/marketing notes/service areas).

**Tenant isolation** is the load-bearing guarantee here, not an afterthought: every child table carries a `clientId` foreign key, and every repository method that looks up a specific child record re-checks `(id, clientId)` together — a valid id belonging to a *different* client returns `ResourceNotFoundError`, the same error as an id that doesn't exist at all, so a caller can never distinguish "wrong id" from "someone else's record" (see `database/src/repositories/service-repository.ts` for the canonical pattern, and `database/src/__tests__/tenant-isolation.test.ts` for the proof). API routes never accept a caller-supplied `clientId` for writes — every route resolves the client from `:idOrSlug` first and uses *that* resolved id, making a cross-tenant write structurally unreachable rather than merely checked.

### Knowledge retrieval: `getClientContext`

`database/src/client-context.ts` is the single sanctioned way anything (agent, skill, API route) obtains a client's full knowledge: one query (via Prisma `include`), returned as the `ClientContext` type (`shared/src/types/client.ts`) — `{ core, services, serviceAreas, brandProfile, targetAudience, seoProfile, offers, faqs, marketingNotes, recentContent }`. Callers never need to know the underlying tables. `AgentContext.client` (`shared/src/agent.ts`) is typed `ClientContext`, so every agent gets this whole picture, not a lookup they'd have to assemble themselves. Wrapped for agent/skill use as the `client_context` tool (`tools/src/client-tools.ts`); `client_lookup` remains as a separate, lighter tool for when only the core record (name, contact info, status) is needed. A missing piece (no brand profile yet, no offers yet) is `null`/`[]` in the result, never a guess — see `MissingInformationError` for what an agent should do when it needs a fact that isn't there.

**Not built:** vector/semantic retrieval. The spec is explicit — "do NOT introduce a vector database yet unless the existing architecture clearly requires it. Start with reliable structured retrieval." `getClientContext`'s structured, single-query retrieval is sufficient at current scale; `ContentItemSummary` in `recentContent` (id/type/platform/title/status/date, not full bodies) is deliberately lightweight so this stays cheap as content volume grows. Revisit only if/when free-text search over large volumes of past content or FAQs becomes an actual need.

### `/knowledge` directory

`knowledge/clients/*.json` are the source files the seed script (`database/src/seed.ts`) loads into Postgres. **Seed files support ONLY core `Client` fields, and only ones actually known** — per the Phase 2 data-integrity rule, seed/demo data must never invent business facts any more than a generated post may. `knowledge/clients/cda-septic-systems.json` contains just `companyName`; every other field is intentionally absent, not filled with a plausible guess. Additional knowledge (services, brand profile, SEO profile, etc.) is meant to be added through the knowledge-management API as it becomes actually known — see the seed file's own `_devDataNotice` field. (One consequence worth knowing: `seedClient()` explicitly coalesces every optional field to `null` rather than `undefined` before the Prisma `upsert` — `undefined` means "leave whatever's already there" to Prisma, which would let stale data survive a re-seed that removed it from the source file; re-seeding must fully replace the record with exactly what the file says.) `knowledge/industries/`, `knowledge/services/`, `knowledge/seo/`, and `knowledge/brand-voices/` remain reserved for future shared (cross-client) reference data; nothing reads from them yet.

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
