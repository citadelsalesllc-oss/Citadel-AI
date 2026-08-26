import type { z } from 'zod';
import type { RequestActor } from './tool.js';

export interface SkillContext {
  actor: RequestActor;
  requestId: string;
}

/**
 * A skill is a complete, user-facing unit of work (e.g. "create a Facebook
 * post"): it resolves client context, calls one or more agents/tools, runs
 * QA, and persists a result. Skills are the surface OpenClaw (and the HTTP
 * API) invoke — see integrations/openclaw.
 */
export interface Skill<Input = unknown, Output = unknown> {
  readonly name: string;
  readonly description: string;
  // See the identical comment on Tool.inputSchema in tool.ts for why the
  // raw pre-parse input parameter is `any`.
  readonly inputSchema: z.ZodType<Input, z.ZodTypeDef, any>;
  run(input: Input, context: SkillContext): Promise<Output>;
}

export type AnySkill = Skill<any, any>;

export class SkillRegistry {
  private readonly skills = new Map<string, AnySkill>();

  register(skill: AnySkill): void {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill already registered: ${skill.name}`);
    }
    this.skills.set(skill.name, skill);
  }

  get(name: string): AnySkill | undefined {
    return this.skills.get(name);
  }

  list(): AnySkill[] {
    return Array.from(this.skills.values());
  }

  async run<Output = unknown>(name: string, input: unknown, context: SkillContext): Promise<Output> {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Unknown skill: ${name}`);
    }
    const parsed = skill.inputSchema.parse(input);
    return (await skill.run(parsed, context)) as Output;
  }
}
