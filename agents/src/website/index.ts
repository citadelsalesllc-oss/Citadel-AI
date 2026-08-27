import { createStubAgent } from '../stub-agent.js';

/**
 * The free-text Orchestrator.handle() router still points website-audit-
 * flavored instructions ("Run a website audit...") at this stub,
 * registered in agents/src/orchestrator/agent-registry.ts — that entry
 * point has no way to extract a URL out of free text, and website_audit
 * requires one. The REAL Website Agent (see ./website-agent.js) is used
 * exclusively via the structured entry point
 * (Orchestrator.runWebsiteAudit() -> the website-audit skill), the same
 * relationship SeoAgent has to seo-audit. Reusing the name
 * 'website-agent' for both is deliberate — they are the same capability,
 * just reached through different, equally real, entry points.
 */
export const websiteAgent = createStubAgent(
  'website-agent',
  'Website audits, conversion analysis, UX recommendations, and service-page/CTA recommendations',
);

export { WebsiteAgent, WEBSITE_AGENT_VERSION } from './website-agent.js';
export type { WebsiteAgentInput, WebsiteAgentOutput } from './types.js';
