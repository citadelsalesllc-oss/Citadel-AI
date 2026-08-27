# Architecture

## Guiding principle

Citadel AI is an **extensible agent architecture**, not a chatbot with a system prompt. The Orchestrator never does the work itself — it identifies the client, classifies the request, and delegates to a specialist agent or skill. Every agent/skill is backed by **tools** for real data instead of being trusted to recall facts, and nothing reaches an external channel (social post, GBP update) without passing through an explicit human approval gate.

## Package graph

```
shared            (types & interfaces only — zero runtime deps besides zod)
  ↑
  ├── database     (Prisma + Postgres, repositories)
  ├── integrations (Anthropic/mock model providers, publish adapters, website fetch, GBP stub, OpenClaw adapter)
  ├── prompts      (versioned prompt/policy modules — content generation prompts, Brand QA policy, Orchestrator routing policy)
  ↑
tools              (Tool implementations — DB-backed + integration-backed)
  ↑
agents             (Orchestrator, Content Agent, Brand QA Agent, SEO Agent, 4 stub specialist agents — depends on prompts)
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

### SEO audits (Phase 4)

`SeoAudit` (`database/prisma/schema.prisma`) is a one-to-many child table like `ContentItem`, not a 1:1 profile — every completed audit is kept, not just the latest, so a client's SEO can be tracked over time ("Audit #1 -> Audit #2 -> improvement"). It stores the full structured `SeoAuditResult` as `Json` (so past audits stay fully reviewable without re-running analysis) plus a denormalized `overallScore`, `agentVersion`, `modelProvider`, and `modelUsed` for cheap listing/comparison without parsing the JSON blob. Tenant isolation follows the same `(id, clientId)` pattern as every other child table (`database/src/repositories/seo-audit-repository.ts`). See "SEO analysis pipeline" below for how a row gets created.

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

**Phase 3 addition:** content can now be *created* directly as `REVISION_REQUIRED`, not only reached there via `REVIEW`. `content_save`/`contentRepository.create()` accept an `initialStatus: 'DRAFT' | 'REVISION_REQUIRED'` (default `DRAFT`) so the structured generation pipeline below can save a QA-failing draft honestly as needing revision, rather than saving it as `DRAFT` (implying it's approval-ready) or discarding it (hiding that generation happened at all). Either way the row is always saved — a QA failure is never silently dropped.

## Model provider abstraction

`shared/src/model-provider.ts` defines `ModelProvider`: `generate(params): Promise<GenerateResult>` plus a required `capabilities: { structuredOutput: boolean; toolCalling: boolean }`. `GenerateParams` accepts an optional `responseSchema` (JSON Schema the caller wants the model to follow) and `tools` (`ModelToolDefinition[]`); `GenerateResult` can carry a best-effort parsed `structured` field alongside the raw `text`, and `toolCalls`. Tool calling is declared in the interface but **not implemented** by either provider yet (Phase 3 explicitly scopes structured JSON generation only, not agentic tool use by the model itself). Two implementations exist today (`integrations/src/models/`):

- `AnthropicProvider` — real Claude calls via `@anthropic-ai/sdk`, the only file in the codebase that imports that SDK. `capabilities: { structuredOutput: true, toolCalling: false }`. Structured output is achieved by prompt engineering (asking for JSON-only output and providing the schema in the prompt), not a native API JSON mode — the Anthropic Messages API has none — then best-effort parsed via `extractJson()` (`integrations/src/models/json-extraction.ts`, strips markdown code fences, falls back to the outermost `{...}` span). Calls are wrapped in an `AbortController` with a configurable timeout (`MODEL_TIMEOUT_MS`, default 30s); a timeout or transport failure throws `ModelProviderError` rather than hanging or returning a fabricated result.
- `MockModelProvider` — deterministic, dependency-free, same `extractJson()`-based structured-mode support as `AnthropicProvider` so agent code and tests exercise the identical code path regardless of provider. Extracts labeled fields (`Platform:`, topic, client facts) from the structured prompt the Content Agent builds and stitches together plausible on-brand copy. Used automatically whenever `ANTHROPIC_API_KEY` isn't set, and always in the test suite, so contributors and CI never need a real API key to develop or verify the platform.

`integrations/src/models/factory.ts` (`createModelProvider`) is the only place that reads `MODEL_PROVIDER`/`ANTHROPIC_API_KEY`/`MODEL_TIMEOUT_MS` from the environment; it throws `NotConfiguredError` if `anthropic` is requested without an API key rather than silently falling back to the mock provider.

Shape validation of the model's structured JSON output is deliberately layered: the provider only guarantees "valid JSON, best-effort extracted" — it does not know or enforce any particular schema. The specific contract (`ContentGenerationResultSchema` for content, `SeoInterpretationResultSchema` for SEO — both Zod schemas) lives in `@citadel/prompts` and is applied by the respective agent (`ContentAgent`/`SeoAgent`), the one place that actually knows what shape it asked for. A response that parses as JSON but doesn't match the schema throws `MalformedModelResponseError` — never silently coerced or partially trusted. `MockModelProvider` (Phase 4) dispatches between the two contracts by reading the requested JSON Schema's `$ref` name (`schemaName()` in `integrations/src/models/mock-provider.ts`) rather than assuming there's only one structured caller — see that file's doc comment.

## Approval-gated publishing & "don't fake integrations"

`PublishAdapter` (`integrations/src/social/types.ts`) has two implementations: `MockPublishAdapter` (always succeeds, always returns a `mock-`-prefixed external ID and `isMock: true` — used for local dev/demo and never claims a real publish happened) and `FacebookAdapter` (a real seam that currently always throws `NotConfiguredError`, since the real Graph API integration is explicitly future work per the master spec). This is the pattern followed throughout: `GoogleBusinessAdapter` (future GBP integration) and the `review_lookup`/`analytics_lookup`/`web_search` tools all throw `NotConfiguredError` or return an explicit "no provider configured" result rather than fabricating data.

## Brand QA

Rule-based, not another model call (`agents/src/brand-qa/checks.ts`) — deliberately, both in Phase 1 and reaffirmed in Phase 3: a second LLM call to grade the first LLM's output would just be a second, equally fallible model in the loop, not a real guarantee. `BrandQaAgent.run()` returns `{ passed: boolean, issues: BrandQaIssue[], warnings: BrandQaIssue[] }` — `issues` are blocking (any non-empty `issues` means `passed: false`), `warnings` never block but are still returned and saved for a human reviewer to see. Checks:

**Blocking:**
- Forbidden-phrase matching (client's `brandProfile.forbiddenPhrases`)
- Invented phone number (any phone-shaped string in the output that isn't the client's stored number)
- Invented price (any `$NN` not found anywhere in the client's profile)
- Invented location (`checkInventedLocations` — any `City, ST`-shaped string that isn't one of the client's stored service areas)
- CTA accuracy (`checkCtaAccuracy` — a call-to-action referencing a phone/website the client doesn't have on file)
- Service/location accuracy against the client's stored services and service areas

**Warning (non-blocking):**
- AI-cliché phrase detection (generic filler like "in today's fast-paced world")
- Hashtag appropriateness (`checkHashtagFormat` — too many hashtags for the platform, from `prompts/brand-qa/v1.ts`'s per-platform thresholds)
- Excessive repetition (`checkExcessiveRepetition` — the same significant word repeated past a threshold)
- Client's preferred phrases unused (`checkPreferredPhrasesUsage` — a nudge, not a defect)

A QA failure is **never** silently discarded and **never** auto-approved: the caller (the `create-social-post` skill) always saves the generated content, as `DRAFT` when `passed: true` or `REVISION_REQUIRED` when `passed: false` — see "Content lifecycle" above. The specific check thresholds/wordlists live in `@citadel/prompts` (`prompts/brand-qa/v1.ts`) alongside the content-generation prompt, versioned together even though this module contains policy constants rather than an LLM prompt (see "Prompt architecture" below).

## Structured AI generation pipeline (Phase 3)

Phase 3 adds a second, structured entry point alongside the free-text `Orchestrator.handle()`: `Orchestrator.generateContent(request)` (`agents/src/orchestrator/orchestrator.ts`), exposed over HTTP as `POST /clients/:clientId/ai/generate` (`apps/api/src/routes/clients.ts`). Where `handle()` takes a free-text instruction and classifies it, `generateContent()` takes an explicit `{ task, platform, topic, userInstructions? }` and only supports `task: 'create_social_post'` today (`SUPPORTED_STRUCTURED_TASKS` in `prompts/orchestrator/v1.ts`) — any other task throws `NotImplementedError` rather than guessing at a mapping.

The pipeline, end to end:

```
POST /clients/:clientId/ai/generate
  -> Orchestrator.generateContent()
       -> identifyAndValidateClient()      (client_context tool; ClientNotFoundError / ClientNotActiveError)
       -> SkillRegistry 'create-social-post'
            -> content_search tool          (up to 3 most recent same-platform items, for style continuity)
            -> ContentAgent.run()           (ModelProvider.generate() with responseSchema, structured JSON)
            -> BrandQaAgent.run()           ({ passed, issues, warnings })
            -> content_save tool            (initialStatus: DRAFT if passed, REVISION_REQUIRED if not)
  -> structured response: { content, qaResult, contentId, status, agentUsed, modelProvider, usage }
