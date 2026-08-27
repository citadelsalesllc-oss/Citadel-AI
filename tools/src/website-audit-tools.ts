import { z } from 'zod';
import { websiteAuditRepository, auditRepository } from '@citadel/database';
import { WebsiteAuditResultSchema, type WebsiteAuditRecord, type Tool, type ToolContext } from '@citadel/shared';

const WebsiteAuditSaveInputSchema = z.object({
  clientId: z.string().min(1),
  url: z.string(),
  result: WebsiteAuditResultSchema,
  agentVersion: z.string().min(1),
});
type WebsiteAuditSaveInput = z.infer<typeof WebsiteAuditSaveInputSchema>;

/** Persists a completed website audit. Never called on a QA-style "pass/fail" gate — every audit is worth keeping, good or bad, so future audits for the same client/URL can be compared over time. Never overwrites a past audit — see database/prisma/schema.prisma's WebsiteAudit doc comment. */
export const websiteAuditSaveTool: Tool<WebsiteAuditSaveInput, WebsiteAuditRecord> = {
  name: 'website_audit_save',
  description: "Save a completed website (marketing/conversion) audit result for a client's URL.",
  inputSchema: WebsiteAuditSaveInputSchema,
  async execute(input, context: ToolContext) {
    const record = await websiteAuditRepository.create({
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
      action: 'website_audit_save',
      targetType: 'WebsiteAudit',
      targetId: record.id,
      metadata: { url: input.url, overallScore: record.overallScore },
    });
    return record;
  },
};

const WebsiteAuditHistoryInputSchema = z.object({
  clientId: z.string().min(1),
  url: z.string().optional(),
});
type WebsiteAuditHistoryInput = z.infer<typeof WebsiteAuditHistoryInputSchema>;

/** Newest first — the basis for "Audit #1 -> Audit #2 -> improvement over time" comparisons. Optionally scoped to one URL. */
export const websiteAuditHistoryTool: Tool<WebsiteAuditHistoryInput, WebsiteAuditRecord[]> = {
  name: 'website_audit_history',
  description: "List a client's past website audits, newest first, optionally filtered to one URL.",
  inputSchema: WebsiteAuditHistoryInputSchema,
  async execute(input) {
    return websiteAuditRepository.listByClient(input.clientId, input.url);
  },
};
