# Security

## Secrets

All secrets (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `API_AUTH_TOKEN`, etc.) are read exclusively from environment variables (`apps/api/src/env.ts`, validated with Zod at startup — the process fails fast on a malformed/missing required value rather than running in a half-configured state). `.env` is gitignored; `.env.example` documents every variable with no real values. Nothing in the codebase hardcodes a credential.

## Tenant isolation

Every client-scoped table — `Service`, `ServiceArea`, `BrandProfile`, `TargetAudience`, `SeoProfile`, `Offer`, `Faq`, `MarketingNote`, `ContentItem`, `SeoAudit`, `AuditLog` (`database/prisma/schema.prisma`) — carries a `clientId` foreign key. Two enforcement layers, not one:

1. **Every repository read/write for a specific child record filters by `(id, clientId)` together**, not just `id` (`database/src/repositories/service-repository.ts` is the canonical pattern). A valid record id belonging to a *different* client raises `ResourceNotFoundError` — deliberately the same error as an id that doesn't exist, so a caller can never distinguish "wrong id" from "someone else's record," which would itself be a cross-tenant information leak.
2. **API routes never accept a caller-supplied `clientId` for a write.** Every knowledge route resolves the client from the URL's `:idOrSlug` first (`clientRepository.requireByIdOrSlug`, 404 if unknown) and passes *that* resolved id into the repository call — a cross-tenant write has no code path to reach, it isn't merely checked and rejected.

`database/src/__tests__/tenant-isolation.test.ts` and `apps/api/src/__tests__/client-knowledge-api.test.ts` prove this: Client A's records never appear in Client B's lists or `getClientContext` result, and Client B cannot modify Client A's record even by supplying A's real record id.

Agents receive the full `ClientContext` scoped to exactly the client the request is for, via `AgentContext.client`, and generation prompts (`prompts/src/content/v1.ts`, `prompts/src/seo/v1.ts`) are built solely from that one client's data.

**Content-lifecycle tools** (`approval_request`, `content_approve`, `content_reject`, `content_request_revision`, `publish_content`) follow the exact same pattern, closing a gap flagged in the Phase 2 report: each now requires `clientIdOrSlug` in its input, resolves it to a real client id, and `contentRepository.transition()`/`requireByIdForClient()` scope every lookup by `(contentId, clientId)` together — the same `ResourceNotFoundError` whether the content id is unknown or belongs to a different client. A content record can never be read, approved, rejected, or published through another client's context, even by an attacker who knows the real content id. `GET /content/:id` requires `clientIdOrSlug` as a query parameter for the same reason (a GET has no body). Proven at three layers: `database/src/__tests__/tenant-isolation.test.ts` (repository), `tools/src/__tests__/content-tenant-isolation.test.ts` (tool), and `apps/api/src/__tests__/content-tenant-isolation-api.test.ts` (API, including that the legitimate owner's flow still works end to end).

**SEO audit tools** (`seo_audit_save`, `seo_audit_history`, Phase 4) follow the same shape: `seoAuditRepository`'s methods scope every lookup by `(id, clientId)` together (`database/src/repositories/seo-audit-repository.ts`), and the `seo-audit` skill always saves using the client id it resolved from `clientIdOrSlug` itself, never one supplied separately in the request body — a cross-tenant audit write has no code path to reach. Proven in `apps/api/src/__tests__/seo-audit.test.ts` ("keeps audits isolated between clients").

## Authentication & authorization

**Current state (MVP): authentication-ready, not authentication-enforced.** `apps/api/src/middleware/auth.ts` implements a bearer-token gate (`API_AUTH_TOKEN`) that's active whenever that env var is set; it's unset (pass-through) by default for local development. `apps/api/src/middleware/actor.ts` resolves a `RequestActor` from request headers (`x-actor-id`, `x-actor-label`) for audit-logging purposes — this identifies who claims to be acting, it does not authenticate them. There is no user account system, role model, or per-client authorization check yet.

**Before exposing this API beyond localhost:** set `API_AUTH_TOKEN`, and add real per-request identity + per-client authorization (e.g., "actor X may only act on clients they're assigned to") in front of the routes in `apps/api/src/routes/`. The `RequestActor`/audit-logging plumbing already threads an actor through every tool call, so adding real auth is additive, not a redesign.