```

Every step is honest about failure rather than fabricating success: an unknown/inactive client 404s/422s (never invents a client), an unsupported platform or task 501s (`NotImplementedError`), a malformed model response 502s (`MalformedModelResponseError`), and a downstream failure (e.g. a database error) propagates as-is rather than being swallowed into a fake 200. `apps/api/src/logger.ts`'s `logGenerationEvent()` records one structured JSON log line per attempt (success or failure) — `requestId`, `clientId`, `agent`, `task`, `modelProvider`, `executionTimeMs`, `success`, `qaPassed`, `contentStatus` — and its `GenerationLogEntry` type structurally excludes any credential/secret field, so there's no field to accidentally populate with one.

## SEO analysis pipeline (Phase 4)

The second specialist agent, `SeoAgent` (`agents/src/seo/seo-agent.ts`), follows the same "deterministic engine does the technical work, the model only prioritizes and explains" split established by Brand QA — but unlike Brand QA, it also makes one model call, so it's structured like a hybrid of ContentAgent (calls a model) and BrandQaAgent (rule-based ground truth).

A third structured entry point, `Orchestrator.runSeoAudit(request)`, sits alongside `handle()` and `generateContent()`, exposed over HTTP as `POST /clients/:clientId/ai/seo-audit`:

```
POST /clients/:clientId/ai/seo-audit
  -> Orchestrator.runSeoAudit()
       -> identifyAndValidateClient()      (client_context tool; ClientNotFoundError / ClientNotActiveError)
       -> resolveSkillForTask('seo_audit')  (TASK_SKILL_MAP lookup — shared with generateContent(), see below)
       -> SkillRegistry 'seo-audit'
            -> website_fetch tool           (real HTTP fetch of the target URL + robots.txt/sitemap.xml — WebsiteFetchAdapter)
            -> SeoAgent.run()
                 -> 4 deterministic check categories (agents/src/seo/checks.ts) -> technical/on_page/local_seo/conversion scores + an evidence catalog
                 -> ModelProvider.generate() with the evidence catalog as input, responseSchema = SeoInterpretationResultSchema
                 -> evidence-ref validation: any recommendation citing an id not in the real catalog is dropped
            -> seo_audit_save tool           (persists the full result; never gated on a pass/fail — every audit is worth keeping)
  -> structured response: { audit, evidence, recommendations, clientId, auditId, agentUsed, modelProvider, usage, executionTimeMs }
