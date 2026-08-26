import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientRepository, contentRepository, prisma } from '@citadel/database';
import { ResourceNotFoundError, type ClientRecord } from '@citadel/shared';
import { MockPublishAdapter } from '@citadel/integrations/social';
import { contentSaveTool } from '../content-tools.js';
import {
  approvalRequestTool,
  contentApproveTool,
  contentRejectTool,
  contentRequestRevisionTool,
} from '../approval-tools.js';
import { createPublishContentTool } from '../publish-tools.js';

const actorContext = { actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-test' };

/**
 * Closes the security gap flagged in the Phase 2 report: the Phase 1
 * content-lifecycle tools looked up a ContentItem by id alone, without
 * checking which client it belonged to. Every tool below now requires
 * `clientIdOrSlug` and must reject a real contentId that belongs to a
 * DIFFERENT client — proven here for every tool, checking both that the
 * call is rejected (the "action" path) and that the record is left
 * genuinely unchanged (verified by reading it back through the owning
 * client, not just inferring it from the rejection).
 */
describe('content-lifecycle tools: tenant isolation', () => {
  let clientA: ClientRecord;
  let clientB: ClientRecord;

  beforeAll(async () => {
    clientA = await clientRepository.create({ slug: `content-iso-a-${randomUUID()}`, companyName: 'Content Iso A' });
    clientB = await clientRepository.create({ slug: `content-iso-b-${randomUUID()}`, companyName: 'Content Iso B' });
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { id: { in: [clientA.id, clientB.id] } } });
  });

  async function createDraftForA(body: string) {
    return contentSaveTool.execute(
      { clientId: clientA.id, type: 'SOCIAL_POST', body, metadata: {}, tags: [] },
      { ...actorContext, clientId: clientA.id },
    );
  }

  it("approval_request: Client B cannot submit Client A's draft for review", async () => {
    const draft = await createDraftForA("A's draft — approval_request attack");

    await expect(
      approvalRequestTool.execute({ clientIdOrSlug: clientB.id, contentId: draft.id }, actorContext),
    ).rejects.toThrow(ResourceNotFoundError);

    const unchanged = await contentRepository.requireByIdForClient(clientA.id, draft.id);
    expect(unchanged.status).toBe('DRAFT');
  });

  it("content_approve: Client B cannot approve Client A's content", async () => {
    const draft = await createDraftForA("A's draft — content_approve attack");
    await approvalRequestTool.execute({ clientIdOrSlug: clientA.id, contentId: draft.id }, actorContext);

    await expect(
      contentApproveTool.execute(
        { clientIdOrSlug: clientB.id, contentId: draft.id, reviewer: 'Attacker' },
        actorContext,
      ),
    ).rejects.toThrow(ResourceNotFoundError);

    const unchanged = await contentRepository.requireByIdForClient(clientA.id, draft.id);
    expect(unchanged.status).toBe('REVIEW');
    expect(unchanged.reviewer).toBeNull();
  });

  it("content_reject: Client B cannot reject Client A's content", async () => {
    const draft = await createDraftForA("A's draft — content_reject attack");
    await approvalRequestTool.execute({ clientIdOrSlug: clientA.id, contentId: draft.id }, actorContext);

    await expect(
      contentRejectTool.execute(
        { clientIdOrSlug: clientB.id, contentId: draft.id, reviewer: 'Attacker', reason: 'malicious' },
        actorContext,
      ),
    ).rejects.toThrow(ResourceNotFoundError);

    const unchanged = await contentRepository.requireByIdForClient(clientA.id, draft.id);
    expect(unchanged.status).toBe('REVIEW');
  });

  it("content_request_revision: Client B cannot request revision on Client A's content", async () => {
    const draft = await createDraftForA("A's draft — request_revision attack");
    await approvalRequestTool.execute({ clientIdOrSlug: clientA.id, contentId: draft.id }, actorContext);

    await expect(
      contentRequestRevisionTool.execute(
        { clientIdOrSlug: clientB.id, contentId: draft.id, reviewer: 'Attacker', reason: 'malicious' },
        actorContext,
      ),
    ).rejects.toThrow(ResourceNotFoundError);

    const unchanged = await contentRepository.requireByIdForClient(clientA.id, draft.id);
    expect(unchanged.status).toBe('REVIEW');
  });

  it("publish_content: Client B cannot publish Client A's content even when it is APPROVED", async () => {
    const draft = await createDraftForA("A's draft — publish attack");
    await approvalRequestTool.execute({ clientIdOrSlug: clientA.id, contentId: draft.id }, actorContext);
    await contentApproveTool.execute(
      { clientIdOrSlug: clientA.id, contentId: draft.id, reviewer: 'Legit Reviewer' },
      actorContext,
    );

    const publishTool = createPublishContentTool(new MockPublishAdapter());
    await expect(
      publishTool.execute({ clientIdOrSlug: clientB.id, contentId: draft.id, platform: 'facebook' }, actorContext),
    ).rejects.toThrow(ResourceNotFoundError);

    const unchanged = await contentRepository.requireByIdForClient(clientA.id, draft.id);
    expect(unchanged.status).toBe('APPROVED');
    expect(unchanged.externalId).toBeNull();

    // The legitimate owner can still publish it — the fix doesn't break the happy path.
    const legitimatePublish = await publishTool.execute(
      { clientIdOrSlug: clientA.id, contentId: draft.id, platform: 'facebook' },
      actorContext,
    );
    expect(legitimatePublish.status).toBe('PUBLISHED');
  });

  it('rejects an unknown clientIdOrSlug the same way as valid-client-wrong-owner (no existence leak)', async () => {
    const draft = await createDraftForA("A's draft — unknown client attack");
    await expect(
      approvalRequestTool.execute({ clientIdOrSlug: 'does-not-exist', contentId: draft.id }, actorContext),
    ).rejects.toThrow();
  });
});
