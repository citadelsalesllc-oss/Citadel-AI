import { NotConfiguredError } from '@citadel/shared';

export interface GoogleBusinessPost {
  clientId: string;
  body: string;
  ctaUrl?: string;
}

export interface GoogleBusinessPostResult {
  externalId: string;
  publishedAt: Date;
}

/**
 * Google Business Profile integration — NOT YET IMPLEMENTED. Listed in the
 * master spec as future work ("future Google Business Profile
 * integration"). This adapter exists as the clean seam future work will
 * fill in (OAuth flow + GBP API calls); it deliberately always refuses
 * rather than faking a post.
 */
export class GoogleBusinessAdapter {
  constructor(
    private readonly clientId: string | undefined,
    private readonly clientSecret: string | undefined,
  ) {}

  async createPost(_post: GoogleBusinessPost): Promise<GoogleBusinessPostResult> {
    if (!this.clientId || !this.clientSecret) {
      throw new NotConfiguredError('Google Business Profile integration');
    }
    throw new NotConfiguredError('Google Business Profile integration (OAuth + API call not implemented yet)');
  }
}