```

**Both structured task entry points share one lookup.** `prompts/orchestrator/v1.ts`'s `TASK_SKILL_MAP` (`{ create_social_post: 'create-social-post', seo_audit: 'seo-audit' }`) is what "the orchestrator should determine the correct specialist from the structured task" means concretely — `Orchestrator`'s private `resolveSkillForTask()` is the one place both `generateContent()` and `runSeoAudit()` go through, so adding a third structured task later means adding one row to that map and registering the matching skill, not touching either method's control flow. A task not in the map throws `NotImplementedError` from either entry point.

**Website fetching is real, not simulated.** `WebsiteFetchAdapter` (`integrations/src/websites/website-fetch-adapter.ts`) does a real HTTP fetch (Node's built-in `fetch`, regex-based HTML extraction — no headless browser) of the exact URL supplied, plus the same origin's `/robots.txt` and `/sitemap.xml` (explicitly-required SEO signals for the audit workflow, not organic crawling — see the module's own doc comment for why this isn't "the web crawler" the master spec says not to build yet). It respects timeouts (`WebsiteFetchTimeoutError`), rejects non-HTML responses (`UnsupportedContentTypeError`) and oversized bodies (`WebsiteContentTooLargeError`), and never fabricates a result for an unreachable target (`WebsiteUnreachableError`) — a genuine fetch failure propagates as a real error (502/504 at the API layer), not a fake empty audit. An HTTP error status from the target site itself (404, 500...) is NOT a fetch failure — it's returned as data (`ok: false`) for the technical-checks category to flag, since a broken page is itself a real, analyzable finding. `WebsiteFetchResult`'s shape lives in `shared/src/website-fetch.ts` (a plain interface, the SEO-fetching analogue of `ModelProvider`'s `GenerateResult`) — `agents` depends only on that interface, never on the concrete adapter, the same "swap the implementation without touching agent code" pattern used for model providers.

**The four deterministic check categories** (`agents/src/seo/checks.ts`, mirroring `agents/src/brand-qa/checks.ts`'s architecture) — technical (HTTP status/HTTPS/title/meta description/canonical/H1s/heading hierarchy/indexability/robots.txt/sitemap), on-page (title/meta/H1 relevance to the client's known services, keyword presence, content depth, internal links), local SEO (service-area/target-location alignment, NAP phone consistency, missed service-area opportunities), and conversion (CTA presence, phone visibility, contact path, trust signals, review mentions) — each return `{ score, issues, evidence }`. Every issue is paired 1:1 with an evidence entry of the same id, and every evidence entry records whether it came from `website_evidence` (the fetched page), `client_knowledge` (the client's stored context), or a `deterministic_rule` (a fixed threshold/pattern) — the traceability the master spec requires ("every recommendation must be traceable to retrieved evidence, client knowledge, or a deterministic rule"). Missing client data (no SEO profile, no service areas) is reported honestly as an `info`-severity finding, never silently assumed or invented.

**The model never re-derives technical facts — it only prioritizes and explains.** `SeoAgent.run()` hands the model the evidence catalog (never the raw page) via `prompts/seo/v1.ts`'s `buildSeoUserPrompt()`, and asks for `{ keyword_opportunities, recommendations, summary }` — each recommendation must cite `evidence_refs` from the catalog. `SeoAgent` then filters: any `evidence_refs` entry that isn't a real catalog id is dropped, and a recommendation left with zero valid refs is dropped entirely. This is the actual enforcement mechanism for "do not allow the AI to invent evidence" — not a prompt instruction alone (which the model could ignore), but a post-hoc check the code performs on every response.

## Prompt architecture

`prompts/` (`@citadel/prompts`) is the single source of truth for every LLM-facing prompt and every deterministic policy that governs agent behavior, versioned by directory (`content/v1.ts`, `brand-qa/v1.ts`, `orchestrator/v1.ts`, `seo/v1.ts`) so a future `v2` can exist alongside `v1` during a migration rather than being an in-place breaking edit.

- **`content/v1.ts` and `seo/v1.ts` are real LLM prompt modules** — Content Agent and SEO Agent are the only two agents that call a model. Both follow the same six-section split (system instructions / client facts / brand-or-evidence rules / task instructions / output schema / safety requirements) and wrap client- or website-controlled text via `untrustedBlock()` with an explicit instruction to treat it as data, not instructions — the same prompt-injection-resistance principle applied everywhere user- or externally-controlled text reaches a model. `content/v1.ts` exports `buildContentSystemPrompt`/`buildContentUserPrompt`, `ContentGenerationResultSchema`, and `CONTENT_OUTPUT_JSON_SCHEMA`; `seo/v1.ts` exports the analogous `buildSeoSystemPrompt`/`buildSeoUserPrompt`, `SeoInterpretationResultSchema`, and `SEO_INTERPRETATION_JSON_SCHEMA` — plus (unlike content/v1.ts) the deterministic-rule policy `agents/src/seo/checks.ts` applies (length thresholds, CTA/trust-signal keyword lists), since for SEO the deterministic rules and the LLM prompt are versioned together as one coherent contract rather than split across two unrelated components.
- **`brand-qa/v1.ts` and `orchestrator/v1.ts` are policy modules, not LLM prompts** — both Brand QA and the Orchestrator's request-routing are deliberately deterministic, rule-based code (see "Brand QA" above and `agents/src/orchestrator/router.ts`), not model calls. They live in `prompts/` anyway because they're the same kind of thing conceptually — versioned, reviewable business rules that shape agent behavior (QA thresholds/wordlists, routing keyword patterns, the task-to-skill map) — and colocating them keeps "what does the platform currently consider on-brand / in scope" auditable in one package instead of split between "real prompts" and "everything else." Each file's own doc comment states explicitly whether it is a model prompt, to avoid the reader assuming otherwise.

## Why not one big agent loop?

The spec is explicit: "Do NOT build a single chatbot... build an extensible agent architecture." Concretely this means: every specialist is a separate, independently testable unit with a narrow contract (`Agent<Input, Output>` or `Skill<Input, Output>`); the Orchestrator's job is classification and delegation, not generation; and unimplemented specialists (Strategy, Review, Website, Analytics) are registered stubs that answer honestly rather than absent capabilities the Orchestrator would otherwise silently mishandle. SEO followed exactly this path from stub (Phase 1-3) to real implementation (Phase 4) without any change to the Orchestrator's routing contract — see AGENTS.md.
