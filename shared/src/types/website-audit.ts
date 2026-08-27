import { z } from 'zod';

/**
 * Shared shapes for the Website Agent's structured output and its
 * persisted record (Phase 7) — the marketing/conversion/UX analogue of
 * seo-audit.ts's SeoAuditResult/SeoAuditRecord. Same layering: an
 * internal, camelCase agent-output type here in `shared`, an LLM-facing
 * snake_case JSON contract in `@citadel/prompts` (prompts/src/website/v1.ts),
 * and a snake_case HTTP response assembled by the API route.
 *
 * The Website Agent answers "how effectively does this website turn
 * visitors into customers?" — distinct from the SEO Agent's "how
 * effectively does this website get FOUND by search?" (see
 * ARCHITECTURE.md "Website Intelligence Agent" for the full "Website vs
 * SEO" reasoning). Where the two genuinely overlap (a clear CTA, a
 * visible phone number, trust signals), the Website Agent reuses the SEO
 * Agent's own deterministic conversion checks rather than re-implementing
 * them — see agents/src/website/checks.ts.
 */

export const WebsiteEvidenceTypeSchema = z.enum(['website_evidence', 'client_knowledge', 'deterministic_rule']);
export type WebsiteEvidenceType = z.infer<typeof WebsiteEvidenceTypeSchema>;

/** One deterministic-or-cited fact backing a strength, issue, or recommendation — the same traceability catalog pattern as SeoEvidence. Every recommendation must cite at least one id from here; an id that isn't in the real catalog is never trusted (see WebsiteAgent.run()). */
export const WebsiteEvidenceSchema = z.object({
  id: z.string(),
  type: WebsiteEvidenceTypeSchema,
  description: z.string(),
});
export type WebsiteEvidence = z.infer<typeof WebsiteEvidenceSchema>;

/** The shape shared by first_impression/conversion/content — a score plus what's working and what isn't, each a short human-readable observation (not raw evidence ids; the id-level traceability lives in the top-level `evidence` catalog). */
export const WebsiteCategoryResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  strengths: z.array(z.string()).default([]),
  issues: z.array(z.string()).default([]),
});
export type WebsiteCategoryResult = z.infer<typeof WebsiteCategoryResultSchema>;

/** customer_journey uses "friction_points" instead of "issues" — the master spec's own naming for this section, since a friction point (e.g. "no clear next step after reading services") is inherently about the path a visitor takes, not a standalone defect. */
export const WebsiteCustomerJourneyResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  frictionPoints: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
});
export type WebsiteCustomerJourneyResult = z.infer<typeof WebsiteCustomerJourneyResultSchema>;

/** brand has no "strengths" list in the master spec's example schema — a brand-consistency check is inherently about flagging mismatches against the client's own stated brand profile, not praising conformance. */
export const WebsiteBrandResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  issues: z.array(z.string()).default([]),
});
export type WebsiteBrandResult = z.infer<typeof WebsiteBrandResultSchema>;

/**
 * Mobile is deliberately NOT a scored category like the others — the
 * fetch infrastructure (agents/src/website/, integrations/websites) never
 * renders the page in a browser, so there is no real evidence to score
 * against. This object exists specifically so the dashboard can show an
 * honest "mobile visual testing was not performed" disclosure rather than
 * omitting the topic entirely or fabricating a score. See the master
 * spec's MOBILE section: "Do not pretend to have visually inspected a
 * mobile layout without evidence."
 */
export const WebsiteMobileDisclosureSchema = z.object({
  tested: z.literal(false),
  note: z.string(),
});
export type WebsiteMobileDisclosure = z.infer<typeof WebsiteMobileDisclosureSchema>;

export const WebsiteRecommendationCategorySchema = z.enum([
  'CONVERSION',
  'CONTENT',
  'UX',
  'BRAND',
  'LOCAL',
  'SEO',
  'TRUST',
  'CUSTOMER_JOURNEY',
]);
export type WebsiteRecommendationCategory = z.infer<typeof WebsiteRecommendationCategorySchema>;

