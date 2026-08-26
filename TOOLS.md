# Tools

Tools are the only way agents touch real data or external systems — they never hallucinate a fact a tool could have provided. Every tool implements `Tool<Input, Output>` (`shared/src/tool.ts`): a Zod `inputSchema` and an `execute(input, context)`. `ToolRegistry.call(name, input, context)` (also in `shared`) validates input against the schema before invoking the tool, so every caller (API route, agent, future OpenClaw tool call) gets the same validation for free. Implementations live in `tools/src/`; `tools/src/registry.ts` assembles the default registry used by `apps/api`.

| Tool | Backing | Status |
| --- | --- | --- |
| `client_lookup` | Postgres (`clientRepository`) | Real |
| `client_update` | Postgres, audit-logged | Real |
| `content_save` | Postgres, creates `DRAFT`, audit-logged | Real |
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

## Approval & publishing tools in detail

`approval_request` / `content_approve` / `content_reject` / `content_request_revision` / `publish_content` all delegate their actual state change to `contentRepository.transition()` (`database/src/repositories/content-repository.ts`), which enforces the lifecycle state machine independently of the tool layer — see [ARCHITECTURE.md](./ARCHITECTURE.md#content-lifecycle--approval-gate). `publish_content` additionally re-checks status is `APPROVED` before calling the adapter, so an out-of-order publish attempt fails with one clear `InvalidLifecycleTransitionError` instead of a masked one.

`publish_content` uses whichever `PublishAdapter` `apps/api/src/container.ts` builds from `PUBLISH_PROVIDER`:
- `mock` (default) — `MockPublishAdapter` (`integrations/src/social/mock-publish-adapter.ts`) always "succeeds," returns a `mock-<platform>-<uuid>` external ID, and tags the result `isMock: true`. It never contacts a real API.
- `facebook` — `FacebookAdapter` (`integrations/src/social/facebook-adapter.ts`) is a real seam that currently always throws `NotConfiguredError` (real Graph API publishing is future work per the master spec — see "ENGINEERING RULE: Do not fake integrations").

## Adding a tool

See [DEVELOPMENT.md](./DEVELOPMENT.md#adding-a-new-tool). The short version: DB-backed tools import repositories from `@citadel/database` directly; anything touching an external service gets a real adapter + mock adapter pair in `integrations/src/<area>/` first, and the tool depends on the adapter *interface* so it stays swappable.
