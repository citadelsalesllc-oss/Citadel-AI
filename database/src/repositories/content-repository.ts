import {
  InvalidLifecycleTransitionError,
  ResourceNotFoundError,
  type ContentItem,
  type ContentStatus,
  type ContentVersion,
  type CreateContentItemInput,
  type EditContentInput,
} from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toContentItem, toContentVersion } from '../mappers.js';

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
  /**
   * Creates the ContentItem and its first ContentVersion (source
   * AI_GENERATED) atomically — every content item has a version history
   * from the moment it exists, so the Command Center dashboard (Phase 6)
   * never has to special-case "no versions yet."
   */
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
        versions: {
          create: {
            body: input.body,
            metadata: input.metadata as never,
            source: 'AI_GENERATED',
            editedBy: input.createdBy,
          },
        },
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
   * The only sanctioned way for a tenant-scoped caller (an agent tool, a
   * client-facing route) to read a single content item. There is
   * deliberately no unscoped equivalent for that kind of caller — every
   * code path that used to bypass tenant scoping (publish_content, the GET
   * /content/:id route) now goes through here. The Command Center
   * dashboard is the one deliberate exception; see requireByIdGlobal below.
   */
  async requireByIdForClient(clientId: string, id: string): Promise<ContentItem> {
    const row = await requireOwnedContentItem(clientId, id);
    return toContentItem(row);
  },

  /**
   * Records a human edit as a NEW version — the AI-generated body (and
   * every prior edit) stays in ContentVersion untouched. Does not change
   * `status`: an edit is "the draft looks different now," not an approval
   * decision, so the Command Center dashboard (Phase 6) drives status
   * separately via the existing approval tools.
   */
  async editContent(clientId: string, id: string, input: EditContentInput): Promise<ContentItem> {
    await requireOwnedContentItem(clientId, id);
    const row = await prisma.contentItem.update({
      where: { id },
      data: {
        body: input.body,
        versions: {
          create: {
            body: input.body,
            metadata: {},
            source: 'HUMAN_EDIT',
            editedBy: input.editedBy,
          },
        },
      },
    });
    return toContentItem(row);
  },

  /** Full version history, newest first — tenant-scoped like every other read here. */
  async listVersions(clientId: string, id: string): Promise<ContentVersion[]> {
    await requireOwnedContentItem(clientId, id);
    const rows = await prisma.contentVersion.findMany({
      where: { contentItemId: id },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toContentVersion);
  },

  /**
   * DASHBOARD-ONLY. Deliberately unscoped: the Command Center is an
   * internal staff tool that must show content across every client, so
   * "which clients can see this" tenant isolation does not apply the same
   * way it does to an agent Tool or a client-facing route. Never expose
   * this as an agent-callable Tool, and never let a dashboard WRITE action
   * take a caller-supplied clientId — every write below still derives
   * clientId from the fetched record via requireOwnedContentItem /
   * requireByIdGlobal, never from the caller.
   */
  async listAllForDashboard(options: { statuses?: ContentStatus[]; limit?: number } = {}): Promise<ContentItem[]> {
    const rows = await prisma.contentItem.findMany({
      where: options.statuses ? { status: { in: options.statuses } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: options.limit,
    });
    return rows.map(toContentItem);
  },

  /** DASHBOARD-ONLY. See listAllForDashboard's doc comment for the tenant-isolation exception this represents. */
  async requireByIdGlobal(id: string): Promise<ContentItem> {
    const row = await prisma.contentItem.findUnique({ where: { id } });
    if (!row) {
      throw new ResourceNotFoundError('ContentItem', id);
    }
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
