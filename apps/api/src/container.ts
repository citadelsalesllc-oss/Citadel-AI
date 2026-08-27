import { createModelProvider } from '@citadel/integrations/models';
import { createPublishAdapter } from '@citadel/integrations/social';
import { skillsToOpenClawTools, type OpenClawToolDefinition } from '@citadel/integrations/openclaw';
import { createToolRegistry } from '@citadel/tools';
import {
  ContentAgent,
  BrandQaAgent,
  Orchestrator,
  createDefaultAgentRegistry,
} from '@citadel/agents';
import { createDefaultSkillRegistry } from '@citadel/skills';
import type { ToolRegistry, SkillRegistry, AgentRegistry } from '@citadel/shared';
import type { Env } from './env.js';

export interface Container {
  toolRegistry: ToolRegistry;
  skillRegistry: SkillRegistry;
  agentRegistry: AgentRegistry;
  orchestrator: Orchestrator;
  openClawTools: OpenClawToolDefinition[];
}

/**
 * Wires every layer together (tools -> agents -> skills -> orchestrator)
 * from environment configuration. This is the only place in the app that
 * knows which concrete ModelProvider/PublishAdapter implementations are in
 * use — everything downstream depends on the shared interfaces.
 */
export function buildContainer(env: Env): Container {
  const modelProvider = createModelProvider({
    provider: env.MODEL_PROVIDER,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicModel: env.ANTHROPIC_MODEL,
    timeoutMs: env.MODEL_TIMEOUT_MS,
  });

  const publishAdapter = createPublishAdapter({
    provider: env.PUBLISH_PROVIDER,
    facebookPageAccessToken: env.FACEBOOK_PAGE_ACCESS_TOKEN,
  });

  const toolRegistry = createToolRegistry({ publishAdapter });

  const contentAgent = new ContentAgent(modelProvider);
  const brandQaAgent = new BrandQaAgent();
  const agentRegistry = createDefaultAgentRegistry();

  const skillRegistry = createDefaultSkillRegistry({ toolRegistry, contentAgent, brandQaAgent });

  const orchestrator = new Orchestrator(toolRegistry, skillRegistry, agentRegistry);

  const openClawTools = skillsToOpenClawTools(skillRegistry.list());

  return { toolRegistry, skillRegistry, agentRegistry, orchestrator, openClawTools };
}
