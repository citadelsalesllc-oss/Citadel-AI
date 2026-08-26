import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AnySkill, RequestActor } from '@citadel/shared';

/**
 * Generic tool-call shape OpenClaw (or any similar MCP-style orchestration
 * runtime) can register and invoke. This module intentionally does NOT
 * import @citadel/skills — it accepts the skill registry's contents as data
 * so the core application stays fully runnable and testable without
 * OpenClaw, per the master spec's "core app must remain independently
 * testable" requirement. Wiring this into an actual OpenClaw runtime is
 * documented in OPENCLAW.md and left as the integration point for when
 * OpenClaw's own tool-registration API is available.
 */
export interface OpenClawToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: unknown, ctx: { actor: RequestActor; requestId: string }) => Promise<unknown>;
}

export function skillsToOpenClawTools(skills: AnySkill[]): OpenClawToolDefinition[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    inputSchema: zodToJsonSchema(skill.inputSchema, skill.name) as Record<string, unknown>,
    handler: async (input, ctx) => {
      const parsed = skill.inputSchema.parse(input);
      return skill.run(parsed, ctx);
    },
  }));
}
