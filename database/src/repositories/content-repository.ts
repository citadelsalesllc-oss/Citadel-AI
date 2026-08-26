import {
  InvalidLifecycleTransitionError,
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

export const contentRepository = {
  async create(input: CreateContentItemInput): Promise<ContentItem> {
    const row = await prisma.contentItem.create({
      data: {
        clientId: input.clientId,
        type: input.type,
        status: 'DRAFT',
        body: input.body,
        metadata: input.metadata as never,
        createdBy: input.createdBy,
      },
    });
    return toContentItem(row);
  },

  async findById(id: string): Promise<ContentItem | null> {
    const row = await prisma.contentItem.findUnique({ where: { id } });
    return row ? toContentItem(row) : null;
  },

  async listByClient(clientId: string): Promise<ContentItem[]> {
    const rows = await prisma.contentItem.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toContentItem);
  },

  async transition(
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
    const existing = await prisma.contentItem.findUniqueOrThrow({ where: { id } });
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
