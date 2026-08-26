import type { Agent, AgentContext, ModelProvider } from '@citadel/shared';
import { buildContentSystemPrompt, buildContentUserMessage } from './prompt.js';
import { PLATFORM_TO_CONTENT_TYPE, type ContentAgentInput, type ContentAgentOutput } from './types.js';

/**
 * Generates marketing content (social posts, captions, GBP posts, etc.) in
 * the client's brand voice, using only facts present on the client profile.
 * Delegates all model calls to the injected ModelProvider — this class has
 * no knowledge of which vendor is behind it.
 */
export class ContentAgent implements Agent<ContentAgentInput, ContentAgentOutput> {
  readonly name = 'content-agent';
  readonly description = 'Generates on-brand marketing content (social posts, captions, blog copy, email) for a client.';

  constructor(private readonly modelProvider: ModelProvider) {}

  async run(input: ContentAgentInput, context: AgentContext): Promise<ContentAgentOutput> {
    const system = buildContentSystemPrompt(context.client, input.platform);
    const userMessage = buildContentUserMessage(context.client, input.platform, input.instruction);

    const result = await this.modelProvider.generate({
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 600,
      temperature: 0.6,
    });

    return {
      body: result.text,
      contentType: PLATFORM_TO_CONTENT_TYPE[input.platform],
      platform: input.platform,
      modelUsed: result.model,
      providerUsed: result.provider,
    };
  }
}
