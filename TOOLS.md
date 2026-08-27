# Tools

Tools are the only way agents touch real data or external systems — they never hallucinate a fact a tool could have provided. Every tool implements `Tool<Input, Output>` (`shared/src/tool.ts`): a Zod `inputSchema` and an `execute(input, context)`. `ToolRegistry.call(name, input, context)` (also in `shared`) validates input against the schema before invoking the tool, so every caller (API route, agent, future OpenClaw tool call) gets the same validation for free. Implementations live in `tools/src/`; `tools/src/registry.ts` assembles the default registry used by `apps/api`.

| Tool | Backing | Status |
| --- | --- | --- |
| `client_lookup` | Postgres (`clientRepository`) — core record only | Real |
| `client_context` | Postgres (`getClientContext`) — full aggregated knowledge, see ARCHITECTURE.md | Real |
| `client_update` | Postgres, audit-logged | Real |
| `content_save` | Postgres, creates `DRAFT` or `REVISION_REQUIRED` (via `initialStatus`, default `DRAFT`), audit-logged | Real |
| `content_search` | Postgres | Real |
| `approval_request` | Postgres, `DRAFT/REVISION_REQUIRED -> REVIEW` | Real |
| `content_approve` | Postgres, `REVIEW -> APPROVED` | Real |
| `content_reject` | Postgres, `REVIEW -> REJECTED` | Real |
| `content_request_revision` | Postgres, `REVIEW -> REVISION_REQUIRED` | Real |
| `publish_content` | `PublishAdapter` (mock by default), `APPROVED -> PUBLISHED` | Real gate; mock adapter by default |
| `website_fetch` | `WebsiteFetchAdapter` — real HTTP fetch + regex extraction, plus robots.txt/sitemap.xml (Phase 4) | Real |
| `website_analyze` | `website_fetch` + basic on-page SEO heuristics | Real |
| `seo_audit_save` | Postgres, persists a completed `SeoAuditResult`, audit-logged | Real |
| `seo_audit_history` | Postgres, lists a client's past audits newest-first, optionally filtered to one URL | Real |
| `website_audit_save` | Postgres, persists a completed `WebsiteAuditResult`, audit-logged | Real |
| `website_audit_history` | Postgres, lists a client's past website audits newest-first, optionally filtered to one URL | Real |
| `review_sync` | `ReviewProvider` (mock by default) — pulls reviews into Postgres, idempotent, audit-logged | Real gate; mock provider by default |
| `review_lookup` | Postgres (`reviewRepository`) — lists a client's already-synced reviews, optional status filter | Real |
| `review_get` | Postgres, tenant-scoped single-review fetch | Real |
| `review_response_save` | Postgres, saves a response draft + appends a `ReviewResponseVersion`, audit-logged | Real |
| `analytics_lookup` | none — no analytics platform configured | Stub (`NotConfiguredError`) |
| `web_search` | none — no search provider configured | Stub (returns `{results: [], note: "..."}`, never fabricates results) |

`content_save`'s `initialStatus` exists for the Phase 3 structured generation pipeline (`create-social-post` skill, driven by `POST /clients/:clientId/ai/generate`): when Brand QA fails, the generated content is still saved — as `REVISION_REQUIRED` rather than `DRAFT` — so a QA failure is visible and actionable instead of silently discarded or misleadingly presented as approval-ready. See ARCHITECTURE.md "Content lifecycle & approval gate" and "Structured AI generation pipeline."

## Approval & publishing tools in detail

