export type SocialPlatform = 'facebook' | 'instagram' | 'google_business';

export interface PublishRequest {
  platform: SocialPlatform;
  body: string;
  metadata: Record<string, unknown>;
}

export interface PublishResult {
  /** The ID assigned by the external platform, or a clearly-labeled mock ID. */
  externalId: string;
  /** Name of the adapter that handled the publish, e.g. "mock" or "facebook". */
  provider: string;
  /** True when this was NOT a real external publish (development/testing only). */
  isMock: boolean;
  publishedAt: Date;
}

export interface PublishAdapter {
  readonly name: string;
  publish(request: PublishRequest): Promise<PublishResult>;
}
