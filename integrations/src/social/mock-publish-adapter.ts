import { randomUUID } from 'node:crypto';
import type { PublishAdapter, PublishRequest, PublishResult } from './types.js';

/**
 * Development/testing publish adapter. It never contacts a real social
 * network — it simulates a successful publish and clearly labels the result
 * as a mock (isMock: true, "mock-" prefixed external ID) so nothing
 * downstream can mistake it for a real publication.
 */
export class MockPublishAdapter implements PublishAdapter {
  readonly name = 'mock';

  async publish(request: PublishRequest): Promise<PublishResult> {
    return {
      externalId: `mock-${request.platform}-${randomUUID()}`,
      provider: this.name,
      isMock: true,
      publishedAt: new Date(),
    };
  }
}
