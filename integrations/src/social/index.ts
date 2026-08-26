export type { PublishAdapter, PublishRequest, PublishResult, SocialPlatform } from './types.js';
export { MockPublishAdapter } from './mock-publish-adapter.js';
export { FacebookAdapter } from './facebook-adapter.js';
export { createPublishAdapter, createPublishAdapterFromEnv } from './factory.js';
export type { PublishAdapterConfig } from './factory.js';
