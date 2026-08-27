import Anthropic from '@anthropic-ai/sdk';
import {
  MalformedModelResponseError,
  ModelProviderError,
  type GenerateParams,
  type GenerateResult,
  type ModelProvider,
  type ModelProviderCapabilities,
} from '@citadel/shared';
import { extractJson } from './json-extraction.js';

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  /** Per-request timeout. Defaults to 30s — a hung request must fail loudly, not hang the caller forever. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Real Claude-backed implementation of ModelProvider. This is the only file
 * in the codebase that imports the Anthropic SDK directly — agents depend on
 * the ModelProvider interface instead, so switching providers later never
 * touches business logic.
 *
 * Structured output: the Messages API has no strict JSON mode, so
 * "structured" here means the caller's system prompt instructs JSON-only
 * output (see prompts/src/content/v1.ts) and this provider best-effort
 * extracts/parses it (extractJson). If that fails, it throws
 * MalformedModelResponseError rather than returning `structured: undefined`
 * and letting a caller silently treat missing structured output as success.
 */
export class AnthropicProvider implements ModelProvider {
  readonly name = 'anthropic';
  readonly capabilities: ModelProviderCapabilities = { structuredOutput: true, toolCalling: false };
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: params.maxTokens ?? 1024,
          temperature: params.temperature ?? 0.7,
          system: params.system,
          messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
        },
        { signal: controller.signal },
      );
    } catch (error) {
      const reason = controller.signal.aborted ? `timed out after ${this.timeoutMs}ms` : String(error);
      throw new ModelProviderError(this.name, reason);
    } finally {
      clearTimeout(timeout);
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    const result: GenerateResult = {
      text,
      model: response.model,
      provider: this.name,
      stopReason: response.stop_reason ?? 'unknown',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };

    if (params.responseSchema) {
      const parsed = extractJson(text);
      if (parsed === null) {
        throw new MalformedModelResponseError(this.name, 'response was not valid JSON');
      }
      result.structured = parsed;
    }

    return result;
  }
}
