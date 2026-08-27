import type { ExternalReviewData, ListReviewsParams, ReviewProvider } from './types.js';
import { CDA_SEPTIC_SYSTEMS_MOCK_REVIEWS } from './fixtures.js';

/**
 * Deterministic, dependency-free ReviewProvider for local development and
 * automated tests — the review-ingestion analogue of MockModelProvider.
 * Returns fixture data (see fixtures.ts — clearly marked test/development
 * only) instead of calling any external review platform. Used
 * automatically until a real provider (Google Business Profile) is
 * configured — see factory.ts.
 */
export class MockReviewProvider implements ReviewProvider {
  readonly name = 'mock';
  readonly source = 'MOCK' as const;

  constructor(private readonly reviews: ExternalReviewData[] = CDA_SEPTIC_SYSTEMS_MOCK_REVIEWS) {}

  async listReviews(_params: ListReviewsParams): Promise<ExternalReviewData[]> {
    return this.reviews;
  }

  async getReview(externalId: string, _params: ListReviewsParams): Promise<ExternalReviewData | null> {
    return this.reviews.find((r) => r.externalId === externalId) ?? null;
  }
}
