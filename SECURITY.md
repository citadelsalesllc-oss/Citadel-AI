# Security

## Secrets

All secrets (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `API_AUTH_TOKEN`, etc.) are read exclusively from environment variables (`apps/api/src/env.ts`, validated with Zod at startup — the process fails fast on a malformed/missing required value rather than running in a half-configured state). `.env` is gitignored; `.env.example` documents every variable with no real values. Nothing in the codebase hardcodes a credential.

## Tenant isolation

Every client-scoped table — `Service`, `ServiceArea`, `BrandProfile`, `TargetAudience`, `SeoProfile`, `Offer`, `Faq`, `MarketingNote`, `ContentItem`, `AuditLog` (`database/prisma/schema.prisma`) — carries a `clientId` foreign key. Two enforcement layers, not one:

1. **Every repository read/write for a specific child record filters by `(id, clientId)` together**, not just `id` (`database/src/repositories/service-repository.ts` is the canonical pattern). A valid record id belonging to a *different* client raises `ResourceNotFoundError` — deliberately the same error as an id that doesn't exist, so a caller can never distinguish "wrong id" from "someone else's record," which would itself be a cross-tenant information leak.
2. **API routes never accept a caller-supplied `clientId` for a write.** Every knowledge route resolves the client from the URL's `:idOrSlug` first (`clientRepository.requireByIdOrSlug`, 404 if unknown) and passes *that* resolved id into the repository call — a cross-tenant write has no code path to reach, it isn't merely checked and rejected.

`database/src/__tests__/tenant-isolation.test.ts` and `apps/api/src/__tests__/client-knowledge-api.test.ts` prove this: Client A's records never appear in Client B's lists or `getClientContext` result, and Client B cannot modify Client A's record even by supplying A's real record id.

Agents receive the full `ClientContext` scoped to exactly the client the request is for, via `AgentContext.client`, and generation prompts (`agents/src/content/prompt.ts`) are built solely from that one client's data.

**Known gap, not yet closed:** the Phase 1 content-lifecycle tools (`approval_request`, `content_approve`, `content_reject`, `content_request_revision`, `publish_content`) look up a `ContentItem` by id only (`contentRepository.findById`), without also checking which client it belongs to. In practice every caller today reaches these through routes/skills that already resolved the right client, so this isn't currently exploitable through the built UI/API surface — but it means a caller who already knows another client's content-item id could, in principle, act on it directly against `/content/:id/...`. Closing this (threading `clientId` through those tools' input and re-checking ownership, the same pattern used everywhere else in this document) is flagged as follow-up work rather than fixed in Phase 2, since it's outside this phase's scope (the new knowledge tables) — see the Phase 2 completion report for tracking.

## Authentication & authorization

**Current state (MVP): authentication-ready, not authentication-enforced.** `apps/api/src/middleware/auth.ts` implements a bearer-token gate (`API_AUTH_TOKEN`) that's active whenever that env var is set; it's unset (pass-through) by default for local development. `apps/api/src/middleware/actor.ts` resolves a `RequestActor` from request headers (`x-actor-id`, `x-actor-label`) for audit-logging purposes — this identifies who claims to be acting, it does not authenticate them. There is no user account system, role model, or per-client authorization check yet.

**Before exposing this API beyond localhost:** set `API_AUTH_TOKEN`, and add real per-request identity + per-client authorization (e.g., "actor X may only act on clients they're assigned to") in front of the routes in `apps/api/src/routes/`. The `RequestActor`/audit-logging plumbing already threads an actor through every tool call, so adding real auth is additive, not a redesign.

## Input validation

Every external input boundary is Zod-validated before use: HTTP request bodies (`apps/api/src/routes/*.ts`), tool inputs (`Tool.inputSchema`, enforced centrally in `ToolRegistry.call`), and skill inputs (`Skill.inputSchema`, enforced in `SkillRegistry.run`). Validation failures return `400` with the Zod issue list (`apps/api/src/middleware/error-handler.ts`) rather than reaching business logic with malformed data.

## Audit logging

Every mutating tool call (`client_update`, `content_save`, `approval_request`, `content_approve`, `content_reject`, `content_request_revision`, `publish_content`) writes an `AuditLog` row (`database/src/repositories/audit-repository.ts`) recording the acting identity, action, target, and relevant metadata, timestamped. This is the audit trail required for "every external action should be auditable" — query it via `auditRepository.listByClient(clientId)`.

## Approval before publishing

Enforced structurally, not by convention: `contentRepository.transition()` (`database/src/repositories/content-repository.ts`) only allows `PUBLISHED` to be reached from `APPROVED`, and `publish_content` (`tools/src/publish-tools.ts`) checks that status before ever calling the publish adapter. There is no code path — API route, tool, or agent — that can mark content published without it having passed through `REVIEW` and `APPROVED` first.

## Untrusted external content

Fetched webpages (`integrations/src/websites/website-fetch-adapter.ts`) and (once implemented) web search results, GBP data, and reviews are external, attacker-influenceable input. The website fetch adapter only extracts plain text/metadata via regex (no HTML execution, no script evaluation) and truncates the excerpt; nothing currently interpolates fetched content directly into a model prompt without going through the Content Agent's own structured, client-fact-only prompt builder. When agents that consume this content (SEO/Website agents) are implemented, treat any fetched/searched text as data, never as instructions, and never let it override brand rules or forbidden-phrase constraints.

## Safe external tool execution

`WebsiteFetchAdapter` restricts fetches to `http`/`https` URLs, sets a request timeout (10s), and identifies itself with a descriptive User-Agent. No tool executes shell commands, evaluates fetched content, or performs destructive operations. `publish_content` and the Google Business/Facebook adapters fail closed (`NotConfiguredError`) rather than silently no-oping or fabricating success when credentials are absent — see [ARCHITECTURE.md](./ARCHITECTURE.md#approval-gated-publishing--dont-fake-integrations).

## Webhook handling

No inbound webhooks are implemented yet (future: GBP notifications, social platform callbacks). When added: verify signatures using the platform's documented HMAC scheme before parsing the body, treat the payload as untrusted input subject to the same Zod-validation-at-the-boundary rule as everything else, and never let a webhook payload directly trigger a publish or approval action without going through the same approval-gate code path as a human-initiated request.

## Reporting

This is an internal, proprietary system for Citadel Sales & Marketing. Report security concerns to the project maintainers directly rather than filing a public issue.
