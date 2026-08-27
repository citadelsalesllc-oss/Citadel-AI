import {
  ClientNotActiveError,
  NotImplementedError,
  type AgentRegistry,
  type ClientContext,
  type RequestActor,
  type SkillRegistry,
  type ToolRegistry,
} from '@citadel/shared';
import { orchestratorPolicyV1 } from '@citadel/prompts';
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
  | { status: 'unsupported'; message: string };

export interface GenerateContentRequest {
  clientIdOrSlug: string;
  /** Only 'create_social_post' is supported in Phase 3 — see prompts/orchestrator/v1.ts SUPPORTED_STRUCTURED_TASKS. */
  task: string;
  platform: string;
  topic: string;
  userInstructions?: string;
  actor: RequestActor;
  requestId: string;
}

export type GenerateContentResult = { status: 'completed'; skillName: string; result: unknown };

/**
 * The primary Citadel AI agent. It does NOT perform marketing tasks itself —
 * it identifies the client, validates it, classifies/validates the request,
 * and delegates to the right skill or specialist agent, then normalizes the
 * outcome (including honest "not implemented" results) into one response
 * shape. Depends only on the shared ToolRegistry/SkillRegistry/AgentRegistry
 * abstractions, not on concrete skill or tool packages, so it can be
 * exercised in tests with fakes — and so OpenClaw (or any future caller)
 * can invoke it through the same clean interface the HTTP API uses. See
 * OPENCLAW.md.
 */
export class Orchestrator {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly skillRegistry: SkillRegistry,
    private readonly agentRegistry: AgentRegistry,
  ) {}

  /** Step 2-3 of the pipeline: identify the client, then validate it's in a usable state. Never invents a client. */
  private async identifyAndValidateClient(clientIdOrSlug: string, actor: RequestActor, requestId: string): Promise<ClientContext> {
    const client = await this.toolRegistry.call<ClientContext>(
      'client_context',
      { idOrSlug: clientIdOrSlug },
      { actor, requestId },
    );
    if (client.core.status === 'ARCHIVED') {
      throw new ClientNotActiveError(clientIdOrSlug, client.core.status);
    }
    return client;
  }

  /** Free-text entry point (e.g. POST /orchestrator/requests) — classifies the instruction, then delegates. */
  async handle(request: OrchestratorRequest): Promise<OrchestratorResult> {
    const client = await this.identifyAndValidateClient(request.clientIdOrSlug, request.actor, request.requestId);

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
          topic: request.instruction,
        },
        { actor: request.actor, requestId: request.requestId },
      );
      return { status: 'completed', route, skillName: 'create-social-post', result };
    } catch (error) {
      if (error instanceof NotImplementedError) {
        return { status: 'not_implemented', route, message: error.message };
      }
      throw error;
    }
  }

  /**
   * Structured entry point — POST /clients/:clientId/ai/generate. The
   * exact 10-step pipeline from the Phase 3 spec: identify + validate the
   * client, retrieve its context, determine the agent (only
   * create_social_post/Content Agent exists yet), execute it (which
   * internally generates, runs Brand QA, and saves — see
   * create-social-post skill), and return the result. Unlike `handle()`,
   * there is no keyword classification here — `task` names the capability
   * directly, and an unsupported one is reported honestly rather than
   * guessed at.
   */
  async generateContent(request: GenerateContentRequest): Promise<GenerateContentResult> {
    await this.identifyAndValidateClient(request.clientIdOrSlug, request.actor, request.requestId);

    const supportedTasks: readonly string[] = orchestratorPolicyV1.SUPPORTED_STRUCTURED_TASKS;
    if (!supportedTasks.includes(request.task)) {
      throw new NotImplementedError(`task "${request.task}"`);
    }

    const result = await this.skillRegistry.run(
      'create-social-post',
      {
        clientIdOrSlug: request.clientIdOrSlug,
        platform: request.platform.toLowerCase(),
        topic: request.topic,
        userInstructions: request.userInstructions,
      },
      { actor: request.actor, requestId: request.requestId },
    );

    return { status: 'completed', skillName: 'create-social-post', result };
  }
}