`approval_request` / `content_approve` / `content_reject` / `content_request_revision` / `publish_content` all require `clientIdOrSlug` — the authorized client/context the action is performed on behalf of — and delegate their actual state change to `contentRepository.transition()` (`database/src/repositories/content-repository.ts`), which enforces both the lifecycle state machine AND tenant scoping (looking up the content item by `(contentId, clientId)` together, `ResourceNotFoundError` if it belongs to a different client) independently of the tool layer — see [ARCHITECTURE.md](./ARCHITECTURE.md#content-lifecycle--approval-gate) and [SECURITY.md](./SECURITY.md#tenant-isolation). `publish_content` additionally re-checks status is `APPROVED` before calling the adapter, so an out-of-order publish attempt fails with one clear `InvalidLifecycleTransitionError` instead of a masked one.

`publish_content` uses whichever `PublishAdapter` `apps/api/src/container.ts` builds from `PUBLISH_PROVIDER`:
- `mock` (default) — `MockPublishAdapter` (`integrations/src/social/mock-publish-adapter.ts`) always "succeeds," returns a `mock-<platform>-<uuid>` external ID, and tags the result `isMock: true`. It never contacts a real API.
- `facebook` — `FacebookAdapter` (`integrations/src/social/facebook-adapter.ts`) is a real seam that currently always throws `NotConfiguredError` (real Graph API publishing is future work per the master spec — see "ENGINEERING RULE: Do not fake integrations").

## Website fetching and SEO audit tools in detail (Phase 4)

`website_fetch` never pretends a page was retrieved when it wasn't: a genuinely unreachable target, a timeout, a non-HTML response, or an oversized body all throw (`WebsiteUnreachableError`/`WebsiteFetchTimeoutError`/`UnsupportedContentTypeError`/`WebsiteContentTooLargeError`), while an HTTP error status from the target itself (404, 500...) is returned as data — it's a real, analyzable finding, not a fetch failure. See ARCHITECTURE.md "SEO analysis pipeline" for the full behavior, including why fetching `robots.txt`/`sitemap.xml` for the client's own, explicitly-audited URL isn't the "web crawler" the master spec says not to build yet.

`seo_audit_save` never gates on a pass/fail the way `content_save` gates on Brand QA — every completed SEO audit is persisted, good or bad, so `seo_audit_history` can support before/after comparison as a client's site improves over time.

## Website audit tools in detail (Phase 7)

`website_audit_save` and `website_audit_history` are the Website Agent's equivalents of `seo_audit_save`/`seo_audit_history`, with the same "never gates on pass/fail" behavior: every completed `WebsiteAuditResult` is persisted regardless of score, so `website_audit_history` can support before/after comparison as a client's conversion effectiveness improves over time. The `website-audit` skill fetches the page with the same `website_fetch` tool the `seo-audit` skill uses — there is no separate "website fetch for marketing purposes" tool — see ARCHITECTURE.md "Website Intelligence pipeline" for why the SEO and Website audits share ingestion but diverge in what they check for.

## Review tools in detail (Phase 5)

`review_sync` is the only tool that calls the injected `ReviewProvider` live — mock (`MockReviewProvider`, deterministic fixture data) by default, `google_business` (`GoogleBusinessReviewProvider`, currently `NotConfiguredError`) when configured. Everything else (`review_lookup`, `review_get`, the Review Agents) only ever reads the already-synced, tenant-scoped `Review` rows — see ARCHITECTURE.md "Review Intelligence pipeline" for why this ingestion-then-analysis split exists and how it makes swapping in the real Google integration a one-line factory change.

`review_response_save` never gates on pass/fail either — same reasoning as `seo_audit_save` — but unlike it, every save also appends a `ReviewResponseVersion` row (`reviewRepository.saveResponse()`'s Prisma transaction), so regenerating a response never loses the previous draft's text; `GET /clients/:idOrSlug/reviews/:reviewId` returns the full version history alongside the review's current state.

## Knowledge management is API routes, not agent tools

Adding/updating services, service areas, brand profile, SEO profile, target audience, offers, FAQs, and marketing notes (Phase 2) are deliberately plain Express routes calling `@citadel/database` repositories directly (`apps/api/src/routes/clients.ts`) — **not** registered as agent-callable `Tool`s. These are Citadel-staff data-entry operations, not something an AI agent decides to do on its own; making them agent tools would be scope beyond what's needed ("do not build a generic CRM," "do not create unnecessary endpoints"). If a future agent needs to *write* knowledge autonomously (e.g., a client-onboarding agent extracting facts from a discovery call), wrap the relevant repository call in a proper `Tool` at that point — don't pre-build the capability speculatively.

## Adding a tool

See [DEVELOPMENT.md](./DEVELOPMENT.md#adding-a-new-tool). The short version: DB-backed tools import repositories from `@citadel/database` directly; anything touching an external service gets a real adapter + mock adapter pair in `integrations/src/<area>/` first, and the tool depends on the adapter *interface* so it stays swappable.
