# Development

## Setup

```bash
pnpm install
cp .env.example .env
```

Requires a reachable PostgreSQL instance. Locally:

```bash
createdb citadel_ai        # dev database
createdb citadel_ai_test   # test database (tests/global-setup.ts migrates this automatically)
```

Then:

```bash
pnpm --filter @citadel/database run migrate:dev   # first-time schema setup
pnpm db:seed                                       # seeds the CDA Septic Systems demo client
```

## Everyday commands

```bash
pnpm dev:api        # API with hot reload (tsx watch)
pnpm test           # full test suite (unit + DB integration + API end-to-end)
pnpm typecheck       # type-check every package
pnpm lint            # ESLint
pnpm build           # build every package (tsc)
```

Tests run against a **separate** `citadel_ai_test` database (`tests/setup-env.ts` forces `DATABASE_URL` before any test module loads; `tests/global-setup.ts` runs `prisma migrate deploy` against it once per test run) — running `pnpm test` never touches your dev data.

## Monorepo layout

pnpm workspaces (`pnpm-workspace.yaml`): `shared`, `database`, `integrations`, `tools`, `agents`, `skills`, `apps/*`. Each package builds independently (`tsc`) to its own `dist/`; other packages consume the built output via `workspace:*` dependencies and package `exports` maps (not raw `src/` imports), so `apps/api` behaves the same in dev (`tsx`, which transpiles on the fly but still resolves workspace deps' `dist/`) as it will once actually built for deployment. **This means after editing a package other than the one you're running, rebuild it** (`pnpm --filter @citadel/<pkg> run build`) before the change is visible to a dependent package — `pnpm build` rebuilds everything in dependency order.

TypeScript config: `tsconfig.base.json` at the repo root (strict mode, `NodeNext` module resolution — relative imports need explicit `.js` extensions even though the source is `.ts`, per Node ESM rules) is extended by every package's own `tsconfig.json`.

## Adding a new specialist agent

1. Create `agents/src/<name>/` with an `Agent<Input, Output>` implementation (see `agents/src/content/content-agent.ts` for the pattern: constructor takes only interfaces, `run(input, context)` where `context.client` is already the resolved `ClientContext`).
2. If it's replacing a stub, remove its `createStubAgent(...)` registration in `agents/src/orchestrator/agent-registry.ts` and register the real agent instead.
3. Add routing keywords for it in `agents/src/orchestrator/router.ts` if the Orchestrator should reach it directly, or wrap it in a `Skill` (see below) if it needs to persist a result.
4. Write unit tests colocated with the agent (`*.test.ts`) using `agents/src/test-fixtures.ts`'s `makeTestClient()`.

## Adding a new skill

1. Create `skills/src/<name>/` following `skills/src/create-social-post/create-social-post.ts`: a factory function taking its dependencies (agents, `ToolRegistry`) and returning a `Skill`.
2. Register it in `skills/src/registry.ts`.
3. Wire its dependencies in `apps/api/src/container.ts`.
4. It's automatically exposed to OpenClaw (`skillsToOpenClawTools` maps the whole skill registry) and to the API — add an explicit route in `apps/api/src/routes/` if it needs one beyond the generic orchestrator entry point.

## Adding a new tool

Add it in `tools/src/`, following the `Tool<Input, Output>` interface from `shared`. If it's DB-backed, use the repositories in `@citadel/database`. If it wraps an external service, put the actual client/adapter in `integrations/src/<area>/` first (with a mock implementation alongside — never call an unconfigured external API silently) and have the tool depend on the adapter interface, not the concrete class, so it stays swappable and testable. Register it in `tools/src/registry.ts`.

## Testing conventions

- Pure logic (router classification, Brand QA checks, prompt building) — plain `describe`/`it`, no DB, no server.
- Anything touching Postgres — real queries against `citadel_ai_test` (no mocking the ORM); clean up rows you create in `afterAll`.
- Full-stack behavior — `supertest` against `createApp(env, container)` directly (no separate server process), see `apps/api/src/__tests__/demo-flow.test.ts`.
- `MODEL_PROVIDER=mock` and `PUBLISH_PROVIDER=mock` are forced in `tests/setup-env.ts` — the suite never needs real credentials and never contacts a real API.

## Code style

Strict TypeScript, no `any` without a documented reason (ESLint warns), Zod at every input boundary (tool inputs, skill inputs, HTTP request bodies), no comments explaining *what* code does — only *why* when it's non-obvious (see existing files for the expected density).
