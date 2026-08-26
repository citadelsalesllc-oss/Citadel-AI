# Agents

All agents implement the shared `Agent<Input, Output>` interface (`shared/src/agent.ts`): a `name`, `description`, and `run(input, context)` where `context.client` is an already-resolved `ClientProfile` and `context.actor`/`context.requestId` are for audit logging. Agents never fetch their own client data or call a model SDK directly — both are injected, which is what makes every agent below unit-testable with fakes.

## Orchestrator (`agents/src/orchestrator/`) — **implemented**

The entry point. `Orchestrator.handle(request)`:
1. Resolves the client via the `client_lookup` tool (fails fast with `ClientNotFoundError` — never falls back to another client).
2. Classifies the instruction (`classifyRequest`, `agents/src/orchestrator/router.ts`) — deterministic keyword routing to either the content-generation skill or one of the five specialist agents below.
3. Delegates and normalizes the outcome into one response shape, including honest `not_implemented` and `unsupported` results (never a fabricated answer, never a crash on an unrecognized request).

It does not generate content, run QA, or touch the database itself — see `create-social-post` in `skills/` for where that actually happens.

## Content Agent (`agents/src/content/`) — **implemented**

Generates on-brand copy (Facebook/Instagram/Google Business posts, blog, website copy, email) via the injected `ModelProvider`. The system + user prompt (`agents/src/content/prompt.ts`) is built entirely from the client's stored profile — company name, service area, services, phone, offers, preferred/forbidden phrases — with an explicit instruction never to invent facts not listed. Platform determines both formatting guidance and the resulting `ContentType`.

## Brand QA Agent (`agents/src/brand-qa/`) — **implemented**

Rule-based (not a second model call) gate every generated draft passes through: forbidden-phrase matching, invented-phone-number detection, invented-price detection (blocking), and generic AI-cliché detection (warning, non-blocking). See `agents/src/brand-qa/checks.ts`. A failing (blocking) result raises `BrandQaFailedError` and the content is never saved.

## Strategy Agent (`agents/src/strategist/`) — **stub**

Planned: marketing strategy, campaign planning, offer strategy, competitive positioning, lead-gen recommendations. Currently registered via `createStubAgent` and returns `NotImplementedError` when routed to (e.g. "Help me plan a marketing strategy...").

## SEO Agent (`agents/src/seo/`) — **stub**

Planned: keyword research, local SEO strategy, on-page analysis, meta title/description recommendations. The `website_analyze` tool (`tools/src/website-tools.ts`) already does basic on-page checks (title/meta-description length, heading presence) and is the intended building block for this agent's real implementation.

## Review Agent (`agents/src/reviews/`) — **stub**

Planned: review analysis, response drafting, recurring-theme identification, reputation recommendations. Blocked on a real review-platform integration (`review_lookup` tool currently throws `NotConfiguredError` — no invented reviews).

## Website Agent (`agents/src/website/`) — **stub**

Planned: website audits, conversion analysis, UX/CTA recommendations. `website_fetch`/`website_analyze` tools are real and ready to be composed into this agent.

## Analytics Agent (`agents/src/analytics/`) — **stub**

Planned: marketing metrics analysis, trend/weak-campaign identification, client-friendly reporting. Blocked on a real analytics integration (`analytics_lookup` tool currently throws `NotConfiguredError` — no invented metrics).

---

**Why stubs instead of omission?** Registering a stub (rather than leaving the agent name unrecognized) lets the Orchestrator's router match the request and return a structured, honest "not implemented yet" result — consistent with the platform rule to explicitly report missing capabilities rather than silently doing nothing or fabricating an answer. Implementing one for real is a contained change: write the agent, swap its registration in `agents/src/orchestrator/agent-registry.ts`, done — the Orchestrator's routing and response-normalization logic doesn't change.
