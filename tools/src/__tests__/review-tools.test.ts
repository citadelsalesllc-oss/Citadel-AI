import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientRepository, prisma, reviewRepository } from '@citadel/database';
import { ResourceNotFoundError, type ClientRecord } from '@citadel/shared';
import { MockReviewProvider } from '@citadel/integrations/reviews';
import { createReviewSyncTool, reviewLookupTool, reviewGetTool, reviewResponseSaveTool } from '../review-tools.js';

const actorContext = { actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-test' };

const FIXTURE_REVIEWS = [
  { externalId: 'r1', reviewerName: 'A.B.', rating: 5, reviewText: 'Excellent, professional service.', reviewDate: new Date('2026-01-01') },
  { externalId: 'r2', reviewerName: null, rating: 2, reviewText: 'Overcharged and slow.', reviewDate: new Date('2026-01-02') },
  { externalId: 'r3', reviewerName: 'C.D.', rating: 4, reviewText: 'Good overall experience.', reviewDate: new Date('2026-01-03') },
  { externalId: 'r4', reviewerName: 'E.F.', rating: 3, reviewText: 'It was fine.', reviewDate: new Date('2026-01-04') },
];

async function reviewByExternalId(clientId: string, externalId: string) {
  const reviews = await reviewRepository.listByClient(clientId);
  const match = reviews.find((r) => r.externalId === externalId);
  if (!match) throw new Error(`fixture review ${externalId} not found for client ${clientId}`);
  return match;
}

describe('review tools', () => {
  let clientA: ClientRecord;
  let clientB: ClientRecord;

  beforeAll(async () => {
    clientA = await clientRepository.create({ slug: `review-tools-a-${randomUUID()}`, companyName: 'Review Tools A' });
    clientB = await clientRepository.create({ slug: `review-tools-b-${randomUUID()}`, companyName: 'Review Tools B' });
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { id: { in: [clientA.id, clientB.id] } } });
  });

  it('review_sync ingests reviews from the provider', async () => {
    const syncTool = createReviewSyncTool(new MockReviewProvider(FIXTURE_REVIEWS));
    const synced = await syncTool.execute({ clientId: clientA.id }, { ...actorContext, clientId: clientA.id });
    expect(synced).toHaveLength(FIXTURE_REVIEWS.length);
    expect(synced.every((r) => r.responseStatus === 'UNRESPONDED')).toBe(true);
  });

  it('review_sync is idempotent — re-syncing does not duplicate rows', async () => {
    const syncTool = createReviewSyncTool(new MockReviewProvider(FIXTURE_REVIEWS));
    await syncTool.execute({ clientId: clientA.id }, { ...actorContext, clientId: clientA.id });
    await syncTool.execute({ clientId: clientA.id }, { ...actorContext, clientId: clientA.id });
    const all = await reviewRepository.listByClient(clientA.id);
    expect(all).toHaveLength(FIXTURE_REVIEWS.length);
  });

  it('review_lookup lists synced reviews for the client', async () => {
    const results = await reviewLookupTool.execute({ clientId: clientA.id }, actorContext);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((r) => r.clientId === clientA.id)).toBe(true);
  });

  it('review_lookup filters by response status', async () => {
    const results = await reviewLookupTool.execute({ clientId: clientA.id, status: 'UNRESPONDED' }, actorContext);
    expect(results.every((r) => r.responseStatus === 'UNRESPONDED')).toBe(true);
  });

  it('review_get fetches a single review scoped to the client', async () => {
    const [review] = await reviewLookupTool.execute({ clientId: clientA.id }, actorContext);
    const fetched = await reviewGetTool.execute({ clientId: clientA.id, reviewId: review!.id }, actorContext);
    expect(fetched.id).toBe(review!.id);
  });

  it('review_get throws ResourceNotFoundError for an unknown review id', async () => {
    await expect(reviewGetTool.execute({ clientId: clientA.id, reviewId: 'does-not-exist' }, actorContext)).rejects.toThrow(
      ResourceNotFoundError,
    );
  });

  it("review_get throws ResourceNotFoundError when Client B requests Client A's review (tenant isolation)", async () => {
    const [review] = await reviewLookupTool.execute({ clientId: clientA.id }, actorContext);
    await expect(reviewGetTool.execute({ clientId: clientB.id, reviewId: review!.id }, actorContext)).rejects.toThrow(
      ResourceNotFoundError,
    );
  });

  it("review_lookup for Client B never returns Client A's reviews", async () => {
    const results = await reviewLookupTool.execute({ clientId: clientB.id }, actorContext);
    expect(results).toEqual([]);
  });

  it('review_response_save transitions UNRESPONDED -> DRAFT and records a response version', async () => {
    const review = await reviewByExternalId(clientA.id, 'r1');
    const saved = await reviewResponseSaveTool.execute(
      {
        clientId: clientA.id,
        reviewId: review.id,
        response: { responseText: 'Thank you!', tone: 'warm', cta: null, qaPassed: true, qaIssues: [], createdBy: 'Test Actor', status: 'DRAFT', source: 'AI_GENERATED' },
      },
      actorContext,
    );
    expect(saved.responseStatus).toBe('DRAFT');
    expect(saved.responseText).toBe('Thank you!');

    const versions = await reviewRepository.listResponseVersions(clientA.id, review.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.qaPassed).toBe(true);
  });

  it('review_response_save transitions to REVISION_REQUIRED when QA failed, and never overwrites prior versions on a second save', async () => {
    const review = await reviewByExternalId(clientA.id, 'r2');
    await reviewResponseSaveTool.execute(
      {
        clientId: clientA.id,
        reviewId: review.id,
        response: { responseText: 'First draft.', tone: 'neutral', cta: null, qaPassed: false, qaIssues: [{ code: 'X' }], createdBy: 'Test Actor', status: 'REVISION_REQUIRED', source: 'AI_GENERATED' },
      },
      actorContext,
    );
    const second = await reviewResponseSaveTool.execute(
      {
        clientId: clientA.id,
        reviewId: review.id,
        response: { responseText: 'Revised draft.', tone: 'neutral', cta: null, qaPassed: true, qaIssues: [], createdBy: 'Test Actor', status: 'DRAFT', source: 'AI_GENERATED' },
      },
      actorContext,
    );
    expect(second.responseStatus).toBe('DRAFT');
    expect(second.responseText).toBe('Revised draft.');

    const versions = await reviewRepository.listResponseVersions(clientA.id, review.id);
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.responseText)).toEqual(expect.arrayContaining(['First draft.', 'Revised draft.']));
  });

  it("Client B cannot save a response onto Client A's review", async () => {
    const review = await reviewByExternalId(clientA.id, 'r3');
    await expect(
      reviewResponseSaveTool.execute(
        {
          clientId: clientB.id,
          reviewId: review.id,
          response: { responseText: 'Attack.', tone: 'x', cta: null, qaPassed: true, qaIssues: [], createdBy: 'Attacker', status: 'DRAFT', source: 'AI_GENERATED' },
        },
        actorContext,
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });
});
