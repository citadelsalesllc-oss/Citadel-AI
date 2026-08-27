import { z } from 'zod';
import { type ClientContext, type SeoAuditRecord, type Skill, type SkillContext, type ToolRegistry, type WebsiteFetchResult } from '@citadel/shared';
import { SeoAgent, SEO_AGENT_VERSION, type SeoAgentOutput } from '@citadel/agents';

export const SeoAuditInputSchema = z.object({
  clientIdOrSlug: z.string().min(1),
  url: z.string().url(),
  targetService: z.string().optional(),
  targetLocation: z.string().optional(),
  userInstructions: z.string().optional(),
});
export type SeoAuditInput = z.infer<typeof SeoAuditInputSchema>;

export interface SeoAuditOutput {
  auditRecord: SeoAuditRecord;
  audit: SeoAgentOutput;
}

export interface SeoAuditDeps {
  toolRegistry: ToolRegistry;
  seoAgent: SeoAgent;
}

/**
 * Complete, user-facing "audit this page" workflow: load client context ->
 * fetch the target URL (real HTTP fetch — never fabricated if the site is
 * unreachable, see WebsiteFetchAdapter) -> run the SEO Agent's
 * deterministic-plus-LLM analysis -> save the result. Mirrors
 * create-social-post's shape exactly: this is the second complete
 * end-to-end skill in the platform (see AGENTS.md). Unlike Brand QA,
 * there's no pass/fail gate here — every completed audit is worth saving,
 * good or bad, so a client's SEO can be tracked over time (see
 * seo_audit_history).
 */
export function createSeoAuditSkill(deps: SeoAuditDeps): Skill<SeoAuditInput, SeoAuditOutput> {
  return {
    name: 'seo-audit',
    description: "Audit a client's webpage for technical, on-page, local SEO, and conversion issues and save the result.",
    inputSchema: SeoAuditInputSchema,
    async run(input, context: SkillContext): Promise<SeoAuditOutput> {
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

      const audit = await deps.seoAgent.run(
        {
          url: input.url,
          page,
          targetService: input.targetService,
          targetLocation: input.targetLocation,
          userInstructions: input.userInstructions,
        },
        { client, actor: context.actor, requestId: context.requestId },
      );

      const auditRecord = await deps.toolRegistry.call<SeoAuditRecord>(
        'seo_audit_save',
        { clientId: client.core.id, url: input.url, result: audit, agentVersion: SEO_AGENT_VERSION },
        { actor: context.actor, requestId: context.requestId, clientId: client.core.id },
      );

      return { auditRecord, audit };
    },
  };
}
