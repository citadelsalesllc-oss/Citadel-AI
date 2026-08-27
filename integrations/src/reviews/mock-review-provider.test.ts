import { describe, expect, it } from 'vitest';
import { NotConfiguredError } from '@citadel/shared';
import { MockReviewProvider } from './mock-review-provider.js';
import { GoogleBusinessReviewProvider } from './google-business-review-provider.js';
import { CDA_SEPTIC_SYSTEMS_MOCK_REVIEWS } from './fixtures.js';
import { createReviewProvider } from './factory.js';

describe('MockReviewProvider', () => {
  it('lists all fixture reviews', async () => {
    const provider = new MockReviewProvider();
    const reviews = await provider.listReviews({});
    expect(reviews).toHaveLength(CDA_SEPTIC_SYSTEMS_MOCK_REVIEWS.length);
    expect(reviews[0]?.externalId).toBe('mock-review-1');
  });

  it('gets a single review by external id', async () => {
    const provider = new MockReviewProvider();
    const review = await provider.getReview('mock-review-5', {});
    expect(review).not.toBeNull();
    expect(review?.rating).toBe(1);
  });

  it('returns null for an unknown external id instead of inventing a review', async () => {
    const provider = new MockReviewProvider();
    const review = await provider.getReview('does-not-exist', {});
    expect(review).toBeNull();
  });

  it('fixture set covers every required review category', async () => {
    const provider = new MockReviewProvider();
    const reviews = await provider.listReviews({});
    expect(reviews.some((r) => r.rating === 5)).toBe(true);
    expect(reviews.some((r) => r.rating === 4)).toBe(true);
    expect(reviews.some((r) => r.rating === 3)).toBe(true);
    expect(reviews.some((r) => r.rating === 2)).toBe(true);
    expect(reviews.some((r) => r.rating === 1)).toBe(true);
    expect(reviews.some((r) => /septic/i.test(r.reviewText))).toBe(true);
    expect(reviews.some((r) => /coeur d'alene|hayden/i.test(r.reviewText))).toBe(true);
    expect(reviews.some((r) => r.reviewText.trim().split(/\s+/).length <= 2)).toBe(true);
  });

  it('accepts a custom review set for testing', async () => {
    const custom = [{ externalId: 'custom-1', reviewerName: 'X', rating: 5, reviewText: 'Great!', reviewDate: new Date() }];
    const provider = new MockReviewProvider(custom);
    const reviews = await provider.listReviews({});
    expect(reviews).toEqual(custom);
  });
});

describe('GoogleBusinessReviewProvider', () => {
  it('throws NotConfiguredError when no credentials are supplied — never fakes live Google data', async () => {
    const provider = new GoogleBusinessReviewProvider();
    await expect(provider.listReviews({})).rejects.toThrow(NotConfiguredError);
    await expect(provider.getReview('any', {})).rejects.toThrow(NotConfiguredError);
  });

  it('still refuses to run even with credentials, since the real API call is not implemented yet', async () => {
    const provider = new GoogleBusinessReviewProvider({ accessToken: 'fake', locationId: 'fake-location' });
    await expect(provider.listReviews({})).rejects.toThrow(NotConfiguredError);
  });
});

describe('createReviewProvider', () => {
  it('returns the mock provider by default', () => {
    const provider = createReviewProvider({});
    expect(provider).toBeInstanceOf(MockReviewProvider);
  });

  it('returns the Google Business provider seam when requested', () => {
    const provider = createReviewProvider({ provider: 'google_business' });
    expect(provider).toBeInstanceOf(GoogleBusinessReviewProvider);
  });
});
