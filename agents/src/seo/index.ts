import { createStubAgent } from '../stub-agent.js';

/**
 * The free-text Orchestrator.handle() router still points SEO-flavored
 * instructions ("Run an SEO audit...") at this stub, registered in
 * agents/src/orchestrator/agent-registry.ts — that entry point has no way
 * to extract a URL out of free text, and seo_audit requires one. The REAL
 * SEO Agent (see ./seo-agent.js) is used exclusively via the structured
 * entry point (Orchestrator.runSeoAudit() -> the seo-audit skill), the
 * same relationship ContentAgent has to create-social-post: the class is
 * never registered in AgentRegistry, only held by the skill that wraps
 * it. Reusing the name 'seo-agent' for both is deliberate — they are the
 * same capability, just reached through different, equally real,
 * entry points.
 */
export const seoAgent = createStubAgent(
  'seo-agent',
  'Keyword research, local SEO strategy, on-page SEO analysis, and meta title/description recommendations',
);

export { SeoAgent, SEO_AGENT_VERSION } from './seo-agent.js';
export type { SeoAgentInput, SeoAgentOutput } from './types.js';
