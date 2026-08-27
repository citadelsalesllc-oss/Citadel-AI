import {
  InvalidLifecycleTransitionError,
  ResourceNotFoundError,
  type ContentItem,
  type ContentStatus,
  type CreateContentItemInput,
} from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toContentItem } from '../mappers.js';

/**
 * Allowed content lifecycle transitions. DRAFT -> REVIEW -> APPROVED ->
 * PUBLISHED is the happy path; REJECTED/REVISION_REQUIRED/FAILED are exits.
 * External publishing is only reachable from APPROVED — this is the
 * approval-gate enforcement point for the whole platform.
 */
const ALLOWED_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  DRAFT: ['REVIEW'],
  REVISION_REQUIRED: ['REVIEW'],
  REVIEW: ['APPROVED', 'REJECTED', 'REVISION_REQUIRED'],
  APPROVED: ['PUBLISHED', 'FAILED'],
  PUBLISHED: [],
  REJECTED: [],
  FAILED: [],
};

function assertTransition(from: ContentStatus, to: ContentStatus): void {
  const allowed: ContentStatus[] = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidLifecycleTransitionError(from, to);
  }
}

/**
 * Tenant-isolation enforcement point for content items: scoped by
 * (id, clientId) together, exactly like every Phase 2 child-record
 * repository (see service-repository.ts). A content id that's valid but
 * belongs to a DIFFERENT client raises the same ResourceNotFoundError as
 * an id that doesn't exist at all — a caller can never tell "wrong id"
 * apart from "someone else's content," which is itself information a
 * cross-tenant caller must not get. A plain top-level function (not a
 * `this.`-dependent method) so it behaves the same regardless of how
 * `contentRepository`'s methods are invoked or destructured.
 */
async function requireOwnedContentItem(clientId: string, id: string) {
  const row = await prisma.contentItem.findFirst({ where: { id, clientId } });
  if (!row) {
    throw new ResourceNotFoundError('ContentItem', id);
  }
  return row;
}

export const contentRepository = {
  async create(input: CreateContentItemInput): Promise<ContentItem> {
    const row = await prisma.contentItem.create({
      data: {
        clientId: input.clientId,
        type: input.type,
        status: input.initialStatus,
        platform: input.platform,
        title: input.title,
        body: input.body,
        campaign: input.campaign,
        tags: input.tags,
        metadata: input.metadata as never,
        createdBy: input.createdBy,
      },
    });
    return toContentItem(row);
  },

  async listByClient(clientId: string): Promise<ContentItem[]> {
    const rows = await prisma.contentItem.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toContentItem);
  },

  /**
   * The only sanctioned way to read a single content item. There is
   * deliberately no unscoped findById any more — every code path that used
   * to bypass tenant scoping (publish_content, the GET /content/:id route)
   * now goes through here.
   */
  async requireByIdForClient(clientId: string, id: string): Promise<ContentItem> {
    const row = await requireOwnedContentItem(clientId, id);
    return toContentItem(row);
  },

  async transition(
    clientId: string,
    id: string,
    to: ContentStatus,
    extra: Partial<{
      reviewer: string;
      approvedAt: Date;
      publishedAt: Date;
      externalId: string;
      rejectionReason: string;
      metadata: Record<string, unknown>;
    }> = {},
  ): Promise<ContentItem> {
    // Ownership check happens BEFORE the transition — same
    // ResourceNotFoundError whether the id is unknown or belongs to
    // another client, so this can never be used to probe for another
    // client's content by id.
    const existing = await requireOwnedContentItem(clientId, id);
    assertTransition(existing.status, to);
    const row = await prisma.contentItem.update({
      where: { id },
      data: {
        status: to,
        reviewer: extra.reviewer,
        approvedAt: extra.approvedAt,
        publishedAt: extra.publishedAt,
        externalId: extra.externalId,
        rejectionReason: extra.rejectionReason,
        metadata: extra.metadata as never,
      },
    });
    return toContentItem(row);
  },
};
