import { z } from 'zod';
import { reviewRepository, auditRepository } from '@citadel/database';
import type { ReviewProvider } from '@citadel/integrations/reviews';
import { ReviewResponseStatusSchema, SaveReviewResponseInputSchema, type Review, type Tool, type ToolContext } from '@citadel/shared';

const ReviewSyncInputSchema = z.object({
  clientId: z.string().min(1),
  externalAccountRef: z.string().optional(),
});
type ReviewSyncInput = z.infer<typeof ReviewSyncInputSchema>;

/**
 * Pulls reviews from the injected ReviewProvider and upserts each into the
 * client's persisted Review rows. This is the one place a live external
 * review platform would actually be called — everything downstream
 * (review_lookup, review_get, the Review Agent) only ever reads the
 * already-synced, tenant-scoped database rows, never the provider live.
 * Idempotent: re-syncing updates existing rows by (clientId, source,
 * externalId) rather than duplicating them.
 */
export function createReviewSyncTool(provider: ReviewProvider): Tool<ReviewSyncInput, Review[]> {
  return {
    name: 'review_sync',
    description: "Sync a client's reviews from the configured review provider into the database.",
    inputSchema: ReviewSyncInputSchema,
    async execute(input, context: ToolContext) {
      const externalReviews = await provider.listReviews({ externalAccountRef: input.externalAccountRef });
      const synced: Review[] = [];
      for (const external of externalReviews) {
        const review = await reviewRepository.upsertFromExternal(input.clientId, {
          externalId: external.externalId,
          source: provider.source,
          reviewerName: external.reviewerName,
          rating: external.rating,
          reviewText: external.reviewText,
          reviewDate: external.reviewDate,
        });
        synced.push(review);
      }
      await auditRepository.record({
        clientId: input.clientId,
        actor: context.actor.label,
        action: 'review_sync',
        targetType: 'Review',
        targetId: null,
        metadata: { provider: provider.name, count: synced.length },
      });
      return synced;
    },
  };
}

const ReviewLookupInputSchema = z.object({
  clientId: z.string().min(1),
  status: ReviewResponseStatusSchema.optional(),
});
type ReviewLookupInput = z.infer<typeof ReviewLookupInputSchema>;

export const reviewLookupTool: Tool<ReviewLookupInput, Review[]> = {
  name: 'review_lookup',
  description: "List a client's previously synced reviews, optionally filtered by response status.",
  inputSchema: ReviewLookupInputSchema,
  async execute(input) {
    return reviewRepository.listByClient(input.clientId, input.status);
  },
};

const ReviewGetInputSchema = z.object({
  clientId: z.string().min(1),
  reviewId: z.string().min(1),
});
type ReviewGetInput = z.infer<typeof ReviewGetInputSchema>;

/** Tenant-isolated single-review fetch — the same ResourceNotFoundError whether reviewId is unknown or belongs to a different client. */
export const reviewGetTool: Tool<ReviewGetInput, Review> = {
  name: 'review_get',
  description: 'Fetch a single review by id, scoped to the given client.',
  inputSchema: ReviewGetInputSchema,
  async execute(input) {
    return reviewRepository.requireByIdForClient(input.clientId, input.reviewId);
  },
};

const ReviewResponseSaveInputSchema = z.object({
  clientId: z.string().min(1),
  reviewId: z.string().min(1),
  response: SaveReviewResponseInputSchema,
});
type ReviewResponseSaveInput = z.infer<typeof ReviewResponseSaveInputSchema>;

/** Saves a generated response as DRAFT (QA passed) or REVISION_REQUIRED (QA failed) and appends a ReviewResponseVersion — never overwrites prior response history. */
export const reviewResponseSaveTool: Tool<ReviewResponseSaveInput, Review> = {
  name: 'review_response_save',
  description: "Save a generated response draft for a review, and record it in the review's response history.",
  inputSchema: ReviewResponseSaveInputSchema,
  async execute(input, context: ToolContext) {
    const review = await reviewRepository.saveResponse(input.clientId, input.reviewId, input.response);
    await auditRepository.record({
      clientId: input.clientId,
      actor: context.actor.label,
      action: 'review_response_save',
      targetType: 'Review',
      targetId: input.reviewId,
      metadata: { status: review.responseStatus, qaPassed: input.response.qaPassed },
    });
    return review;
  },
};

// ---------------------------------------------------------------------------
// Review-response approval (Phase 6) — the review-response equivalent of
// approval-tools.ts's contentApproveTool/contentRejectTool/
// contentRequestRevisionTool. Status-only transitions via
// reviewRepository.transitionStatus(), each recording an audit entry so
// "record reviewer, record timestamp, create an audit record" holds for
// review responses exactly as it does for content.
// ---------------------------------------------------------------------------

const ReviewApprovalInputSchema = z.object({
  clientId: z.string().min(1),
  reviewId: z.string().min(1),
  reviewer: z.string().min(1),
});
type ReviewApprovalInput = z.infer<typeof ReviewApprovalInputSchema>;

export const reviewApproveTool: Tool<ReviewApprovalInput, Review> = {
  name: 'review_approve',
  description: "Approve a client's review response that is in DRAFT. Does not publish it.",
  inputSchema: ReviewApprovalInputSchema,
  async execute(input, context: ToolContext) {
    const review = await reviewRepository.transitionStatus(input.clientId, input.reviewId, 'APPROVED');
    await auditRepository.record({
      clientId: review.clientId,
      actor: context.actor.label,
      action: 'review_approve',
      targetType: 'Review',
      targetId: review.id,
      metadata: { reviewer: input.reviewer },
    });
    return review;
  },
};

const ReviewRejectInputSchema = ReviewApprovalInputSchema.extend({ reason: z.string().min(1) });
type ReviewRejectInput = z.infer<typeof ReviewRejectInputSchema>;

export const reviewRejectTool: Tool<ReviewRejectInput, Review> = {
  name: 'review_reject',
  description: "Reject a client's review response that is in DRAFT, ending its lifecycle.",
  inputSchema: ReviewRejectInputSchema,
  async execute(input, context: ToolContext) {
    const review = await reviewRepository.transitionStatus(input.clientId, input.reviewId, 'REJECTED');
    await auditRepository.record({
      clientId: review.clientId,
      actor: context.actor.label,
      action: 'review_reject',
      targetType: 'Review',
      targetId: review.id,
      metadata: { reviewer: input.reviewer, reason: input.reason },
    });
    return review;
  },
};

export const reviewRequestRevisionTool: Tool<ReviewRejectInput, Review> = {
  name: 'review_request_revision',
  description: "Send a client's review response that is in DRAFT back for revision, with feedback.",
  inputSchema: ReviewRejectInputSchema,
  async execute(input, context: ToolContext) {
    const review = await reviewRepository.transitionStatus(input.clientId, input.reviewId, 'REVISION_REQUIRED');
    await auditRepository.record({
      clientId: review.clientId,
      actor: context.actor.label,
      action: 'review_request_revision',
      targetType: 'Review',
      targetId: review.id,
      metadata: { reviewer: input.reviewer, reason: input.reason },
    });
    return review;
  },
};
