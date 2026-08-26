import type { PublishAdapter } from './types.js';
import { MockPublishAdapter } from './mock-publish-adapter.js';
import { FacebookAdapter } from './facebook-adapter.js';

export interface PublishAdapterConfig {
  provider?: string;
  facebookPageAccessToken?: string;
}

export function createPublishAdapter(config: PublishAdapterConfig): PublishAdapter {
  const requested = config.provider ?? 'mock';
  if (requested === 'facebook') {
    return new FacebookAdapter(config.facebookPageAccessToken);
  }
  return new MockPublishAdapter();
}

export function createPublishAdapterFromEnv(env: NodeJS.ProcessEnv = process.env): PublishAdapter {
  return createPublishAdapter({
    provider: env.PUBLISH_PROVIDER,
    facebookPageAccessToken: env.FACEBOOK_PAGE_ACCESS_TOKEN || undefined,
  });
}
