import { describe, expect, it } from 'vitest';
import { MockModelProvider } from '@citadel/integrations/models';
import {
  MalformedModelResponseError,
  ModelProviderError,
  type GenerateParams,
  type GenerateResult,
  type ModelProvider,
  type ModelProviderCapabilities,
  type Review,
} from '@citadel/shared';
import { makeTestClient } from '../test-fixtures.js';
import { ReviewResponseAgent } from './review-response-agent.js';

function makeReview(overrides: Partial<Review> = {}): Review {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'review_test_1',
    clientId: 'client_test_1',
    externalId: 'ext-1',
    source: 'MOCK',
    reviewerName: 'T.C.',
    rating: 5,
    reviewText: 'Excellent widget installation, very professional crew.',
    reviewDate: now,
    responseStatus: 'UNRESPONDED',
    responseText: null,
    responseDate: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Always returns a response with no structured field, simulating a model that ignored the JSON-only instruction. */
class MalformedResponseProvider implements ModelProvider {
  readonly name = 'fake-malformed';
  readonly capabilities: ModelProviderCapabilities = { structuredOutput: true, toolCalling: false };
  async generate(_params: GenerateParams): Promise<GenerateResult> {
    return { text: 'Sure! Here is your reply.', model: 'fake-model', provider: this.name, stopReason: 'end_turn' };
  }
}

/** Always throws, simulating a network/API failure from the underlying provider. */
class FailingProvider implements ModelProvider {
  readonly name = 'fake-failing';
  readonly capabilities: ModelProviderCapabilities = { structuredOutput: true, toolCalling: false };
  async generate(_params: GenerateParams): Promise<GenerateResult> {
    throw new ModelProviderError(this.name, 'connection reset');
  }
}

describe('ReviewResponseAgent', () => {
  it('drafts a warm, appreciative response to a positive review', async () => {
    const agent = new ReviewResponseAgent(new MockModelProvider());
    const client = makeTestClient();
    const review = makeReview({ rating: 5 });

    const result = await agent.run({ review }, { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-1' });

    expect(result.response.length).toBeGreaterThan(0);
    expect(result.response).toContain('Test Client Co');
    expect(result.tone).toContain('warm');
    expect(result.escalationNeeded).toBe(false);
    expect(result.providerUsed).toBe('mock');
    expect(Array.isArray(result.evidence)).toBe(true);
    // Never invents a phone number that isn't the client's.
    expect(result.response).not.toMatch(/\(555\)/);
  });

  it('drafts a professional, apologetic response to a negative review', async () => {
    const agent = new ReviewResponseAgent(new MockModelProvider());
    const client = makeTestClient();
    const review = makeReview({ rating: 1, reviewText: 'Overcharged and the crew was late. Very disappointed.' });

    const result = await agent.run({ review }, { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-2' });

    expect(result.tone).toContain('apologetic');
    expect(result.response.toLowerCase()).toContain('sorry');
  });

  it('drafts a de-escalating response and flags escalation for a serious complaint', async () => {
    const agent = new ReviewResponseAgent(new MockModelProvider());
    const client = makeTestClient();
    const review = makeReview({ rating: 1, reviewText: 'I am speaking with a lawyer about a possible lawsuit over this.' });

    const result = await agent.run({ review }, { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-3' });

    expect(result.escalationNeeded).toBe(true);
    expect(result.tone).toContain('de-escalating');
  });

  it('includes the client phone in the CTA when one is on file and the review needs follow-up', async () => {
    const agent = new ReviewResponseAgent(new MockModelProvider());
    const client = makeTestClient();
    const review = makeReview({ rating: 2, reviewText: 'Not happy with the pricing.' });

    const result = await agent.run({ review }, { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-4' });

    expect(result.cta).toContain(client.core.phone as string);
  });

  it('throws MalformedModelResponseError instead of fabricating a response when the model returns none', async () => {
    const agent = new ReviewResponseAgent(new MalformedResponseProvider());
    const client = makeTestClient();
    const review = makeReview();

    await expect(
      agent.run({ review }, { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-5' }),
    ).rejects.toThrow(MalformedModelResponseError);
  });

  it('propagates a model provider failure rather than returning a fake success', async () => {
    const agent = new ReviewResponseAgent(new FailingProvider());
    const client = makeTestClient();
    const review = makeReview();

    await expect(
      agent.run({ review }, { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-6' }),
    ).rejects.toThrow(ModelProviderError);
  });
});
