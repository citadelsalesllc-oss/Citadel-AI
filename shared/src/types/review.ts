import { z } from 'zod';

/**
 * The Phase 5 review data model. A `Review` is ingested from a
 * `ReviewProvider` (mock/manual today, Google Business Profile later — see
 * ARCHITECTURE.md "Review Intelligence pipeline") and stored here so the
 * Review Agent always operates on a persisted, tenant-scoped record
 * rather than a live per-request external call. Deliberately minimal
 * personal data: `reviewerName` is the only PII field, and only when the
 * source actually provides one — never invented.
 */

export const ReviewSourceSchema = z.enum(['GOOGLE_BUSINESS', 'MOCK', 'MANUAL']);
export type ReviewSource = z.infer<typeof ReviewSourceSchema>;

export const ReviewResponseStatusSchema = z.enum([
  'UNRESPONDED',
  'DRAFT',
  'APPROVED',
  'PUBLISHED',
  'REJECTED',
  'REVISION_REQUIRED',
]);
export type ReviewResponseStatus = z.infer<typeof ReviewResponseStatusSchema>;

export const ReviewSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  externalId: z.string(),
  source: ReviewSourceSchema,
  reviewerName: z.string().nullable().default(null),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string(),
  reviewDate: z.string().or(z.date()),
  responseStatus: ReviewResponseStatusSchema.default('UNRESPONDED'),
  responseText: z.string().nullable().default(null),
  responseDate: z.string().or(z.date()).nullable().default(null),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Review = z.infer<typeof ReviewSchema>;

/** What a ReviewProvider hands back for one review, before it's persisted — see integrations/src/reviews/review-provider.ts. */
export const CreateReviewInputSchema = z.object({
  externalId: z.string().min(1),
  source: ReviewSourceSchema,
  reviewerName: z.string().nullable().optional(),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string(),
  reviewDate: z.string().or(z.date()),
});
export type CreateReviewInput = z.infer<typeof CreateReviewInputSchema>;

/** One saved response draft, ever — see the Prisma schema's ReviewResponseVersion doc comment for why history is append-only. */
export const ReviewResponseVersionSchema = z.object({
  id: z.string(),
  reviewId: z.string(),
  responseText: z.string(),
  tone: z.string().nullable().default(null),
  cta: z.string().nullable().default(null),
  qaPassed: z.boolean(),
  qaIssues: z.array(z.unknown()).default([]),
  createdBy: z.string(),
  createdAt: z.string().or(z.date()),
});
export type ReviewResponseVersion = z.infer<typeof ReviewResponseVersionSchema>;

// ---------------------------------------------------------------------------
// Review analysis — the deterministic engine's structured output (see
// agents/src/reviews/checks.ts). Defined here, not in `agents`, because
// prompts/src/reviews/v1.ts (which sits BELOW agents in the dependency
// graph) also needs this shape to build the response-generation prompt —
// the same reason WebsiteFetchResult lives in shared rather than
// integrations (see website-fetch.ts).
// ---------------------------------------------------------------------------

export const ReviewClassificationSchema = z.enum(['positive', 'negative', 'neutral', 'mixed']);
export type ReviewClassification = z.infer<typeof ReviewClassificationSchema>;

export const ReviewEvidenceTypeSchema = z.enum(['review_text', 'client_knowledge', 'deterministic_rule']);
export type ReviewEvidenceType = z.infer<typeof ReviewEvidenceTypeSchema>;

export const ReviewEvidenceSchema = z.object({
  id: z.string(),
  type: ReviewEvidenceTypeSchema,
  description: z.string(),
});
export type ReviewEvidence = z.infer<typeof ReviewEvidenceSchema>;

/**
 * The Review Agent's `review_analyze` output — fully deterministic, no
 * model call (see agents/src/reviews/checks.ts). `classification` is
 * coarse (positive/negative/neutral/mixed) rather than a numeric score:
 * the underlying method (rating + keyword-presence signals) does not
 * support claiming a precise sentiment score, so this never fabricates
 * false precision.
 */
export const ReviewAnalysisResultSchema = z.object({
  rating: z.number().int().min(1).max(5),
  classification: ReviewClassificationSchema,
  positivePoints: z.array(z.string()),
  negativePoints: z.array(z.string()),
  mentionedServices: z.array(z.string()),
  mentionedLocations: z.array(z.string()),
  concerns: z.array(z.string()),
  escalationNeeded: z.boolean(),
  evidence: z.array(ReviewEvidenceSchema),
});
export type ReviewAnalysisResult = z.infer<typeof ReviewAnalysisResultSchema>;

export const SaveReviewResponseInputSchema = z.object({
  responseText: z.string().min(1),
  tone: z.string().nullable().optional(),
  cta: z.string().nullable().optional(),
  qaPassed: z.boolean(),
  qaIssues: z.array(z.unknown()).default([]),
  createdBy: z.string().min(1),
  /** DRAFT when Brand QA passed, REVISION_REQUIRED when it didn't — mirrors content_save's initialStatus. */
  status: z.enum(['DRAFT', 'REVISION_REQUIRED']),
});
export type SaveReviewResponseInput = z.infer<typeof SaveReviewResponseInputSchema>;
