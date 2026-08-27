import { NotConfiguredError, type ModelProvider } from '@citadel/shared';
import { AnthropicProvider } from './anthropic-provider.js';
import { MockModelProvider } from './mock-provider.js';

export interface ModelProviderConfig {
  provider?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  timeoutMs?: number;
}

/**
 * Resolves the ModelProvider to use from configuration. Defaults to the mock
 * provider whenever no Anthropic API key is present, so local dev and CI
 * never require secrets to run. Set MODEL_PROVIDER=anthropic (with
 * ANTHROPIC_API_KEY) to use the real model.
 *
 * Called once at application startup (apps/api/src/container.ts) — a
 * missing key fails the process immediately and loudly rather than
 * deferring to the first request, so a misconfigured deployment can never
 * silently pretend AI generation is working.
 */
export function createModelProvider(config: ModelProviderConfig): ModelProvider {
  const requested = config.provider ?? 'mock';

  if (requested === 'anthropic') {
    if (!config.anthropicApiKey) {
      throw new NotConfiguredError(
        'Anthropic model provider — ANTHROPIC_API_KEY is required when MODEL_PROVIDER=anthropic. Use MODEL_PROVIDER=mock for local development without a key',
      );
    }
    return new AnthropicProvider({
      apiKey: config.anthropicApiKey,
      model: config.anthropicModel ?? 'claude-sonnet-5',
      timeoutMs: config.timeoutMs,
    });
  }

  return new MockModelProvider();
}

export function createModelProviderFromEnv(env: NodeJS.ProcessEnv = process.env): ModelProvider {
  return createModelProvider({
    provider: env.MODEL_PROVIDER,
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    anthropicModel: env.ANTHROPIC_MODEL,
    timeoutMs: env.MODEL_TIMEOUT_MS ? Number(env.MODEL_TIMEOUT_MS) : undefined,
  });
}