export const WebsiteRecommendationPrioritySchema = z.enum(['high', 'medium', 'low']);
export type WebsiteRecommendationPriority = z.infer<typeof WebsiteRecommendationPrioritySchema>;

/** Qualitative only, per the master spec: "Do not invent quantitative conversion improvements... Instead use qualitative prioritization." Never a fabricated percentage. */
export const WebsiteRecommendationImpactSchema = z.enum(['HIGH IMPACT', 'MEDIUM IMPACT', 'LOW IMPACT']);
export type WebsiteRecommendationImpact = z.infer<typeof WebsiteRecommendationImpactSchema>;

export const WebsiteRecommendationEffortSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type WebsiteRecommendationEffort = z.infer<typeof WebsiteRecommendationEffortSchema>;

export const WebsiteRecommendationSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: WebsiteRecommendationCategorySchema,
  priority: WebsiteRecommendationPrioritySchema,
  impact: WebsiteRecommendationImpactSchema,
  effort: WebsiteRecommendationEffortSchema,
  /** Ids into the top-level `evidence` catalog. Never an invented id — WebsiteAgent.run() drops any ref that doesn't match a real catalog entry, and drops the recommendation entirely if none survive. */
  evidenceRefs: z.array(z.string()).min(1),
});
export type WebsiteRecommendation = z.infer<typeof WebsiteRecommendationSchema>;

/** The Website Agent's full structured result — see ARCHITECTURE.md "Website Intelligence Agent." */
export const WebsiteAuditResultSchema = z.object({
  url: z.string(),
  overallScore: z.number().int().min(0).max(100),
  firstImpression: WebsiteCategoryResultSchema,
  conversion: WebsiteCategoryResultSchema,
  customerJourney: WebsiteCustomerJourneyResultSchema,
  content: WebsiteCategoryResultSchema,
  brand: WebsiteBrandResultSchema,
  mobile: WebsiteMobileDisclosureSchema,
  priorityRecommendations: z.array(WebsiteRecommendationSchema),
  /** Server-derived (not asked of the LLM twice): recommendations with effort LOW, in priorityRecommendations order — see WebsiteAgent.run(). */
  quickWins: z.array(WebsiteRecommendationSchema),
  /** Server-derived: recommendations with impact "HIGH IMPACT", in priorityRecommendations order. */
  highImpactChanges: z.array(WebsiteRecommendationSchema),
  evidence: z.array(WebsiteEvidenceSchema),
  modelUsed: z.string(),
  providerUsed: z.string(),
  usage: z.object({ inputTokens: z.number().optional(), outputTokens: z.number().optional() }).optional(),
});
export type WebsiteAuditResult = z.infer<typeof WebsiteAuditResultSchema>;

/** A persisted audit record — one row per `website_audit` run, so audits for the same client/URL can be compared over time. Never overwritten — see database/prisma/schema.prisma's WebsiteAudit doc comment. */
export const WebsiteAuditRecordSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  url: z.string(),
  overallScore: z.number().int(),
  result: WebsiteAuditResultSchema,
  agentVersion: z.string(),
  modelProvider: z.string(),
  modelUsed: z.string(),
  createdAt: z.string().or(z.date()),
});
export type WebsiteAuditRecord = z.infer<typeof WebsiteAuditRecordSchema>;

export const CreateWebsiteAuditRecordInputSchema = z.object({
  clientId: z.string().min(1),
  url: z.string(),
  overallScore: z.number().int(),
  result: WebsiteAuditResultSchema,
  agentVersion: z.string(),
  modelProvider: z.string(),
  modelUsed: z.string(),
});
export type CreateWebsiteAuditRecordInput = z.infer<typeof CreateWebsiteAuditRecordInputSchema>;
