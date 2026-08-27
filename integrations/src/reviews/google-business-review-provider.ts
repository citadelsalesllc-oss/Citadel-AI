import { NotConfiguredError } from '@citadel/shared';
import type { ExternalReviewData, ListReviewsParams, ReviewProvider } from './types.js';

/**
 * Real Google Business Profile review-ingestion adapter — NOT YET
 * IMPLEMENTED. This is a clean seam for the future integration described
 * in the master spec: it exists so `createReviewProvider()` has a real
 * class to switch to once OAuth + the Business Profile API are wired up,
 * without any change to ReviewProvider's contract or to any code that
 * consumes it (review_sync tool, Review Agent, etc.). It intentionally
 * refuses to run rather than silently falling back to mock data, so
 * nothing can be mistaken for a real Google integration — see
 * ARCHITECTURE.md "Review Intelligence pipeline" for the full mapping
 * this class will implement.
 */
export class GoogleBusinessReviewProvider implements ReviewProvider {
  readonly name = 'google_business';
  readonly source = 'GOOGLE_BUSINESS' as const;

  constructor(private readonly credentials: { accessToken?: string; locationId?: string } = {}) {}

  async listReviews(_params: ListReviewsParams): Promise<ExternalReviewData[]> {
    this.assertConfigured();
    throw new NotConfiguredError('Google Business Profile review integration (OAuth + API call not implemented yet)');
  }

  async getReview(_externalId: string, _params: ListReviewsParams): Promise<ExternalReviewData | null> {
    this.assertConfigured();
    throw new NotConfiguredError('Google Business Profile review integration (OAuth + API call not implemented yet)');
  }

  private assertConfigured(): void {
    if (!this.credentials.accessToken || !this.credentials.locationId) {
      throw new NotConfiguredError('Google Business Profile review integration');
    }
  }
}
