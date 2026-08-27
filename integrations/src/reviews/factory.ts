import type { ReviewProvider } from './types.js';
import { MockReviewProvider } from './mock-review-provider.js';
import { GoogleBusinessReviewProvider } from './google-business-review-provider.js';

export interface ReviewProviderConfig {
  provider?: string;
  googleAccessToken?: string;
  googleLocationId?: string;
}

/** The only place that decides which ReviewProvider implementation is live — same "one switch point" pattern as createModelProvider/createPublishAdapter. */
export function createReviewProvider(config: ReviewProviderConfig): ReviewProvider {
  const requested = config.provider ?? 'mock';
  if (requested === 'google_business') {
    return new GoogleBusinessReviewProvider({ accessToken: config.googleAccessToken, locationId: config.googleLocationId });
  }
  return new MockReviewProvider();
}

export function createReviewProviderFromEnv(env: NodeJS.ProcessEnv = process.env): ReviewProvider {
  return createReviewProvider({
    provider: env.REVIEW_PROVIDER,
    googleAccessToken: env.GOOGLE_BUSINESS_ACCESS_TOKEN || undefined,
    googleLocationId: env.GOOGLE_BUSINESS_LOCATION_ID || undefined,
  });
}
