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

## Phase 3: structured generation stays OpenClaw-ready too

`Orchestrator.generateContent()` (Phase 3's structured AI pipeline — see ARCHITECTURE.md "Structured AI generation pipeline") follows the same rule as everything above: it's a plain method on `Orchestrator` with a typed input/output, callable directly, with no OpenClaw-specific branching. `apps/api`'s `POST /clients/:clientId/ai/generate` route is one caller of it; an OpenClaw tool handler would be another, calling the same method with the same contract. Nothing about it assumes HTTP or any particular runtime.

## Model provider vs. OpenClaw

Do not confuse the two integration points: **OpenClaw** is being evaluated as the *orchestration/runtime* layer for exposing Citadel AI's capabilities to other systems (chat surfaces, automations); the **model provider** (`integrations/models`) is Citadel AI's own reasoning engine (Claude today, swappable later — see [ARCHITECTURE.md](./ARCHITECTURE.md#model-provider-abstraction)). Neither depends on the other. OpenClaw could in principle be configured to use a different LLM for its own routing without changing which model Citadel AI's own agents use, and vice versa.
