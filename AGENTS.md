# Agents

All agents implement the shared `Agent<Input, Output>` interface (`shared/src/agent.ts`): a `name`, `description`, and `run(input, context)` where `context.client` is an already-resolved `ClientContext` (Phase 2's full client knowledge aggregate — `{ core, services, serviceAreas, brandProfile, targetAudience, seoProfile, offers, faqs, marketingNotes, recentContent }`, see ARCHITECTURE.md "Knowledge retrieval") and `context.actor`/`context.requestId` are for audit logging. Agents never fetch their own client data or call a model SDK directly — both are injected, which is what makes every agent below unit-testable with fakes.

## Orchestrator (`agents/src/orchestrator/`) — **implemented**

The entry point, with two ways in:

1. **`Orchestrator.handle(request)`** — free-text entry point:
   1. Resolves the client via the `client_context` tool (fails fast with `ClientNotFoundError`/`ClientNotActiveError` — never falls back to another client, never acts on an archived one).
   2. Classifies the instruction (`classifyRequest`, `agents/src/orchestrator/router.ts`) — deterministic keyword routing to either the content-generation skill or one of the five specialist agents below (all still stubs from this entry point — see "SEO Agent" below for why even the implemented one is reached only through the structured entry point here).
   3. Delegates and normalizes the outcome into one response shape, including honest `not_implemented` and `unsupported` results (never a fabricated answer, never a crash on an unrecognized request).
2. **`Orchestrator.generateContent(request)`** (Phase 3) — structured entry point for `POST /clients/:clientId/ai/generate`: takes an explicit `{ task, platform, topic, userInstructions? }` instead of free text and delegates to whichever skill `task` resolves to.
3. **`Orchestrator.runSeoAudit(request)`** (Phase 4) — structured entry point for `POST /clients/:clientId/ai/seo-audit`: takes an explicit `{ task, url, targetService?, targetLocation?, userInstructions? }` and delegates the same way.

Both structured entry points resolve `task` through the same private `resolveSkillForTask()` lookup (`TASK_SKILL_MAP` in `prompts/orchestrator/v1.ts` — `create_social_post -> create-social-post`, `seo_audit -> seo-audit`); anything not in that map throws `NotImplementedError` rather than guessing at a mapping. See ARCHITECTURE.md "Structured AI generation pipeline" and "SEO analysis pipeline."

Either way, the Orchestrator does not generate content, run QA, fetch a website, or touch the database itself — see `create-social-post`/`seo-audit` in `skills/` for where that actually happens.

## Content Agent (`agents/src/content/`) — **implemented**

Generates structured Facebook post copy via the injected `ModelProvider`, returning `{ platform, contentType, content, hashtags, cta, seoKeywordsUsed, notes, modelUsed, providerUsed, usage? }` rather than a raw string. The system + user prompt (`@citadel/prompts`' `contentPromptV1.buildContentSystemPrompt`/`buildContentUserPrompt`) is built entirely from the client's full `ClientContext` — company, services, service areas, brand rules, target audience, SEO profile, offers, marketing notes, and up to 3 recent previous posts for style continuity — with an explicit instruction never to invent facts not present in that context. The model is asked to return JSON matching `ContentGenerationResultSchema`; a response that doesn't parse into that shape throws `MalformedModelResponseError` rather than being guessed at or partially trusted.

Only `platform: 'facebook'` is implemented (`SUPPORTED_GENERATION_PLATFORMS`); Instagram/Google Business/blog/website/email throw `NotImplementedError` — an honest, deliberate MVP narrowing rather than generating an unreviewed shape for platforms the Phase 3 contract doesn't cover yet, even though the platform enum itself still has all six values (so `Orchestrator.handle()`'s free-text router keeps classifying requests exactly as before).

## Brand QA Agent (`agents/src/brand-qa/`) — **implemented**

Rule-based (not a second model call) gate every generated draft passes through, returning `{ passed, issues, warnings }` — see ARCHITECTURE.md "Brand QA" for the full list of checks (forbidden phrases, invented phone/price/location, CTA accuracy, service/location accuracy are blocking; AI clichés, hashtag count, repetition, and unused preferred phrases are warnings). A failing (`passed: false`) result is **never** an error and **never** silently dropped — the calling skill always saves the content, as `REVISION_REQUIRED` instead of `DRAFT`.

## Strategy Agent (`agents/src/strategist/`) — **stub**

Planned: marketing strategy, campaign planning, offer strategy, competitive positioning, lead-gen recommendations. Currently registered via `createStubAgent` and returns `NotImplementedError` when routed to (e.g. "Help me plan a marketing strategy...").

## SEO Agent (`agents/src/seo/`) — **implemented** (structured entry point) / **stub** (free-text entry point)

`SeoAgent.run()` audits one already-fetched webpage (`{ url, page, targetService?, targetLocation?, userInstructions? }`) and returns the full structured `SeoAuditResult` — see ARCHITECTURE.md "SEO analysis pipeline" for the technical/on-page/local-SEO/conversion deterministic checks (`agents/src/seo/checks.ts`) plus the LLM-prioritized recommendations layered on top. Reached exclusively through the `seo-audit` skill (`POST /clients/:clientId/ai/seo-audit`) — the same relationship `ContentAgent` has to `create-social-post`.

The free-text `Orchestrator.handle()` router still points SEO-flavored instructions ("Run an SEO audit...") at a **stub** (`agents/src/seo/index.ts`'s `seoAgent`, registered in `agent-registry.ts`), because that entry point has no way to extract a URL out of free text and `seo_audit` requires one — see that file's doc comment. Both share the name `'seo-agent'` deliberately: they're the same capability, reached through two different, equally real entry points.

`website_fetch`/`website_analyze` (`tools/src/website-tools.ts`) predate this implementation and remain available for the still-planned Website Agent below; the SEO Agent's own checks (`agents/src/seo/checks.ts`) are a separate, much deeper deterministic engine built directly for it, not layered on `website_analyze`.

## Review Agent (`agents/src/reviews/`) — **stub**

Planned: review analysis, response drafting, recurring-theme identification, reputation recommendations. Blocked on a real review-platform integration (`review_lookup` tool currently throws `NotConfiguredError` — no invented reviews).

## Website Agent (`agents/src/website/`) — **stub**

Planned: website audits, conversion analysis, UX/CTA recommendations. `website_fetch`/`website_analyze` tools are real and ready to be composed into this agent.

## Analytics Agent (`agents/src/analytics/`) — **stub**

Planned: marketing metrics analysis, trend/weak-campaign identification, client-friendly reporting. Blocked on a real analytics integration (`analytics_lookup` tool currently throws `NotConfiguredError` — no invented metrics).

---

**Why stubs instead of omission?** Registering a stub (rather than leaving the agent name unrecognized) lets the Orchestrator's router match the request and return a structured, honest "not implemented yet" result — consistent with the platform rule to explicitly report missing capabilities rather than silently doing nothing or fabricating an answer. Implementing one for real is a contained change: write the agent, wrap it in a skill (if it needs tools), and add its task to `TASK_SKILL_MAP` — done, as SEO's transition from stub to real implementation in Phase 4 demonstrates. Nothing about the Orchestrator's routing or response-normalization logic changed to support it.
