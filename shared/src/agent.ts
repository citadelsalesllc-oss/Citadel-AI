import type { ClientContext } from './types/client.js';
import type { RequestActor } from './tool.js';

export interface AgentContext {
  /** The full aggregated client knowledge — see ClientContext for shape. */
  client: ClientContext;
  actor: RequestActor;
  requestId: string;
}

export interface Agent<Input = unknown, Output = unknown> {
  readonly name: string;
  readonly description: string;
  run(input: Input, context: AgentContext): Promise<Output>;
}

export type AnyAgent = Agent<any, any>;

export class AgentRegistry {
  private readonly agents = new Map<string, AnyAgent>();

  register(agent: AnyAgent): void {
    if (this.agents.has(agent.name)) {
      throw new Error(`Agent already registered: ${agent.name}`);
    }
    this.agents.set(agent.name, agent);
  }

  get(name: string): AnyAgent | undefined {
    return this.agents.get(name);
  }

  list(): AnyAgent[] {
    return Array.from(this.agents.values());
  }
}
