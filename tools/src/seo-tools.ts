import { z } from 'zod';
import { seoAuditRepository, auditRepository } from '@citadel/database';
import { SeoAuditResultSchema, type SeoAuditRecord, type Tool, type ToolContext } from '@citadel/shared';

const SeoAuditSaveInputSchema = z.object({
  clientId: z.string().min(1),
  url: z.string(),
  result: SeoAuditResultSchema,
  agentVersion: z.string().min(1),
});
type SeoAuditSaveInput = z.infer<typeof SeoAuditSaveInputSchema>;

/** Persists a completed SEO audit. Never called on a QA-style "pass/fail" gate — every audit is worth keeping, good or bad, so future audits for the same client/URL can be compared over time. */
export const seoAuditSaveTool: Tool<SeoAuditSaveInput, SeoAuditRecord> = {
  name: 'seo_audit_save',
  description: "Save a completed SEO audit result for a client's URL.",
  inputSchema: SeoAuditSaveInputSchema,
  async execute(input, context: ToolContext) {
    const record = await seoAuditRepository.create({
      clientId: input.clientId,
      url: input.url,
      overallScore: input.result.overallScore,
      result: input.result,
      agentVersion: input.agentVersion,
      modelProvider: input.result.providerUsed,
      modelUsed: input.result.modelUsed,
    });
    await auditRepository.record({
      clientId: input.clientId,
      actor: context.actor.label,
      action: 'seo_audit_save',
      targetType: 'SeoAudit',
      targetId: record.id,
      metadata: { url: input.url, overallScore: record.overallScore },
    });
    return record;
  },
};

const SeoAuditHistoryInputSchema = z.object({
  clientId: z.string().min(1),
  url: z.string().optional(),
});
type SeoAuditHistoryInput = z.infer<typeof SeoAuditHistoryInputSchema>;

/** Newest first — the basis for "Audit #1 -> Audit #2 -> improvement over time" comparisons. Optionally scoped to one URL. */
export const seoAuditHistoryTool: Tool<SeoAuditHistoryInput, SeoAuditRecord[]> = {
  name: 'seo_audit_history',
  description: "List a client's past SEO audits, newest first, optionally filtered to one URL.",
  inputSchema: SeoAuditHistoryInputSchema,
  async execute(input) {
    return seoAuditRepository.listByClient(input.clientId, input.url);
  },
};
