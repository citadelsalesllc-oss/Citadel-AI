import { AgentRegistry } from '@citadel/shared';
import { strategyAgent } from '../strategist/index.js';
import { seoAgent } from '../seo/index.js';
import { reviewAgent } from '../reviews/index.js';
import { websiteAgent } from '../website/index.js';
import { analyticsAgent } from '../analytics/index.js';

/**
 * Builds the registry of specialist agents the Orchestrator can route
 * non-content requests to. Only the stub agents live here today — as each
 * is implemented for real, its registration in this function is the only
 * place that needs to change.
 */
export function createDefaultAgentRegistry(): AgentRegistry {
  const registry = new AgentRegistry();
  registry.register(strategyAgent);
  registry.register(seoAgent);
  registry.register(reviewAgent);
  registry.register(websiteAgent);
  registry.register(analyticsAgent);
  return registry;
}
