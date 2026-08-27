import { z } from 'zod';
import { type ClientContext, type WebsiteAuditRecord, type Skill, type SkillContext, type ToolRegistry, type WebsiteFetchResult } from '@citadel/shared';
import { WebsiteAgent, WEBSITE_AGENT_VERSION, type WebsiteAgentOutput } from '@citadel/agents';

export const WebsiteAuditInputSchema = z.object({
  clientIdOrSlug: z.string().min(1),
  url: z.string().url(),
  targetService: z.string().optional(),
  targetLocation: z.string().optional(),
  userInstructions: z.string().optional(),
});
export type WebsiteAuditInput = z.infer<typeof WebsiteAuditInputSchema>;

export interface WebsiteAuditOutput {
  auditRecord: WebsiteAuditRecord;
  audit: WebsiteAgentOutput;
}

export interface WebsiteAuditDeps {
  toolRegistry: ToolRegistry;
  websiteAgent: WebsiteAgent;
}

/**
 * Complete, user-facing "audit this website for marketing/conversion
 * effectiveness" workflow: load client context -> fetch the target URL
 * (real HTTP fetch — the same website_fetch tool the seo-audit skill uses,
 * never fabricated if the site is unreachable) -> run the Website Agent's
 * deterministic-plus-LLM analysis -> save the result. Mirrors seo-audit's
 * shape exactly — the second "fetch a real page, analyze it, save it"
 * skill in the platform, this time answering "how effectively does this
 * website turn visitors into customers?" rather than "how well does it
 * rank." No pass/fail gate, same as seo-audit: every completed audit is
 * worth saving, good or bad, so a client's website can be tracked over
 * time (see website_audit_history).
 */
export function createWebsiteAuditSkill(deps: WebsiteAuditDeps): Skill<WebsiteAuditInput, WebsiteAuditOutput> {
  return {
    name: 'website-audit',
    description: "Audit a client's webpage for marketing effectiveness, conversion, customer journey, content, and brand consistency, and save the result.",
    inputSchema: WebsiteAuditInputSchema,
    async run(input, context: SkillContext): Promise<WebsiteAuditOutput> {
      const client = await deps.toolRegistry.call<ClientContext>(
        'client_context',
        { idOrSlug: input.clientIdOrSlug },
        { actor: context.actor, requestId: context.requestId },
      );

      const page = await deps.toolRegistry.call<WebsiteFetchResult>(
        'website_fetch',
        { url: input.url },
        { actor: context.actor, requestId: context.requestId, clientId: client.core.id },
      );

      const audit = await deps.websiteAgent.run(
        {
          url: input.url,
          page,
          targetService: input.targetService,
          targetLocation: input.targetLocation,
          userInstructions: input.userInstructions,
        },
        { client, actor: context.actor, requestId: context.requestId },
      );

      const auditRecord = await deps.toolRegistry.call<WebsiteAuditRecord>(
        'website_audit_save',
        { clientId: client.core.id, url: input.url, result: audit, agentVersion: WEBSITE_AGENT_VERSION },
        { actor: context.actor, requestId: context.requestId, clientId: client.core.id },
      );

      return { auditRecord, audit };
    },
  };
}
