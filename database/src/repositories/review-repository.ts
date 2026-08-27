import {
  InvalidLifecycleTransitionError,
  ResourceNotFoundError,
  type CreateReviewInput,
  type Review,
  type ReviewResponseStatus,
  type ReviewResponseVersion,
  type SaveReviewResponseInput,
} from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toReview, toReviewResponseVersion } from '../mappers.js';

/**
 * Allowed review response-status transitions. Only UNRESPONDED/
 * REVISION_REQUIRED -> DRAFT/REVISION_REQUIRED is actually reachable
 * through Phase 5's tools (saveResponse, below) — the rest of the table
 * exists so a future approve/reject/publish workflow (out of scope for
 * this phase's API surface, see AGENTS.md) can be added without a schema
 * or guard redesign, the same "define the whole state machine, wire up
 * only what's needed now" approach used for ContentItem in Phase 1.
 */
const ALLOWED_TRANSITIONS: Record<ReviewResponseStatus, ReviewResponseStatus[]> = {
  UNRESPONDED: ['DRAFT', 'REVISION_REQUIRED'],
  // Self-transitions (DRAFT->DRAFT, REVISION_REQUIRED->REVISION_REQUIRED)
  // are deliberate, not an oversight: regenerating a response while one is
  // already saved ("redraft this") is a normal part of the human-review
  // loop, and each regeneration still appends its own
  // ReviewResponseVersion row — see saveResponse.
  REVISION_REQUIRED: ['DRAFT', 'REVISION_REQUIRED'],
  DRAFT: ['DRAFT', 'REVISION_REQUIRED', 'APPROVED', 'REJECTED'],
  APPROVED: ['PUBLISHED'],
  PUBLISHED: [],
  REJECTED: [],
};

function assertTransition(from: ReviewResponseStatus, to: ReviewResponseStatus): void {
  const allowed: ReviewResponseStatus[] = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidLifecycleTransitionError(from, to);
  }
}

/**
 * Tenant-isolation enforcement point for reviews: scoped by (id, clientId)
 * together, exactly like every other client-scoped repository — see
 * service-repository.ts for the canonical pattern and why "unknown id"
 * and "someone else's review" must raise the identical error.
 */
async function requireOwnedReview(clientId: string, id: string) {
  const row = await prisma.review.findFirst({ where: { id, clientId } });
  if (!row) {
    throw new ResourceNotFoundError('Review', id);
  }
  return row;
}

export const reviewRepository = {
  /**
   * Idempotent ingestion from a ReviewProvider: the same external review
   * synced twice updates the existing row (in case the provider's copy
   * changed) rather than duplicating it, keyed on the
   * (clientId, source, externalId) unique constraint.
   */
  async upsertFromExternal(clientId: string, input: CreateReviewInput): Promise<Review> {
    const row = await prisma.review.upsert({
      where: { clientId_source_externalId: { clientId, source: input.source, externalId: input.externalId } },
      create: {
        clientId,
        externalId: input.externalId,
        source: input.source,
        reviewerName: input.reviewerName ?? null,
        rating: input.rating,
        reviewText: input.reviewText,
        reviewDate: new Date(input.reviewDate),
      },
      update: {
        reviewerName: input.reviewerName ?? null,
        rating: input.rating,
        reviewText: input.reviewText,
        reviewDate: new Date(input.reviewDate),
      },
    });
    return toReview(row);
  },

  async listByClient(clientId: string, status?: ReviewResponseStatus): Promise<Review[]> {
    const rows = await prisma.review.findMany({
      where: status ? { clientId, responseStatus: status } : { clientId },
      orderBy: { reviewDate: 'desc' },
    });
    return rows.map(toReview);
  },

  async requireByIdForClient(clientId: string, id: string): Promise<Review> {
    const row = await requireOwnedReview(clientId, id);
    return toReview(row);
  },

  /**
   * Saves a generated (or regenerated) response: transitions
   * responseStatus, updates the review's current response fields, AND
   * appends a ReviewResponseVersion row — the append-only history that
   * makes "do not overwrite historical versions" a real guarantee rather
   * than convention.
   */
  async saveResponse(clientId: string, id: string, input: SaveReviewResponseInput): Promise<Review> {
    const existing = await requireOwnedReview(clientId, id);
    assertTransition(existing.responseStatus, input.status);

    const [row] = await prisma.$transaction([
      prisma.review.update({
        where: { id },
        data: {
          responseStatus: input.status,
          responseText: input.responseText,
          responseDate: new Date(),
        },
      }),
      prisma.reviewResponseVersion.create({
        data: {
          reviewId: id,
          responseText: input.responseText,
          tone: input.tone ?? null,
          cta: input.cta ?? null,
          qaPassed: input.qaPassed,
          qaIssues: input.qaIssues as never,
          createdBy: input.createdBy,
        },
      }),
    ]);
    return toReview(row);
  },

  async listResponseVersions(clientId: string, reviewId: string): Promise<ReviewResponseVersion[]> {
    await requireOwnedReview(clientId, reviewId);
    const rows = await prisma.reviewResponseVersion.findMany({
      where: { reviewId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toReviewResponseVersion);
  },
};
