import { z } from 'zod';

/**
 * Shared shapes for the SEO Agent's structured output and its persisted
 * record (Phase 4). Mirrors the layering established for content
 * generation in Phase 3: an internal, camelCase agent-output type here in
 * `shared`, an LLM-facing snake_case JSON contract in `@citadel/prompts`
 * (see prompts/src/seo/v1.ts), and a snake_case HTTP response assembled by
 * the API route to match the master spec's example shape exactly.
 */

export const SeoIssueSeveritySchema = z.enum(['critical', 'warning', 'info']);
export type SeoIssueSeverity = z.infer<typeof SeoIssueSeveritySchema>;

export const SeoIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: SeoIssueSeveritySchema,
});
export type SeoIssue = z.infer<typeof SeoIssueSchema>;

/**
 * One deterministic-or-cited-fact backing a finding or recommendation.
 * Every recommendation the SEO Agent returns must reference at least one
 * evidence id from this catalog — see SeoAgent.run()'s post-hoc
 * evidence-ref validation. `type` records where the fact came from so a
 * reviewer (or a future audit) can tell "the page actually says this"
 * apart from "the client told us this" apart from "this is just a fixed
 * SEO rule," per the master spec's traceability requirement.
 */
export const SeoEvidenceTypeSchema = z.enum(['website_evidence', 'client_knowledge', 'deterministic_rule']);
export type SeoEvidenceType = z.infer<typeof SeoEvidenceTypeSchema>;

export const SeoEvidenceSchema = z.object({
  id: z.string(),
  type: SeoEvidenceTypeSchema,
  description: z.string(),
});
export type SeoEvidence = z.infer<typeof SeoEvidenceSchema>;

export const SeoCategoryResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  issues: z.array(SeoIssueSchema),
});
export type SeoCategoryResult = z.infer<typeof SeoCategoryResultSchema>;

export const SeoRecommendationPrioritySchema = z.enum(['high', 'medium', 'low']);
export type SeoRecommendationPriority = z.infer<typeof SeoRecommendationPrioritySchema>;

export const SeoRecommendationSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: SeoRecommendationPrioritySchema,
  /** Ids into the top-level `evidence` catalog. Never an invented id — see SeoAgent.run(). */
  evidenceRefs: z.array(z.string()).min(1),
});
export type SeoRecommendation = z.infer<typeof SeoRecommendationSchema>;

/** The SEO Agent's full structured result — see ARCHITECTURE.md "SEO analysis pipeline." */
export const SeoAuditResultSchema = z.object({
  url: z.string(),
  overallScore: z.number().int().min(0).max(100),
  technical: SeoCategoryResultSchema,
  onPage: SeoCategoryResultSchema,
  localSeo: SeoCategoryResultSchema,
  conversion: SeoCategoryResultSchema,
  keywordOpportunities: z.array(z.string()),
  recommendations: z.array(SeoRecommendationSchema),
  evidence: z.array(SeoEvidenceSchema),
  modelUsed: z.string(),
  providerUsed: z.string(),
  usage: z.object({ inputTokens: z.number().optional(), outputTokens: z.number().optional() }).optional(),
});
export type SeoAuditResult = z.infer<typeof SeoAuditResultSchema>;

/** A persisted audit record — one row per `seo_audit` run, so audits for the same client/URL can be compared over time. */
export const SeoAuditRecordSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  url: z.string(),
  overallScore: z.number().int(),
  result: SeoAuditResultSchema,
  agentVersion: z.string(),
  modelProvider: z.string(),
  modelUsed: z.string(),
  createdAt: z.string().or(z.date()),
});
export type SeoAuditRecord = z.infer<typeof SeoAuditRecordSchema>;

export const CreateSeoAuditRecordInputSchema = z.object({
  clientId: z.string().min(1),
  url: z.string(),
  overallScore: z.number().int(),
  result: SeoAuditResultSchema,
  agentVersion: z.string(),
  modelProvider: z.string(),
  modelUsed: z.string(),
});
export type CreateSeoAuditRecordInput = z.infer<typeof CreateSeoAuditRecordInputSchema>;
