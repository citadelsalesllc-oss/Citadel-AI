# OpenClaw integration

Per the master spec: "OpenClaw will serve as the agent/runtime/orchestration layer... Do not make OpenClaw the only way to execute the business logic. The core Citadel AI application must remain independently testable."

## What exists today

`integrations/src/openclaw/adapter.ts` exports `skillsToOpenClawTools(skills: AnySkill[]): OpenClawToolDefinition[]`, which maps Citadel AI's `Skill` registry into a generic, MCP-style tool-definition shape:

```ts
interface OpenClawToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema, via zod-to-json-schema
  handler: (input: unknown, ctx: { actor: RequestActor; requestId: string }) => Promise<unknown>;
}
```

`apps/api/src/container.ts` builds this from the live skill registry at startup (`skillsToOpenClawTools(skillRegistry.list())`) and exposes it read-only at `GET /openclaw/tools` for introspection today.

## Why this design

`skillsToOpenClawTools` takes the skill list as **data** — it does not import `@citadel/skills`. This is deliberate:

1. **No circular dependency.** `skills` depends on `agents` and `tools`; if `integrations/openclaw` imported `@citadel/skills`, and something in the `skills`/`agents`/`tools` chain ever needed the OpenClaw adapter, you'd have a cycle. Passing the registry contents in as a parameter avoids that entirely.
2. **Independent testability.** The whole application — orchestrator, agents, skills, API — runs, builds, and is tested (`pnpm test`) with zero knowledge of OpenClaw. OpenClaw is an optional consumer bolted on at the edge, not a load-bearing dependency.
3. **Provider neutrality.** Every `Skill.run(input, context)` already only needs `{ actor, requestId }` — the same shape both the HTTP API and an OpenClaw tool call would provide. No OpenClaw-specific logic leaks into skill implementations.

## Wiring up a real OpenClaw runtime (future work)

This repo does not depend on an OpenClaw SDK/runtime — none was available to integrate against at build time, and the master spec explicitly asks for a clean adapter rather than a faked integration. To connect a real OpenClaw runtime:

1. Take the `OpenClawToolDefinition[]` from `container.openClawTools` (or call `skillsToOpenClawTools(skillRegistry.list())` directly).
2. Register each definition's `name`/`description`/`inputSchema` with OpenClaw's tool-registration API (however that runtime expects it — likely a direct mapping, since the shape is intentionally MCP-like).
3. Wire OpenClaw's tool-invocation callback to call `.handler(input, ctx)`, supplying an `actor`/`requestId` appropriate to whoever is driving the OpenClaw session (a Citadel team member, a scheduled job, etc.).
4. If OpenClaw needs the specialist agents or raw tools directly (not just full skills), the same pattern applies: `agentRegistry.list()` / `toolRegistry.list()` are already available from the container and can be mapped the same way — write a small `agentsToOpenClawTools`/`toolsToOpenClawTools` alongside `skillsToOpenClawTools` if/when that's needed, following the same "take data in, don't import the concrete package" pattern.

## Phase 3-5: structured generation stays OpenClaw-ready too

`Orchestrator.generateContent()`, `Orchestrator.runSeoAudit()`, and `Orchestrator.runReviewTask()` (the structured AI pipelines — see ARCHITECTURE.md "Structured AI generation pipeline," "SEO analysis pipeline," and "Review Intelligence pipeline") follow the same rule as everything above: each is a plain method on `Orchestrator` with a typed input/output, callable directly, with no OpenClaw-specific branching. `apps/api`'s `POST /clients/:clientId/ai/generate`, `POST /clients/:clientId/ai/seo-audit`, and `POST /clients/:clientId/ai/reviews/:reviewId/analyze`/`.../respond` routes are each one caller; an OpenClaw tool handler would be another, calling the same methods with the same contracts. Nothing about any of them assumes HTTP or any particular runtime — the pattern held exactly the same way for Review in Phase 5 as it did for SEO in Phase 4 and content generation in Phase 3, without changing anything about how OpenClaw would eventually connect.

## Future Review Agent workflow (Phase 5)

The master spec's eventual target workflow for reviews is:

```
NEW REVIEW -> OpenClaw -> Citadel Review Agent -> QA -> DRAFT -> Human approval
```

Mapped onto what exists today: "NEW REVIEW" is a row `review_sync` (or, later, a real Google Business Profile webhook/poll) adds to the `Review` table; "OpenClaw" is a future trigger — a scheduled poll, or eventually a Google push notification — that calls an OpenClaw tool wrapping `Orchestrator.runReviewTask({ task: 'review_response', reviewId, ... })`; "Citadel Review Agent" is `ReviewResponseAgent` (which internally runs `ReviewAnalysisAgent`'s deterministic analysis first, then drafts); "QA" is the reused `BrandQaAgent`; "DRAFT" is exactly the `ReviewResponseStatus` a passing draft is saved as today, via `review_response_save`; "Human approval" is the still-manual step this repo does not build past — nothing in Phase 5 (or planned for the OpenClaw wiring above) auto-approves or auto-publishes a response. Once a real `GoogleBusinessReviewProvider` exists (see ARCHITECTURE.md "Future Google Business Profile integration"), "NEW REVIEW" becomes an actual webhook/poll rather than a manual `review_sync` call, but every step after it — Review Agent, QA, DRAFT, human approval — needs no change, since they were already built against the `Review` table and the `ReviewProvider` interface, not against Google specifically.

This is documentation only, per the master spec ("Do not fully integrate OpenClaw yet... Document this architecture") — no OpenClaw SDK, webhook receiver, or scheduling mechanism is implemented in Phase 5.

## Phase 6: the Command Center's AI Activity feed is OpenClaw-ready, not OpenClaw-integrated

The Citadel Command Center dashboard (`apps/dashboard`, `apps/api/src/routes/dashboard.ts` — see ARCHITECTURE.md "Citadel Command Center dashboard") added a persisted `ActivityLog` table and `GET /dashboard/activity` feed so staff can see every AI generation, SEO audit, and review task the platform has run. Per the master spec, Phase 6 explicitly does NOT wire OpenClaw into this feed — but the shape was chosen so that connecting it later needs no schema change:

- `ActivityLog`'s fields (`clientId`, `agent`, `task`, `modelProvider`, `executionTimeMs`, `success`, `errorCode`, `metadata`) describe "some agent ran some task for some client with this outcome" generically — they say nothing about HTTP, the Orchestrator, or any particular caller.
- `activityLogRepository.record()` (`database/src/repositories/activity-log-repository.ts`) is a plain function, not coupled to `apps/api/src/logger.ts`'s three call sites. A future OpenClaw tool handler (see "Wiring up a real OpenClaw runtime" above) could call it directly after invoking a skill via `OpenClawToolDefinition.handler`, and that action would appear in the same dashboard feed, attributed to whichever `agent`/`task` name the handler passes in, with no dashboard code change.

**Not implemented in Phase 6:** any actual call from an OpenClaw handler into `activityLogRepository.record()`, since no OpenClaw runtime is wired up yet at all (see "What exists today" above). This is documentation of the seam, not the seam being used.

## Model provider vs. OpenClaw

Do not confuse the two integration points: **OpenClaw** is being evaluated as the *orchestration/runtime* layer for exposing Citadel AI's capabilities to other systems (chat surfaces, automations); the **model provider** (`integrations/models`) is Citadel AI's own reasoning engine (Claude today, swappable later — see [ARCHITECTURE.md](./ARCHITECTURE.md#model-provider-abstraction)). Neither depends on the other. OpenClaw could in principle be configured to use a different LLM for its own routing without changing which model Citadel AI's own agents use, and vice versa.
