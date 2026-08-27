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
| `website_fetch` | `WebsiteFetchAdapter` — real HTTP fetch + regex extraction | Real |
| `website_analyze` | `website_fetch` + basic on-page SEO heuristics | Real |
| `review_lookup` | none — no review platform configured | Stub (`NotConfiguredError`) |
| `analytics_lookup` | none — no analytics platform configured | Stub (`NotConfiguredError`) |
| `web_search` | none — no search provider configured | Stub (returns `{results: [], note: "..."}`, never fabricates results) |

`content_save`'s `initialStatus` exists for the Phase 3 structured generation pipeline (`create-social-post` skill, driven by `POST /clients/:clientId/ai/generate`): when Brand QA fails, the generated content is still saved — as `REVISION_REQUIRED` rather than `DRAFT` — so a QA failure is visible and actionable instead of silently discarded or misleadingly presented as approval-ready. See ARCHITECTURE.md "Content lifecycle & approval gate" and "Structured AI generation pipeline."

## Approval & publishing tools in detail

`approval_request` / `content_approve` / `content_reject` / `content_request_revision` / `publish_content` all require `clientIdOrSlug` — the authorized client/context the action is performed on behalf of — and delegate their actual state change to `contentRepository.transition()` (`database/src/repositories/content-repository.ts`), which enforces both the lifecycle state machine AND tenant scoping (looking up the content item by `(contentId, clientId)` together, `ResourceNotFoundError` if it belongs to a different client) independently of the tool layer — see [ARCHITECTURE.md](./ARCHITECTURE.md#content-lifecycle--approval-gate) and [SECURITY.md](./SECURITY.md#tenant-isolation). `publish_content` additionally re-checks status is `APPROVED` before calling the adapter, so an out-of-order publish attempt fails with one clear `InvalidLifecycleTransitionError` instead of a masked one.

`publish_content` uses whichever `PublishAdapter` `apps/api/src/container.ts` builds from `PUBLISH_PROVIDER`:
- `mock` (default) — `MockPublishAdapter` (`integrations/src/social/mock-publish-adapter.ts`) always "succeeds," returns a `mock-<platform>-<uuid>` external ID, and tags the result `isMock: true`. It never contacts a real API.
- `facebook` — `FacebookAdapter` (`integrations/src/social/facebook-adapter.ts`) is a real seam that currently always throws `NotConfiguredError` (real Graph API publishing is future work per the master spec — see "ENGINEERING RULE: Do not fake integrations").

## Knowledge management is API routes, not agent tools

Adding/updating services, service areas, brand profile, SEO profile, target audience, offers, FAQs, and marketing notes (Phase 2) are deliberately plain Express routes calling `@citadel/database` repositories directly (`apps/api/src/routes/clients.ts`) — **not** registered as agent-callable `Tool`s. These are Citadel-staff data-entry operations, not something an AI agent decides to do on its own; making them agent tools would be scope beyond what's needed ("do not build a generic CRM," "do not create unnecessary endpoints"). If a future agent needs to *write* knowledge autonomously (e.g., a client-onboarding agent extracting facts from a discovery call), wrap the relevant repository call in a proper `Tool` at that point — don't pre-build the capability speculatively.

## Adding a tool

See [DEVELOPMENT.md](./DEVELOPMENT.md#adding-a-new-tool). The short version: DB-backed tools import repositories from `@citadel/database` directly; anything touching an external service gets a real adapter + mock adapter pair in `integrations/src/<area>/` first, and the tool depends on the adapter *interface* so it stays swappable.
