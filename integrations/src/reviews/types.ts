import type { ReviewSource } from '@citadel/shared';

/** What a ReviewProvider hands back for one review, before Citadel AI persists it as a Review row. */
export interface ExternalReviewData {
  externalId: string;
  reviewerName: string | null;
  rating: number;
  reviewText: string;
  reviewDate: Date;
}

export interface ListReviewsParams {
  /** The client's identifier in the external system (e.g. a Google Business location id). Mock/manual providers ignore this. */
  externalAccountRef?: string;
}

/**
 * Provider-agnostic review-ingestion interface. Tools depend only on this
 * (never a concrete platform SDK), the same "swap the implementation
 * without touching business logic" pattern as ModelProvider and
 * PublishAdapter. See ARCHITECTURE.md "Review Intelligence pipeline" for
 * how a real Google Business Profile adapter will implement this same
 * interface later.
 */
export interface ReviewProvider {
  readonly name: string;
  readonly source: ReviewSource;
  listReviews(params: ListReviewsParams): Promise<ExternalReviewData[]>;
  getReview(externalId: string, params: ListReviewsParams): Promise<ExternalReviewData | null>;
}
