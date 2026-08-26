import { NotImplementedError, type Agent, type AgentContext } from '@citadel/shared';

/**
 * Placeholder for a specialist agent described in the master spec but not
 * yet built. Registering it (rather than omitting it) lets the orchestrator
 * route to it and get an honest "not implemented yet" response instead of
 * either crashing on an unknown agent name or silently doing nothing —
 * consistent with the platform rule to explicitly report missing
 * capabilities rather than inventing an answer.
 */
export function createStubAgent(name: string, description: string): Agent<unknown, never> {
  return {
    name,
    description: `${description} (NOT YET IMPLEMENTED — planned for a future phase.)`,
    async run(_input: unknown, _context: AgentContext): Promise<never> {
      throw new NotImplementedError(`The ${name} (${description})`);
    },
  };
}
