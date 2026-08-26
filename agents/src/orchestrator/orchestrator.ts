import {
  BrandQaFailedError,
  NotImplementedError,
  type AgentRegistry,
  type ClientContext,
  type RequestActor,
  type SkillRegistry,
  type ToolRegistry,
} from '@citadel/shared';
import { classifyRequest, type RoutingDecision } from './router.js';

export interface OrchestratorRequest {
  clientIdOrSlug: string;
  instruction: string;
  actor: RequestActor;
  requestId: string;
}

export type OrchestratorResult =
  | { status: 'completed'; route: RoutingDecision; skillName: string; result: unknown }
  | { status: 'not_implemented'; route: RoutingDecision; message: string }
  | { status: 'unsupported'; message: string }
  | { status: 'qa_failed'; route: RoutingDecision; message: string; issues: unknown };

/**
 * The primary Citadel AI agent. It does NOT perform marketing tasks itself —
 * it identifies the client, classifies the request, and delegates to the
 * right skill or specialist agent, then normalizes the outcome (including
 * honest "not implemented" / "QA failed" results) into one response shape.
 * Depends only on the shared ToolRegistry/SkillRegistry/AgentRegistry
 * abstractions, not on concrete skill or tool packages, so it can be
 * exercised in tests with fakes.
 */
export class Orchestrator {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly skillRegistry: SkillRegistry,
    private readonly agentRegistry: AgentRegistry,
  ) {}

  async handle(request: OrchestratorRequest): Promise<OrchestratorResult> {
    const client = await this.toolRegistry.call<ClientContext>(
      'client_context',
      { idOrSlug: request.clientIdOrSlug },
      { actor: request.actor, requestId: request.requestId },
    );

    const route = classifyRequest(request.instruction);

    if (route.type === 'unsupported') {
      return { status: 'unsupported', message: route.reason };
    }

    if (route.type === 'agent') {
      const agent = this.agentRegistry.get(route.agentName);
      if (!agent) {
        return { status: 'unsupported', message: `No agent registered for ${route.agentName}.` };
      }
      try {
        const result = await agent.run(
          { instruction: request.instruction },
          { client, actor: request.actor, requestId: request.requestId },
        );
        return { status: 'completed', route, skillName: agent.name, result };
      } catch (error) {
        if (error instanceof NotImplementedError) {
          return { status: 'not_implemented', route, message: error.message };
        }
        throw error;
      }
    }

    // route.type === 'content-skill'
    try {
      const result = await this.skillRegistry.run(
        'create-social-post',
        {
          clientIdOrSlug: request.clientIdOrSlug,
          platform: route.platform,
          instruction: request.instruction,
        },
        { actor: request.actor, requestId: request.requestId },
      );
      return { status: 'completed', route, skillName: 'create-social-post', result };
    } catch (error) {
      if (error instanceof BrandQaFailedError) {
        return {
          status: 'qa_failed',
          route,
          message: error.message,
          issues: error.issues,
        };
      }
      throw error;
    }
  }
}
