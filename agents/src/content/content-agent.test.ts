import { describe, expect, it } from 'vitest';
import { MockModelProvider } from '@citadel/integrations/models';
import {
  MalformedModelResponseError,
  ModelProviderError,
  type GenerateParams,
  type GenerateResult,
  type ModelProvider,
  type ModelProviderCapabilities,
  NotImplementedError,
} from '@citadel/shared';
import { makeTestClient } from '../test-fixtures.js';
import { ContentAgent } from './content-agent.js';

/** Always returns a response with no structured field, simulating a model that ignored the JSON-only instruction. */
class MalformedResponseProvider implements ModelProvider {
  readonly name = 'fake-malformed';
  readonly capabilities: ModelProviderCapabilities = { structuredOutput: true, toolCalling: false };
  async generate(_params: GenerateParams): Promise<GenerateResult> {
    return { text: 'Sure! Here is your post.', model: 'fake-model', provider: this.name, stopReason: 'end_turn' };
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

describe('ContentAgent', () => {
  it('generates structured content mentioning only facts present on the client context', async () => {
    const agent = new ContentAgent(new MockModelProvider());
    const client = makeTestClient();

    const result = await agent.run(
      { platform: 'facebook', topic: 'our new widget installation service', previousContent: [] },
      { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-1' },
    );

    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content).toContain('Test Client Co');
    expect(result.contentType).toBe('SOCIAL_POST');
    expect(result.platform).toBe('facebook');
    expect(result.providerUsed).toBe('mock');
    expect(Array.isArray(result.hashtags)).toBe(true);
    expect(Array.isArray(result.seoKeywordsUsed)).toBe(true);
    expect(Array.isArray(result.notes)).toBe(true);
    // Never invents a phone number that isn't the client's.
    expect(result.content).not.toMatch(/\(555\)/);
  });

  it('reports unsupported platforms honestly instead of generating an unspecified shape for them', async () => {
    const agent = new ContentAgent(new MockModelProvider());
    const client = makeTestClient();
    const context = { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-2' };

    await expect(
      agent.run({ platform: 'instagram', topic: 'a photo update', previousContent: [] }, context),
    ).rejects.toThrow(NotImplementedError);
  });

  it('includes previous content in the prompt without it appearing verbatim in the output', async () => {
    const agent = new ContentAgent(new MockModelProvider());
    const client = makeTestClient();

    const result = await agent.run(
      {
        platform: 'facebook',
        topic: 'a septic tank pumping job we just finished',
        previousContent: ['A completely unrelated previous post body that should not be echoed back.'],
      },
      { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-3' },
    );

    expect(result.content).not.toContain('A completely unrelated previous post body');
  });

  it('throws MalformedModelResponseError instead of fabricating structured content when the model returns none', async () => {
    const agent = new ContentAgent(new MalformedResponseProvider());
    const client = makeTestClient();

    await expect(
      agent.run(
        { platform: 'facebook', topic: 'anything', previousContent: [] },
        { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-4' },
      ),
    ).rejects.toThrow(MalformedModelResponseError);
  });

  it('propagates a model provider failure rather than returning a fake success', async () => {
    const agent = new ContentAgent(new FailingProvider());
    const client = makeTestClient();

    await expect(
      agent.run(
        { platform: 'facebook', topic: 'anything', previousContent: [] },
        { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-5' },
      ),
    ).rejects.toThrow(ModelProviderError);
  });
});
