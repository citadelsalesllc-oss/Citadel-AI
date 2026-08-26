import type { z } from 'zod';

/**
 * A single actor identity flowing through tool/agent calls, for audit
 * logging and future authorization checks. Not full auth — see SECURITY.md.
 */
export interface RequestActor {
  id: string;
  label: string;
}

export interface ToolContext {
  actor: RequestActor;
  requestId: string;
  /** The tenant this call is scoped to. Tools must never cross this boundary. */
  clientId?: string;
}

/**
 * A callable capability an agent can invoke instead of hallucinating an
 * answer. Every tool declares its input/output shape with Zod so calls are
 * validated the same way whether they come from an agent, the HTTP API, or
 * (later) an OpenClaw tool call.
 */
export interface Tool<Input = unknown, Output = unknown> {
  readonly name: string;
  readonly description: string;
  // The third ZodType parameter (raw pre-parse input) is intentionally left
  // as `any`: schemas that use `.default()`/`.optional()` have a raw input
  // type that differs from their parsed Input type, and tools only care
  // about the parsed shape.
  readonly inputSchema: z.ZodType<Input, z.ZodTypeDef, any>;
  execute(input: Input, context: ToolContext): Promise<Output>;
}

export type AnyTool = Tool<any, any>;

export class ToolRegistry {
  private readonly tools = new Map<string, AnyTool>();

  register(tool: AnyTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): AnyTool | undefined {
    return this.tools.get(name);
  }

  require(name: string): AnyTool {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool;
  }

  list(): AnyTool[] {
    return Array.from(this.tools.values());
  }

  async call<Output = unknown>(name: string, input: unknown, context: ToolContext): Promise<Output> {
    const tool = this.require(name);
    const parsed = tool.inputSchema.parse(input);
    return (await tool.execute(parsed, context)) as Output;
  }
}
