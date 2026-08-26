import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientRepository, prisma } from '@citadel/database';
import type { ClientRecord } from '@citadel/shared';
import { MockPublishAdapter } from '@citadel/integrations/social';
import { contentSaveTool } from '../content-tools.js';
import { approvalRequestTool, contentApproveTool, contentRejectTool } from '../approval-tools.js';
import { createPublishContentTool } from '../publish-tools.js';

const actorContext = { actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-test' };

describe('content lifecycle (integration)', () => {
  let client: ClientRecord;

  beforeAll(async () => {
    client = await clientRepository.create({
      slug: `test-lifecycle-${randomUUID()}`,
      companyName: 'Lifecycle Test Co',
    });
  });

  afterAll(async () => {
    await prisma.contentItem.deleteMany({ where: { clientId: client.id } });
    await prisma.auditLog.deleteMany({ where: { clientId: client.id } });
    await prisma.client.delete({ where: { id: client.id } });
  });

  it('walks DRAFT -> REVIEW -> APPROVED -> PUBLISHED', async () => {
    const draft = await contentSaveTool.execute(
      { clientId: client.id, type: 'SOCIAL_POST', body: 'Hello world', metadata: {}, tags: [] },
      { ...actorContext, clientId: client.id },
    );
    expect(draft.status).toBe('DRAFT');

    const inReview = await approvalRequestTool.execute({ contentId: draft.id }, actorContext);
    expect(inReview.status).toBe('REVIEW');

    const approved = await contentApproveTool.execute(
      { contentId: draft.id, reviewer: 'Jane Reviewer' },
      actorContext,
    );
    expect(approved.status).toBe('APPROVED');
    expect(approved.reviewer).toBe('Jane Reviewer');

    const publishTool = createPublishContentTool(new MockPublishAdapter());
    const published = await publishTool.execute({ contentId: draft.id, platform: 'facebook' }, actorContext);
    expect(published.status).toBe('PUBLISHED');
    expect(published.externalId).toMatch(/^mock-facebook-/);
  });

  it('rejects publishing content that has not been approved', async () => {
    const draft = await contentSaveTool.execute(
      { clientId: client.id, type: 'SOCIAL_POST', body: 'Not approved yet', metadata: {}, tags: [] },
      { ...actorContext, clientId: client.id },
    );

    const publishTool = createPublishContentTool(new MockPublishAdapter());
    await expect(publishTool.execute({ contentId: draft.id, platform: 'facebook' }, actorContext)).rejects.toThrow(
      /Cannot transition content from DRAFT to PUBLISHED/,
    );
  });

  it('supports rejecting content in review', async () => {
    const draft = await contentSaveTool.execute(
      { clientId: client.id, type: 'SOCIAL_POST', body: 'Needs review', metadata: {}, tags: [] },
      { ...actorContext, clientId: client.id },
    );
    await approvalRequestTool.execute({ contentId: draft.id }, actorContext);
    const rejected = await contentRejectTool.execute(
      { contentId: draft.id, reviewer: 'Jane Reviewer', reason: 'Off-brand tone' },
      actorContext,
    );
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectionReason).toBe('Off-brand tone');
  });
});
