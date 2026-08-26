import { NotConfiguredError } from '@citadel/shared';
import type { PublishAdapter, PublishRequest, PublishResult } from './types.js';

/**
 * Real Facebook Page publishing adapter — NOT YET IMPLEMENTED. This is a
 * clean seam for the future integration described in the master spec
 * ("future social media publishing"). It intentionally refuses to run
 * rather than silently falling back to a mock, so nothing can be mistaken
 * for a real publish. Wire up the Graph API call here once
 * FACEBOOK_PAGE_ACCESS_TOKEN is issued and the integration is scoped.
 */
export class FacebookAdapter implements PublishAdapter {
  readonly name = 'facebook';

  constructor(private readonly pageAccessToken: string | undefined) {}

  async publish(_request: PublishRequest): Promise<PublishResult> {
    if (!this.pageAccessToken) {
      throw new NotConfiguredError('Facebook publishing');
    }
    throw new NotConfiguredError(
      'Facebook publishing (adapter has credentials but the Graph API call is not implemented yet)',
    );
  }
}
