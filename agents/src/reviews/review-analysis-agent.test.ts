import { describe, expect, it } from 'vitest';
import type { Review } from '@citadel/shared';
import { makeTestClient } from '../test-fixtures.js';
import { ReviewAnalysisAgent } from './review-analysis-agent.js';

function makeReview(overrides: Partial<Review> = {}): Review {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'review_test_1',
    clientId: 'client_test_1',
    externalId: 'ext-1',
    source: 'MOCK',
    reviewerName: 'T.C.',
    rating: 5,
    reviewText: 'Excellent widget installation, very professional crew.',
    reviewDate: now,
    responseStatus: 'UNRESPONDED',
    responseText: null,
    responseDate: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('ReviewAnalysisAgent', () => {
  it('returns the deterministic analysis for a review', async () => {
    const agent = new ReviewAnalysisAgent();
    const client = makeTestClient();
    const review = makeReview();

    const result = await agent.run({ review }, { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-1' });

    expect(result.rating).toBe(5);
    expect(result.classification).toBe('positive');
    expect(result.mentionedServices).toContain('Widget Installation');
    expect(result.escalationNeeded).toBe(false);
    expect(Array.isArray(result.evidence)).toBe(true);
  });

  it('flags escalation for a serious complaint', async () => {
    const agent = new ReviewAnalysisAgent();
    const client = makeTestClient();
    const review = makeReview({ rating: 1, reviewText: 'I was injured on site and am speaking to a lawyer.' });

    const result = await agent.run({ review }, { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-2' });

    expect(result.escalationNeeded).toBe(true);
  });
});
