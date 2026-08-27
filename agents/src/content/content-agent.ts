import { MalformedModelResponseError, NotImplementedError, type Agent, type AgentContext, type ModelProvider } from '@citadel/shared';
import { contentPromptV1 } from '@citadel/prompts';
import { PLATFORM_TO_CONTENT_TYPE, SUPPORTED_GENERATION_PLATFORMS, type ContentAgentInput, type ContentAgentOutput } from './types.js';

/**
 * Generates marketing content in the client's brand voice, using only
 * facts present on the client's context (never its own DB access — see
 * AgentContext.client). Delegates all model calls to the injected
 * ModelProvider and always requests structured output (see
 * prompts/src/content/v1.ts's ContentGenerationResultSchema) — this class
 * validates the parsed result against that same schema before returning,
 * since the provider layer only guarantees "valid JSON," not "valid
 * content-generation shape."
 */
export class ContentAgent implements Agent<ContentAgentInput, ContentAgentOutput> {
  readonly name = 'content-agent';
  readonly description = 'Generates on-brand marketing content (Facebook posts today; other platforms are planned) for a client.';

  constructor(private readonly modelProvider: ModelProvider) {}

  async run(input: ContentAgentInput, context: AgentContext): Promise<ContentAgentOutput> {
    if (!SUPPORTED_GENERATION_PLATFORMS.has(input.platform)) {
      throw new NotImplementedError(`${input.platform} content generation`);
    }

    const system = contentPromptV1.buildContentSystemPrompt(context.client);
    const userMessage = contentPromptV1.buildContentUserPrompt(
      context.client,
      'FACEBOOK',
      input.topic,
      input.userInstructions,
      input.previousContent,
    );

    const result = await this.modelProvider.generate({
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 600,
      temperature: 0.6,
      responseSchema: contentPromptV1.CONTENT_OUTPUT_JSON_SCHEMA,
    });

    if (result.structured === undefined) {
      throw new MalformedModelResponseError(result.provider, 'no structured output was returned');
    }
    const parsed = contentPromptV1.ContentGenerationResultSchema.safeParse(result.structured);
    if (!parsed.success) {
      throw new MalformedModelResponseError(result.provider, parsed.error.message);
    }

    return {
      platform: input.platform,
      contentType: PLATFORM_TO_CONTENT_TYPE[input.platform],
      content: parsed.data.content,
      hashtags: parsed.data.hashtags,
      cta: parsed.data.cta,
      seoKeywordsUsed: parsed.data.seo_keywords_used,
      notes: parsed.data.notes,
      modelUsed: result.model,
      providerUsed: result.provider,
      usage: result.usage,
    };
  }
}