## Input validation

Every external input boundary is Zod-validated before use: HTTP request bodies (`apps/api/src/routes/*.ts`), tool inputs (`Tool.inputSchema`, enforced centrally in `ToolRegistry.call`), and skill inputs (`Skill.inputSchema`, enforced in `SkillRegistry.run`). Validation failures return `400` with the Zod issue list (`apps/api/src/middleware/error-handler.ts`) rather than reaching business logic with malformed data.

## Audit logging

Every mutating tool call (`client_update`, `content_save`, `approval_request`, `content_approve`, `content_reject`, `content_request_revision`, `publish_content`, `seo_audit_save`) writes an `AuditLog` row (`database/src/repositories/audit-repository.ts`) recording the acting identity, action, target, and relevant metadata, timestamped. This is the audit trail required for "every external action should be auditable" — query it via `auditRepository.listByClient(clientId)`.

## Approval before publishing

Enforced structurally, not by convention: `contentRepository.transition()` (`database/src/repositories/content-repository.ts`) only allows `PUBLISHED` to be reached from `APPROVED`, and `publish_content` (`tools/src/publish-tools.ts`) checks that status before ever calling the publish adapter. There is no code path — API route, tool, or agent — that can mark content published without it having passed through `REVIEW` and `APPROVED` first.

## Untrusted external content

Fetched webpages (`integrations/src/websites/website-fetch-adapter.ts`) and (once implemented) web search results, GBP data, and reviews are external, attacker-influenceable input. The website fetch adapter only extracts plain text/metadata via regex (no HTML execution, no script evaluation) and truncates the excerpt; nothing interpolates fetched content directly into a model prompt without going through a structured, purpose-built prompt builder first.

**The SEO Agent (Phase 4) never gives the model the raw fetched page at all.** `SeoAgent.run()` runs the deterministic checks (`agents/src/seo/checks.ts`) against the fetched `WebsiteFetchResult` first, and only the resulting evidence catalog — short, labeled strings like `H1 heading: "..."` — reaches the model, wrapped in `untrustedBlock()` (`prompts/src/seo/v1.ts`) with an explicit instruction to treat it as data, not instructions. This is a stronger boundary than "tell the model not to follow embedded instructions": even if a page's HTML tried to smuggle a prompt-injection payload into, say, its `<title>`, the model only ever sees that title as a short quoted fact inside an evidence entry, never as free-flowing page content it reads directly. The same wrapping applies to client-supplied free text (marketing notes, `userInstructions`) reaching either the Content or SEO Agent's prompt.

## Safe external tool execution

`WebsiteFetchAdapter` restricts fetches to `http`/`https` URLs (`InvalidUrlError` otherwise), sets a request timeout (10s default, configurable), rejects non-HTML content types (`UnsupportedContentTypeError`) and oversized responses (`WebsiteContentTooLargeError`), and identifies itself with a descriptive User-Agent. A genuinely unreachable target or timeout throws rather than returning a fabricated result (`WebsiteUnreachableError`/`WebsiteFetchTimeoutError`) — see ARCHITECTURE.md "SEO analysis pipeline." No tool executes shell commands, evaluates fetched content, or performs destructive operations. `publish_content` and the Google Business/Facebook adapters fail closed (`NotConfiguredError`) rather than silently no-oping or fabricating success when credentials are absent — see [ARCHITECTURE.md](./ARCHITECTURE.md#approval-gated-publishing--dont-fake-integrations).

## Webhook handling

No inbound webhooks are implemented yet (future: GBP notifications, social platform callbacks). When added: verify signatures using the platform's documented HMAC scheme before parsing the body, treat the payload as untrusted input subject to the same Zod-validation-at-the-boundary rule as everything else, and never let a webhook payload directly trigger a publish or approval action without going through the same approval-gate code path as a human-initiated request.

## Reporting

This is an internal, proprietary system for Citadel Sales & Marketing. Report security concerns to the project maintainers directly rather than filing a public issue.
