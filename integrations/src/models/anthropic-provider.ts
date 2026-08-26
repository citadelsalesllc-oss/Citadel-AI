import Anthropic from '@anthropic-ai/sdk';
import type { GenerateParams, GenerateResult, ModelProvider } from '@citadel/shared';

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
}

/**
 * Real Claude-backed implementation of ModelProvider. This is the only file
 * in the codebase that imports the Anthropic SDK directly — agents depend on
 * the ModelProvider interface instead, so switching providers later never
 * touches business logic.
 */
export class AnthropicProvider implements ModelProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model;
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: params.maxTokens ?? 1024,
      temperature: params.temperature ?? 0.7,
      system: params.system,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    return {
      text,
      model: response.model,
      provider: this.name,
      stopReason: response.stop_reason ?? 'unknown',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
